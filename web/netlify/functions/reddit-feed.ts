import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkDistributedRateLimit,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';
import {
  fetchRedditHiringPosts,
  REDDIT_HIRING_SUBREDDITS,
} from '../../src/shared/reddit.js';
import { normalizeAndFilterItems } from '../../src/sources/index';
import type { Vacancy } from '../../src/types';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
}

const CACHE_TTL_MS = 120_000;
let cachedResult: { items: Vacancy[]; totalRaw: number; ts: number } | null = null;

export function resetRedditFeedCacheForTests(): void {
  cachedResult = null;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается', null, origin);
  }

  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  const clientIp =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['client-ip'] ||
    event.headers['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = await checkDistributedRateLimit(clientIp, 20, 60_000);
  if (!rateCheck.allowed) {
    return errorResponse(429, 'Слишком много запросов Reddit feed', null, origin);
  }

  if (cachedResult && Date.now() - cachedResult.ts < CACHE_TTL_MS) {
    return jsonResponse(
      200,
      {
        ok: true,
        cached: true,
        items: cachedResult.items,
        totalRaw: cachedResult.totalRaw,
        subreddits: REDDIT_HIRING_SUBREDDITS,
      },
      origin
    );
  }

  try {
    const rawItems = await fetchRedditHiringPosts({ limit: 40, timeoutMs: 6500 });
    const filtered = normalizeAndFilterItems(rawItems);
    const items = filtered.vacancies.map((v) => ({
      ...v,
      sourcePlatform: 'reddit' as const,
      region: v.region === 'RU' ? ('US' as const) : v.region || ('US' as const),
    }));

    cachedResult = { items, totalRaw: rawItems.length, ts: Date.now() };

    return jsonResponse(
      200,
      {
        ok: true,
        cached: false,
        items,
        totalRaw: rawItems.length,
        subreddits: REDDIT_HIRING_SUBREDDITS,
      },
      origin
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки Reddit [Hiring]';
    return errorResponse(502, msg, null, origin);
  }
}
