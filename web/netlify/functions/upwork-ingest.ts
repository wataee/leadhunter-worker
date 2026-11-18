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
import { needsRussianTranslation, translateFreeNeural } from '../../src/shared/translate.js';
import type { Vacancy } from '../../src/types';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

const REDIS_UPWORK_KEY = 'leadhunter:upwork_jobs:v1';
let memoryUpworkJobs: Vacancy[] = [];

export function resetMemoryUpworkJobsForTests(): void {
  memoryUpworkJobs = [];
}

function isSecretAuthorized(event: HandlerEvent): boolean {
  const expected = process.env.WEBHOOK_SECRET?.trim();
  if (!expected || expected.length < 16) return false;
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = (
    event.headers['x-webhook-secret'] ||
    event.headers['X-Webhook-Secret'] ||
    ''
  ).trim();
  const provided = bearer || headerSecret;
  if (!provided) return false;

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
  try {
    const res = await fetchWithTimeout(
      `${redisUrl.replace(/\/$/, '')}/get/${encodeURIComponent(REDIS_UPWORK_KEY)}`,
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

async function writeSavedJobs(jobs: Vacancy[], redisUrl?: string, redisToken?: string): Promise<void> {
  memoryUpworkJobs = jobs.slice(0, 100);
  if (!redisUrl || !redisToken) return;
  try {
    await fetchWithTimeout(
      redisUrl.replace(/\/$/, ''),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', REDIS_UPWORK_KEY, JSON.stringify(memoryUpworkJobs)]),
      },
      4000
    );
  } catch {
    // non-fatal
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

    const roi = calculateConnectsRoi(job);
    const proposal = generateUpworkProposal(job, body.profile || {});

    const fullText = `${job.title}\n\n${job.description || ''}`.trim();
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
      const existing = await readSavedJobs(redisUrl, redisToken);
      const next = [vacancy, ...existing.filter((x) => x.id !== vacancy.id)];
      await writeSavedJobs(next, redisUrl, redisToken);
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
      },
      origin
    );
    return { ...res, headers: { ...res.headers, ...extHeaders } };
  }

  const err = errorResponse(405, 'Метод не поддерживается', null, origin);
  return { ...err, headers: { ...err.headers, ...extHeaders } };
}
