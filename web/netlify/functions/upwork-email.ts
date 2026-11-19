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
  type UpworkJobInput,
} from '../../src/shared/upwork.js';
import { parseBudget } from '../../src/shared/budget.js';
import { matchesVacancy } from '../../src/shared/filter.js';
import { parseUpworkEmail } from '../../src/shared/upworkEmailParser';
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

export function resetMemoryUpworkEmailJobsForTests(): void {
  memoryUpworkJobs = [];
}

export function isSecretAuthorized(event: HandlerEvent): boolean {
  const expected = (process.env.WEBHOOK_SECRET || process.env.UPWORK_EMAIL_SECRET || '').trim();
  if (!expected || expected.length < 16) {
    console.warn('[Upwork Email Auth] WEBHOOK_SECRET / UPWORK_EMAIL_SECRET не настроен или короче 16 символов');
    return false;
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const querySecret = (event.queryStringParameters?.secret || '').trim();
  if (querySecret) {
    console.warn('[Upwork Email Auth] Предупреждение: передача секрета в query-параметре запрещена. Используйте заголовок X-Webhook-Secret или Authorization: Bearer.');
  }

  const headerSecret = (
    event.headers['x-webhook-secret'] ||
    event.headers['X-Webhook-Secret'] ||
    ''
  ).trim();

  const provided = bearer || headerSecret;
  if (!provided || provided.length < 16) return false;

  const pBuf = crypto.createHash('sha256').update(provided).digest();
  const eBuf = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(pBuf, eBuf);
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
              .map((str: unknown) => {
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
    await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SETEX', jobKey, '1209600', JSON.stringify(vacancy)]),
      },
      4000
    );
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
    await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', REDIS_UPWORK_KEY, JSON.stringify(memoryUpworkJobs)]),
      },
      4000
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Upwork Email Redis] Ошибка записи в Redis:', msg);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyTelegramIfConfigured(vacancy: Vacancy, proposalText: string = ''): Promise<{ sent: boolean; reason?: string }> {
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

  const safeTitle = escapeHtml(vacancy.text.split('\n')[0].slice(0, 70));
  const safeBudget = escapeHtml(budgetStr || 'По договорённости');
  const safeRoi = escapeHtml(roiBadge);
  const safeVerdict = verdict ? escapeHtml(verdict) : '';
  const safeSnippet = escapeHtml(vacancy.text.slice(0, 400).trim());
  const safeProposal = proposalText ? escapeHtml(proposalText.slice(0, 300)) : '';
  const safeUrl = escapeHtml(vacancy.url);

  const message = [
    `⚡ <b>Новый заказ Upwork (Email): ${safeTitle}</b>`,
    `💰 <b>Бюджет:</b> ${safeBudget}`,
    `📊 <b>Оценка Connects:</b> ${safeRoi}`,
    safeVerdict ? `💡 <i>${safeVerdict}</i>` : '',
    '',
    `📝 <b>Описание:</b>`,
    `${safeSnippet}...`,
    '',
    safeProposal ? `⚡ <b>Готовый хук для отклика:</b>\n<pre>${safeProposal}</pre>\n` : '',
    `🔗 <a href="${safeUrl}">Открыть заказ на Upwork</a>`,
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
      const fallbackText = `⚡ Новый заказ Upwork: ${vacancy.text.split('\n')[0].slice(0, 70)}\n💰 Бюджет: ${budgetStr}\n📊 Оценка Connects: ${roiBadge}\n\n${vacancy.text.slice(0, 300).trim()}...\n\n🔗 ${vacancy.url}`;
      await fetchWithTimeout(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: fallbackText,
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: inlineButtons },
          }),
        },
        5000
      ).catch(() => {});
      return { sent: true };
    }
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Upwork Telegram] Ошибка сети при отправке: ${msg}`);
    return { sent: false, reason: msg };
  }
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (event.httpMethod === 'GET') {
    return jsonResponse(
      200,
      {
        ok: true,
        endpoint: '/api/upwork-email',
        description: 'Inbound Upwork Email Alert Webhook. Accepts POST requests with email payload or forwarded alert.',
        samplePayload: {
          subject: 'New job: YouTube Video Editor',
          text: 'Hourly: $40-$60. Link: https://www.upwork.com/jobs/~01abc',
          html: '<html>...</html>',
          from: 'donotreply@upwork.com',
        },
      },
      origin
    );
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается (используйте POST)', null, origin);
  }

  const userAuth = requireAuth(event);
  const secretOk = isSecretAuthorized(event);
  if (!userAuth.authenticated && !secretOk) {
    return errorResponse(401, 'Требуется авторизация или секретный ключ (?secret=...)', null, origin);
  }

  const sizeCheck = validatePayloadSize(event.body, 256 * 1024);
  if (!sizeCheck.valid) {
    return errorResponse(400, sizeCheck.error || 'Слишком большой размер письма', null, origin);
  }

  let rawPayload: Record<string, any> = {};
  try {
    rawPayload = JSON.parse(event.body || '{}');
  } catch {
    // Treat plain text body as textContent
    rawPayload = { text: event.body || '' };
  }

  // Normalize common email webhook payload keys (SendGrid, Mailgun, Postmark, Zapier)
  const subject = String(rawPayload.subject || rawPayload.Subject || rawPayload.title || '').trim();
  const text = String(rawPayload.text || rawPayload.plain || rawPayload.body || rawPayload['body-plain'] || '').trim();
  const html = String(rawPayload.html || rawPayload['body-html'] || rawPayload.HtmlBody || '').trim();
  const from = String(rawPayload.from || rawPayload.sender || rawPayload.From || '').trim();

  const parsedJobs = parseUpworkEmail({ subject, text, html, from });

  if (parsedJobs.length === 0) {
    return jsonResponse(
      200,
      {
        ok: true,
        jobsProcessed: 0,
        message: 'Письмо получено, но активных ссылок на вакансии Upwork не обнаружено.',
      },
      origin
    );
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const existingJobs = await readSavedJobs(redisUrl, redisToken);

  const ingestedVacancies: Vacancy[] = [];

  for (const job of parsedJobs) {
    const fullText = `${job.title}\n\n${job.description || ''}`.trim();

    // Фильтрация через 3-уровневый фильтр (отсекаем full-time, оклад, нецелевые)
    const filterResult = matchesVacancy(fullText, { minScore: 40 });
    if (!filterResult.isMatch) {
      console.log(`[Upwork Email] Заказ отсеян фильтром: ${filterResult.reason} («${job.title}»)`);
      continue;
    }

    const roi = calculateConnectsRoi(job);
    const budget = parseBudget(`${job.budget || ''} ${fullText}`);
    const hasLong = /youtube|long[\s-]*form|podcast|documentary|16:9/i.test(fullText);
    const hasShort = /reels|shorts|tiktok|vertical|9:16/i.test(fullText);

    let translatedRu: string | null = null;
    if (needsRussianTranslation(fullText)) {
      try {
        const tr = await translateFreeNeural(fullText.slice(0, 1200), 'ru', 'en');
        if (tr?.translatedText) {
          translatedRu = tr.translatedText;
        }
      } catch {
        // ignore
      }
    }

    const hashSource = job.url && job.url.includes('/jobs/') ? job.url : `${job.title}:${fullText.slice(0, 100)}`;
    const id = `upwork_${crypto.createHash('sha1').update(hashSource).digest('hex').slice(0, 12)}`;

    const vacancy: Vacancy = {
      id,
      channel: 'Upwork',
      text: fullText.slice(0, 1800),
      url: job.url || 'https://www.upwork.com/nx/find-work/',
      postedAt: new Date().toISOString(),
      views: `${roi.connectsRequired || 16} Connects · ROI ${roi.roiScore}`,
      matchedKeywords: ['Upwork', 'Email Alert', `ROI ${roi.roiScore}`],
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

    ingestedVacancies.push(vacancy);
    await saveJobAtomically(vacancy, redisUrl, redisToken);

    // Send instant Telegram notification for all matching incoming Upwork jobs
    const proposal = generateUpworkProposal(job, {});
    await notifyTelegramIfConfigured(vacancy, proposal?.coverLetter || proposal?.previewAnalysis?.first200Chars || '');
  }

  return jsonResponse(
    200,
    {
      ok: true,
      jobsProcessed: ingestedVacancies.length,
      vacancies: ingestedVacancies,
    },
    origin
  );
}
