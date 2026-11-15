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
  noPreview?: boolean;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchChannelMessages(
  channelUsername: string,
  before?: string,
  signal?: AbortSignal
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
        signal,
      },
      6000
    );

    // 301/302 без '/s/' означает, что веб-просмотр отключён или канал закрытый
    if (res.status === 301 || res.status === 302) {
      const loc = res.headers.get('location') || '';
      if (!loc.includes('/s/')) {
        return {
          channel: cleanUsername,
          messages: [],
          noPreview: true,
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
      const dataPost = $msg.attr('data-post');
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
    if (signal?.aborted) {
      return {
        channel: cleanUsername,
        messages: [],
        error: 'Запрос прерван по таймауту скрейпинга',
      };
    }
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
      console.warn(`[tg-feed] Достигнут лимит времени скрейпинга, остановлен опрос оставшихся ${items.length - i} каналов`);
      break;
    }
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

// 1. Параллельный опрос воркера (Таймаут 6s)
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
    const workerRes = await fetchWithTimeout(targetUrl, { headers }, 6000);
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

  // Rate Limiting по IP
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
  let parsedBody: any = {};

  if (event.httpMethod === 'POST') {
    try {
      parsedBody = JSON.parse(event.body || '{}');
      if (Array.isArray(parsedBody.channels)) {
        channels = parsedBody.channels;
      }
      before = parsedBody.before;
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

  // Адрес и секрет Telegram-воркера
  const rawWorkerUrl = (
    process.env.TG_WORKER_URL ||
    process.env.WORKER_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.WEBHOOK_URL && process.env.WEBHOOK_URL.includes('onrender.com') ? process.env.WEBHOOK_URL : '')
  )?.trim();
  const workerUrl = rawWorkerUrl ? rawWorkerUrl.replace(/\/recent\/?$/, '') : undefined;
  const workerSecret = process.env.WEBHOOK_SECRET?.trim();

  // A4.e: Быстрая ветка action === 'ping'
  const isPingAction = parsedBody?.action === 'ping' || event.queryStringParameters?.action === 'ping';
  if (isPingAction) {
    let workerActive: boolean | null = null;
    if (workerUrl) {
      try {
        const pingRes = await fetchWithTimeout(`${workerUrl.replace(/\/+$/, '')}/`, {}, 2500);
        workerActive = pingRes.ok;
      } catch {
        workerActive = false;
      }
    }
    const pingResp = jsonResponse(200, {
      pong: true,
      workerConfigured: Boolean(workerUrl),
      workerActive,
      timestamp: new Date().toISOString(),
    }, origin);
    pingResp.headers['Cache-Control'] = 'private, no-store';
    return pingResp;
  }

  const startTime = Date.now();
  const deadlineTs = startTime + 7000; // 7.0s порог для скрейпинга
  const scrapeAbort = new AbortController();
  const scrapeTimeoutId = setTimeout(() => scrapeAbort.abort(), 7000);

  // A4.a: Воркер и скрейпинг выполняются независимо со своими дедлайнами
  const workerPromise = workerUrl
    ? fetchWorkerLeads(workerUrl, workerSecret)
    : Promise.resolve({ active: null, leads: [] });

  const uniqueChannels = Array.from(new Set(channels.map((c) => c.trim().toLowerCase()))).slice(0, 15);
  const scrapingPromise =
    uniqueChannels.length > 0
      ? runInPoolWithDeadline(uniqueChannels, 5, deadlineTs, (ch) =>
          fetchChannelMessages(ch, before, scrapeAbort.signal)
        )
      : Promise.resolve([]);

  let workerSettled: PromiseSettledResult<{ active: boolean | null; leads: ParsedMessage[] }>;
  let scrapingSettled: PromiseSettledResult<ChannelFeedResult[]>;

  try {
    const settled = await Promise.allSettled([workerPromise, scrapingPromise]);
    workerSettled = settled[0];
    scrapingSettled = settled[1];
  } finally {
    clearTimeout(scrapeTimeoutId);
  }

  let workerActive: boolean | null = null;
  const allMessages: ParsedMessage[] = [];
  const errors: { channel: string; error: string }[] = [];
  const noPreview: string[] = [];
  const results: ChannelFeedResult[] = [];

  // Обработка ответа воркера
  if (workerSettled.status === 'fulfilled') {
    workerActive = workerSettled.value.active;
    allMessages.push(...workerSettled.value.leads);
  } else {
    workerActive = false;
    errors.push({ channel: 'worker', error: 'Воркер не ответил вовремя' });
  }

  // Обработка результатов веб-скрейпинга (A4.d: 301/302 без /s/ не попадают в errors, а идут в noPreview)
  if (scrapingSettled.status === 'fulfilled') {
    for (const r of scrapingSettled.value) {
      results.push(r);
      if (r.noPreview) {
        noPreview.push(r.channel);
      } else if (r.error) {
        errors.push({ channel: r.channel, error: r.error });
      }
      allMessages.push(...r.messages);
    }
  } else {
    errors.push({ channel: 'scraping', error: 'Скрейпинг частично прерван по таймауту' });
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

  const payload = {
    results,
    allMessages: uniqueMessages,
    scrapedChannels: uniqueChannels,
    noPreview,
    errors,
    totalMessages: uniqueMessages.length,
    workerActive,
    workerConfigured: Boolean(workerUrl),
  };

  const response = jsonResponse(200, payload, origin);
  // A4.c: private, no-store для авторизованного ответа
  response.headers['Cache-Control'] = 'private, no-store';
  return response;
}
