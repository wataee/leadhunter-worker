import * as cheerio from 'cheerio';
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkDistributedRateLimit,
  validatePayloadSize,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';

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
  budget?: any;
  fromWorker?: boolean;
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
  const cleanUsername = channelUsername
    .trim()
    .replace(/^@/, '')
    .replace(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?/, '')
    .replace(/\/$/, '')
    .toLowerCase();

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
        redirect: 'manual',
      },
      6000
    );

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

    const emptyNotice = $('.tgme_channel_info_header_title').text();
    if (!emptyNotice && html.includes('If you have Telegram, you can view and join')) {
      return {
        channel: cleanUsername,
        messages: [],
        error: 'Канал не существует или заблокирован',
      };
    }

    const messages: ParsedMessage[] = [];

    $('.tgme_widget_message_wrap').each((_, elem) => {
      const $el = $(elem);
      const $msg = $el.find('.tgme_widget_message');
      const dataPost = $msg.attr('data-post'); // e.g. "jobchannel/1234"
      if (!dataPost) return;

      const [postChannel, postMsgId] = dataPost.split('/');
      const cleanCh = (postChannel || cleanUsername).toLowerCase();
      const numId = postMsgId || dataPost;
      const normalizedId = `tg_${cleanCh}_${numId}`;
      const postUrl = `https://t.me/${dataPost}`;

      const $textEl = $msg.find('.tgme_widget_message_text');
      $textEl.find('br').replaceWith('\n');
      const text = $textEl.text().trim();

      if (!text) return;

      const $timeEl = $msg.find('time.time');
      const rawDate = $timeEl.attr('datetime') || new Date().toISOString();
      const views = $msg.find('.tgme_widget_message_views').text().trim() || '0';

      messages.push({
        id: normalizedId,
        channel: cleanUsername,
        text,
        url: postUrl,
        postedAt: rawDate,
        views,
        fromWorker: false,
      });
    });

    return {
      channel: cleanUsername,
      messages: messages.reverse(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка запроса к Telegram';
    return {
      channel: cleanUsername,
      messages: [],
      error: msg.includes('aborted') ? 'Таймаут подключения к Telegram' : msg,
    };
  }
}

async function runInPoolWithDeadline<T, R>(
  items: T[],
  limit: number,
  deadlineTs: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    if (Date.now() >= deadlineTs) {
      console.warn(`[tg-feed] Достигнут лимит 7.5с, остановлен опрос оставшихся ${items.length - i} каналов`);
      break;
    }
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

// 1. Параллельный опрос воркера (Таймаут 7s)
async function fetchWorkerLeads(
  workerUrl: string,
  secret?: string
): Promise<{ active: boolean | null; leads: ParsedMessage[] }> {
  try {
    const headers: Record<string, string> = {};
    if (secret) {
      headers['X-Webhook-Secret'] = secret;
    }

    const targetUrl = `${workerUrl.replace(/\/+$/, '')}/recent`;
    const workerRes = await fetchWithTimeout(targetUrl, { headers }, 7000);
    if (!workerRes.ok) {
      console.warn(`[tg-feed] Ошибка ответа воркера HTTP ${workerRes.status} (${targetUrl})`);
      return { active: false, leads: [] };
    }

    const data = await workerRes.json();
    const leads: ParsedMessage[] = [];

    if (Array.isArray(data.leads)) {
      for (const l of data.leads) {
        leads.push({
          id: l.id || `tg_worker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          channel: l.channel || 'Telegram Chat',
          text: l.text || '',
          url: l.url || '',
          postedAt: l.postedAt || new Date().toISOString(),
          views: 'MTProto 24/7',
          budget: l.budget || null,
          fromWorker: true,
        });
      }
    }

    return { active: true, leads };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tg-feed] Не удалось подключиться к воркеру (${workerUrl}): ${msg}`);
    return { active: false, leads: [] };
  }
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // 1.3 Проверка авторизации
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  // Rate Limiting по IP (распределённый через Upstash Redis или in-memory)
  const clientIp =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = await checkDistributedRateLimit(clientIp, 60, 60 * 1000);
  if (!rateCheck.allowed) {
    return errorResponse(429, 'Слишком много запросов. Подождите минуту.', null, origin);
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

  // Поддержка различных вариантов имени переменной для гибкости конфигурации
  const rawWorkerUrl = (
    process.env.TG_WORKER_URL ||
    process.env.WORKER_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.WEBHOOK_URL && process.env.WEBHOOK_URL.includes('onrender.com') ? process.env.WEBHOOK_URL : '')
  )?.trim();
  const workerUrl = rawWorkerUrl ? rawWorkerUrl.replace(/\/recent\/?$/, '') : undefined;
  const workerSecret = process.env.WEBHOOK_SECRET?.trim();

  if (workerUrl && (!workerSecret || workerSecret.length < 16)) {
    console.warn('[tg-feed] Предупреждение: WEBHOOK_SECRET не настроен или короче 16 символов в Netlify.');
  }

  const startTime = Date.now();
  const deadlineTs = startTime + 7500; // 7.5s порог для скрейпинга

  // 3.1 Общий дедлайн 8.0с через AbortController + Promise.race
  const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
    setTimeout(() => resolve({ timeout: true }), 8000)
  );

  const executeFeedJob = async () => {
    // Параллельный опрос воркера и скрейпинга через Promise.allSettled
    const workerPromise = workerUrl
      ? fetchWorkerLeads(workerUrl, workerSecret)
      : Promise.resolve({ active: null, leads: [] });

    const uniqueChannels = Array.from(new Set(channels.map((c) => c.trim().toLowerCase()))).slice(0, 15);
    const scrapingPromise =
      uniqueChannels.length > 0
        ? runInPoolWithDeadline(uniqueChannels, 5, deadlineTs, (ch) => fetchChannelMessages(ch, before))
        : Promise.resolve([]);

    const [workerSettled, scrapingSettled] = await Promise.allSettled([workerPromise, scrapingPromise]);

    let workerActive: boolean | null = null;
    const allMessages: ParsedMessage[] = [];
    const errors: { channel: string; error: string }[] = [];
    const results: ChannelFeedResult[] = [];

    // Обработка ответа воркера
    if (workerSettled.status === 'fulfilled') {
      workerActive = workerSettled.value.active;
      allMessages.push(...workerSettled.value.leads);
    }

    // Обработка результатов веб-скрейпинга
    if (scrapingSettled.status === 'fulfilled') {
      for (const r of scrapingSettled.value) {
        results.push(r);
        if (r.error && !r.error.includes('редирект с /s/')) {
          errors.push({ channel: r.channel, error: r.error });
        }
        allMessages.push(...r.messages);
      }
    }

    // Дедупликация: по стабильному id и по нормализованному началу текста
    const seenIds = new Set<string>();
    const seenTexts = new Set<string>();
    const uniqueMessages: ParsedMessage[] = [];

    for (const m of allMessages) {
      const normText = m.text.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
      if (seenIds.has(m.id) || seenTexts.has(normText)) {
        continue;
      }
      seenIds.add(m.id);
      seenTexts.add(normText);
      uniqueMessages.push(m);
    }

    uniqueMessages.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

    return {
      results,
      allMessages: uniqueMessages,
      errors,
      totalMessages: uniqueMessages.length,
      workerActive,
      workerConfigured: Boolean(workerUrl),
    };
  };

  const raceResult = await Promise.race([executeFeedJob(), timeoutPromise]);

  let payload;
  if ('timeout' in raceResult) {
    console.warn('[tg-feed] Превышен общий таймаут 8.0с, отдаём частичные данные');
    payload = {
      results: [],
      allMessages: [],
      errors: [{ channel: 'all', error: 'Превышен таймаут ответа 8 секунд' }],
      totalMessages: 0,
      workerActive: false,
    };
  } else {
    payload = raceResult;
  }

  const response = jsonResponse(200, payload, origin);
  // 3.1 Кэширование ответа на 20-30 секунд
  response.headers['Cache-Control'] = 'public, max-age=20, stale-while-revalidate=10';
  return response;
}
