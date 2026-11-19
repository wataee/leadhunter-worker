import crypto from 'crypto';
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  validatePayloadSize,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';
import {
  calculateConnectsRoi,
  generateUpworkProposal,
  parseUpworkPastedText,
  type UpworkJobInput,
} from '../../src/shared/upwork.js';
import { parseBudget } from '../../src/shared/budget.js';
import { matchesVacancy } from '../../src/shared/filter.js';
import { needsRussianTranslation, translateFreeNeural } from '../../src/shared/translate.js';
import type { Vacancy } from '../../src/types';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  body: string | null;
}

const REDIS_UPWORK_KEY = 'leadhunter:upwork_jobs:v1';
let memoryUpworkJobs: Vacancy[] = [];

export function resetMemoryUpworkJobsForTests(): void {
  memoryUpworkJobs = [];
}

export function isSecretAuthorized(event: HandlerEvent): boolean {
  const expected = process.env.WEBHOOK_SECRET?.trim();
  if (!expected || expected.length < 16) {
    console.warn('[Upwork Ingest Auth] WEBHOOK_SECRET не настроен на сервере или короче 16 символов');
    return false;
  }
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = (
    event.headers['x-webhook-secret'] ||
    event.headers['X-Webhook-Secret'] ||
    ''
  ).trim();

  const querySecret = (event.queryStringParameters?.secret || '').trim();
  if (querySecret) {
    console.warn('[Upwork Ingest Auth] Предупреждение: передача секрета в query-параметре запрещена. Используйте заголовок X-Webhook-Secret или Authorization: Bearer.');
  }

  const provided = bearer || headerSecret;
  if (!provided || provided.length < 16) return false;

  const pBuf = crypto.createHash('sha256').update(provided).digest();
  const eBuf = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(pBuf, eBuf);
}

function buildExtensionCors(origin?: string): Record<string, string> {
  if (origin && origin.startsWith('chrome-extension://')) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
    };
  }
  return {};
}

async function readSavedJobs(redisUrl?: string, redisToken?: string): Promise<Vacancy[]> {
  if (!redisUrl || !redisToken) return memoryUpworkJobs;
  const url = redisUrl.replace(/\/$/, '');
  try {
    const idsRes = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['LRANGE', 'leadhunter:upwork:ids', '0', '99']),
      },
      4000
    );
    if (idsRes.ok) {
      const idsData = await idsRes.json();
      if (Array.isArray(idsData?.result) && idsData.result.length > 0) {
        const uniqueIds = Array.from(new Set(idsData.result));
        const keys = uniqueIds.map((id) => `leadhunter:upwork:job_${id}`);
        const mgetRes = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(['MGET', ...keys]),
          },
          4000
        );
        if (mgetRes.ok) {
          const mgetData = await mgetRes.json();
          if (Array.isArray(mgetData?.result)) {
            const parsed = mgetData.result
              .map((str: any) => {
                try {
                  return typeof str === 'string' ? JSON.parse(str) : str;
                } catch {
                  return null;
                }
              })
              .filter(Boolean);
            if (parsed.length > 0) return parsed;
          }
        }
      }
    }

    // Fallback: legacy единый JSON ключ
    const res = await fetchWithTimeout(
      `${url}/get/${encodeURIComponent(REDIS_UPWORK_KEY)}`,
      { headers: { Authorization: `Bearer ${redisToken}` } },
      4000
    );
    if (!res.ok) return memoryUpworkJobs;
    const data = await res.json();
    if (!data?.result) return memoryUpworkJobs;
    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    return Array.isArray(parsed) ? parsed : memoryUpworkJobs;
  } catch {
    return memoryUpworkJobs;
  }
}

async function saveJobAtomically(vacancy: Vacancy, redisUrl?: string, redisToken?: string): Promise<void> {
  memoryUpworkJobs = [vacancy, ...memoryUpworkJobs.filter((x) => x.id !== vacancy.id)].slice(0, 100);
  if (!redisUrl || !redisToken) return;

  const url = redisUrl.replace(/\/$/, '');
  const jobKey = `leadhunter:upwork:job_${vacancy.id}`;
  const listKey = 'leadhunter:upwork:ids';

  try {
    // 1. Сохраняем вакансию отдельно с TTL 14 дней (1209600 сек)
    await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SETEX', jobKey, '1209600', JSON.stringify(vacancy)]),
      },
      4000
    );

    // 2. Атомарно пушим ID в список и обрезаем до 100
    await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['LPUSH', listKey, vacancy.id]),
      },
      4000
    );
    await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['LTRIM', listKey, '0', '99']),
      },
      4000
    );

    // 3. Дублируем в legacy массив для обратной совместимости
    await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', REDIS_UPWORK_KEY, JSON.stringify(memoryUpworkJobs)]),
      },
      4000
    );
  } catch (err: any) {
    console.warn('[Upwork Redis] Ошибка атомарной записи в Redis:', err.message);
  }
}

export async function notifyTelegramIfConfigured(
  vacancy: Vacancy,
  proposalText: string = ''
): Promise<{ sent: boolean; reason?: string }> {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const tgChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!tgToken || !tgChatId) {
    console.warn('[Upwork Telegram] Уведомление не отправлено: TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не настроены.');
    return { sent: false, reason: 'missing_credentials' };
  }

  const budgetStr = vacancy.budget ? `${vacancy.budget.min || vacancy.budget.max || ''} ${vacancy.budget.currency}`.trim() : 'По договорённости';
  const meta = vacancy.upworkMeta;
  const roiBadge = meta?.badgeTextRu || `ROI ${meta?.roiScore || ''}`;
  const verdict = meta?.verdictRu || '';

  const message = [
    `⚡ <b>Новый заказ Upwork: ${vacancy.text.split('\n')[0].slice(0, 70)}</b>`,
    `💰 <b>Бюджет:</b> ${budgetStr || 'По договорённости'}`,
    `📊 <b>Оценка Connects:</b> ${roiBadge}`,
    verdict ? `💡 <i>${verdict}</i>` : '',
    '',
    `📝 <b>Описание:</b>`,
    `${vacancy.text.slice(0, 400).trim()}...`,
    '',
    proposalText ? `⚡ <b>Готовый хук для отклика:</b>\n<pre>${proposalText.slice(0, 300)}</pre>\n` : '',
    `🔗 <a href="${vacancy.url}">Открыть на Upwork</a>`,
  ].filter(Boolean).join('\n');

  const inlineButtons = [
    [
      { text: '🔗 Открыть на Upwork', url: vacancy.url },
      { text: '📥 В воронку', callback_data: `lead:${vacancy.id.slice(0, 45)}` },
    ],
  ];

  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${tgToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: inlineButtons },
        }),
      },
      6000
    );
    if (!res.ok) {
      console.warn(`[Upwork Telegram] Ошибка отправки в Telegram: HTTP ${res.status}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err: any) {
    console.warn(`[Upwork Telegram] Сетевая ошибка при отправке в Telegram: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;
  const extHeaders = buildExtensionCors(origin);

  if (event.httpMethod === 'OPTIONS') {
    const res = handleOptions(origin);
    return { ...res, headers: { ...res.headers, ...extHeaders } };
  }

  const userAuth = requireAuth(event);
  const secretOk = isSecretAuthorized(event);
  if (!userAuth.authenticated && !secretOk) {
    const err = errorResponse(401, 'Требуется авторизация (сессия или WEBHOOK_SECRET)', null, origin);
    return { ...err, headers: { ...err.headers, ...extHeaders } };
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (event.httpMethod === 'GET') {
    const items = await readSavedJobs(redisUrl, redisToken);
    const res = jsonResponse(200, { ok: true, items }, origin);
    return { ...res, headers: { ...res.headers, ...extHeaders } };
  }

  if (event.httpMethod === 'POST') {
    const sizeCheck = validatePayloadSize(event.body, 128 * 1024);
    if (!sizeCheck.valid) {
      const err = errorResponse(400, sizeCheck.error || 'Слишком большой запрос', null, origin);
      return { ...err, headers: { ...err.headers, ...extHeaders } };
    }

    let body: Record<string, any>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      const err = errorResponse(400, 'Некорректный JSON', null, origin);
      return { ...err, headers: { ...err.headers, ...extHeaders } };
    }

    let job: UpworkJobInput;
    if (typeof body.text === 'string' && body.text.trim() && !body.title && !body.description) {
      job = parseUpworkPastedText(body.text);
    } else {
      const parsedFallback =
        typeof body.text === 'string' && body.text.trim()
          ? parseUpworkPastedText(body.text)
          : {};
      job = {
        ...parsedFallback,
        ...body,
        title: String(body.title || parsedFallback.title || 'Upwork Video Editing Job').trim(),
        description: String(body.description || body.text || '').trim(),
        url: String(body.url || parsedFallback.url || 'https://www.upwork.com/nx/find-work/').trim(),
      };
    }

    if (!job.description && !job.title) {
      const err = errorResponse(400, 'Нужно передать описание или текст заказа Upwork', null, origin);
      return { ...err, headers: { ...err.headers, ...extHeaders } };
    }

    const fullText = `${job.title}\n\n${job.description || ''}`.trim();

    // Фильтрация через единый 3-уровневый фильтр (отсекаем full-time, оклад, нецелевые)
    const filterResult = matchesVacancy(fullText, { minScore: 40 });
    if (!filterResult.isMatch) {
      console.log(`[Upwork Ingest] Заказ отсеян фильтром: ${filterResult.reason} («${job.title}»)`);
      const res = jsonResponse(
        200,
        {
          ok: true,
          filtered: true,
          reason: filterResult.reason,
          reasons: filterResult.reasons,
          message: 'Заказ отсеян фильтром качества (не подходит под разовые заказы видеомонтажа)',
        },
        origin
      );
      return { ...res, headers: { ...res.headers, ...extHeaders } };
    }

    const roi = calculateConnectsRoi(job);
    const proposal = generateUpworkProposal(job, body.profile || {});

    const budget = parseBudget(`${job.budget || ''} ${fullText}`);
    const hasLong = /youtube|long[\s-]*form|podcast|documentary|16:9/i.test(fullText);
    const hasShort = /reels|shorts|tiktok|vertical|9:16/i.test(fullText);

    let translatedRu: string | null = null;
    if (!body.skipTranslation && needsRussianTranslation(fullText)) {
      try {
        const tr = await translateFreeNeural(fullText.slice(0, 1200), 'ru', 'en');
        if (tr?.translatedText) {
          translatedRu = tr.translatedText;
        }
      } catch {
        // Ignore MT network outage
      }
    }

    const hashSource = job.url && job.url.includes('/jobs/') ? job.url : `${job.title}:${fullText.slice(0, 120)}`;
    const id =
      job.id ||
      `upwork_${crypto.createHash('sha1').update(hashSource).digest('hex').slice(0, 12)}`;

    const vacancy: Vacancy = {
      id,
      channel: 'Upwork',
      text: fullText.slice(0, 1800),
      url: job.url || 'https://www.upwork.com/nx/find-work/',
      postedAt: new Date().toISOString(),
      views: `${roi.connectsRequired || 0} Connects · ROI ${roi.roiScore}`,
      matchedKeywords: ['Upwork', `ROI ${roi.roiScore}`],
      relevance: roi.roiScore,
      formatTag: hasShort && hasLong ? 'both' : hasShort ? 'short' : 'long',
      qualityTier: roi.roiScore >= 55 ? 'great' : roi.roiScore >= 38 ? 'fair' : 'shady',
      statusBadge: roi.roiScore >= 75 ? 'hot' : 'new',
      region: 'US',
      sourcePlatform: 'upwork',
      upworkMeta: {
        roiScore: roi.roiScore,
        recommendation: roi.recommendation,
        badgeTextRu: roi.badgeTextRu,
        verdictRu: roi.verdictRu,
        connectsRequired: roi.connectsRequired,
        connectsCostUsd: roi.connectsCostUsd,
        redFlags: roi.redFlags,
        greenFlags: roi.greenFlags,
      },
      translatedText: translatedRu || undefined,
      budget,
      seen: false,
      hidden: false,
    };

    if (body.saveToFeed !== false) {
      await saveJobAtomically(vacancy, redisUrl, redisToken);
    }

    // Отправка уведомления в Telegram-бота с готовым хуком отклика
    let telegramResult = { sent: false };
    if (body.notifyTelegram !== false) {
      telegramResult = await notifyTelegramIfConfigured(
        vacancy,
        proposal?.coverLetter || proposal?.previewAnalysis?.first200Chars || ''
      );
    }

    const res = jsonResponse(
      200,
      {
        ok: true,
        job,
        roi,
        proposal,
        translatedRu,
        vacancy,
        telegram: telegramResult,
      },
      origin
    );
    return { ...res, headers: { ...res.headers, ...extHeaders } };
  }

  const err = errorResponse(405, 'Метод не поддерживается', null, origin);
  return { ...err, headers: { ...err.headers, ...extHeaders } };
}
