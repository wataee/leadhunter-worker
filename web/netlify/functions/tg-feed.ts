import * as cheerio from 'cheerio';
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkRateLimit,
  validatePayloadSize,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  queryStringParameters?: Record<string, string>;
}

interface ParsedMessage {
  id: string;
  channel: string;
  text: string;
  url: string;
  postedAt: string;
  views: string;
}

interface ChannelFeedResult {
  channel: string;
  messages: ParsedMessage[];
  error?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchChannelMessages(
  channelUsername: string,
  before?: string
): Promise<ChannelFeedResult> {
  const cleanUsername = channelUsername.trim().replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?/, '').replace(/\/$/, '');
  if (!cleanUsername) {
    return { channel: channelUsername, messages: [], error: 'Пустой юзернейм канала' };
  }

  let url = `https://t.me/s/${cleanUsername}`;
  if (before) {
    url += `?before=${before}`;
  }

  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        redirect: 'manual', // Detect preview redirect
      },
      8000
    );

    // If redirected to t.me/username without /s/, preview is disabled
    if (res.status === 301 || res.status === 302) {
      const loc = res.headers.get('location') || '';
      if (!loc.includes('/s/')) {
        return {
          channel: cleanUsername,
          messages: [],
          error: 'В канале отключён веб-просмотр или канал закрытый (редирект с /s/)',
        };
      }
    }

    if (!res.ok) {
      if (res.status === 404) {
        return { channel: cleanUsername, messages: [], error: 'Канал не найден' };
      }
      return { channel: cleanUsername, messages: [], error: `Код ответа Telegram: ${res.status}` };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Check if channel exists or telegram error page
    const emptyNotice = $('.tgme_channel_info_header_title').text();
    if (!emptyNotice && html.includes('If you have Telegram, you can view and join')) {
      // Empty or no messages
    }

    const messages: ParsedMessage[] = [];
    $('.tgme_widget_message_wrap').each((_, elem) => {
      const $el = $(elem);
      const $msg = $el.find('.tgme_widget_message');
      const dataPost = $msg.attr('data-post'); // e.g. "jobchannel/1234"
      if (!dataPost) return;

      const postId = dataPost.replace('/', '_');
      const postUrl = `https://t.me/${dataPost}`;

      // Extract text
      const $textEl = $msg.find('.tgme_widget_message_text');
      // Replace <br> with newlines for clean formatting
      $textEl.find('br').replaceWith('\n');
      const text = $textEl.text().trim();

      if (!text) return; // skip photo-only without caption

      // Time
      const $timeEl = $msg.find('time.time');
      const rawDate = $timeEl.attr('datetime') || new Date().toISOString();

      // Views
      const views = $msg.find('.tgme_widget_message_views').text().trim() || '0';

      messages.push({
        id: `tg_${postId}`,
        channel: cleanUsername,
        text,
        url: postUrl,
        postedAt: rawDate,
        views,
      });
    });

    return {
      channel: cleanUsername,
      messages: messages.reverse(), // latest first
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка запроса к Telegram';
    return {
      channel: cleanUsername,
      messages: [],
      error: msg.includes('aborted') ? 'Таймаут подключения к Telegram (8 сек)' : msg,
    };
  }
}

// Chunk helper for max 5 parallel requests
async function runInPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // Rate Limiting по IP
  const clientIp =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = checkRateLimit(clientIp, 60, 60_000);
  if (!rateCheck.allowed) {
    return errorResponse(429, 'Слишком много запросов. Пожалуйста, подождите минуту.', null, origin);
  }

  // Проверка размера тела запроса (макс 32 КБ)
  const sizeValidation = validatePayloadSize(event.body, 32 * 1024);
  if (!sizeValidation.valid) {
    return errorResponse(400, sizeValidation.error || 'Слишком большой запрос', null, origin);
  }

  let channels: string[] = [];
  let before: string | undefined = undefined;

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      if (Array.isArray(body.channels)) {
        channels = body.channels;
      }
      before = body.before;
    } catch {
      return errorResponse(400, 'Некорректный JSON', null, origin);
    }
  } else if (event.httpMethod === 'GET') {
    const chParam = event.queryStringParameters?.channels;
    if (chParam) {
      channels = chParam.split(',').map((s) => s.trim()).filter(Boolean);
    }
    before = event.queryStringParameters?.before;
  } else {
    return errorResponse(405, 'Метод не поддерживается', null, origin);
  }

  const allMessages: ParsedMessage[] = [];
  const errors: { channel: string; error: string }[] = [];
  const results: ChannelFeedResult[] = [];

  // 1. Fetch live leads captured by 24/7 Telegram Worker (MTProto on Render)
  const workerUrl = process.env.TG_WORKER_URL;
  let workerActive = false;

  if (workerUrl) {
    try {
      const secret = process.env.WEBHOOK_SECRET?.trim();
      const headers: Record<string, string> = {};
      if (secret) {
        headers['X-Webhook-Secret'] = secret;
      }

      const workerRes = await fetchWithTimeout(`${workerUrl.replace(/\/$/, '')}/recent`, { headers }, 5000);
      if (workerRes.ok) {
        workerActive = true;
        const data = await workerRes.json();
        if (Array.isArray(data.leads) && data.leads.length > 0) {
          for (const l of data.leads) {
            allMessages.push({
              id: l.id || `worker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              channel: l.channel || 'Telegram Chat',
              text: l.text || '',
              url: l.url || '',
              postedAt: l.postedAt || new Date().toISOString(),
              views: 'MTProto 24/7',
            });
          }
        }
      }
    } catch {
      // Worker offline or unreachable
    }
  }

  // 2. Optional: Direct web fetch for requested public channels
  if (channels.length > 0) {
    // Deduplicate channels
    const uniqueChannels = Array.from(new Set(channels.map((c) => c.trim().toLowerCase()))).slice(0, 15);
    const webResults = await runInPool(uniqueChannels, 5, (ch) => fetchChannelMessages(ch, before));

    for (const r of webResults) {
      results.push(r);
      if (r.error) {
        // If worker is running, suppress annoying web-preview redirect errors
        if (!r.error.includes('редирект с /s/')) {
          errors.push({ channel: r.channel, error: r.error });
        }
      }
      allMessages.push(...r.messages);
    }
  }

  // Deduplicate messages by id or text content
  const seenIds = new Set<string>();
  const uniqueMessages = allMessages.filter((m) => {
    if (seenIds.has(m.id) || seenIds.has(m.text.slice(0, 80))) return false;
    seenIds.add(m.id);
    seenIds.add(m.text.slice(0, 80));
    return true;
  });

  // Sort combined messages by date descending
  uniqueMessages.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  return jsonResponse(
    200,
    {
      results,
      allMessages: uniqueMessages,
      errors,
      totalMessages: uniqueMessages.length,
      workerActive,
    },
    origin
  );
}
