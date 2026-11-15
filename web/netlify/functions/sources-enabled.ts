import crypto from 'crypto';
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';
import rawCatalog from '../../src/shared/sources.catalog.json';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

function verifyWorkerSecret(event: HandlerEvent): boolean {
  const expectedSecret = process.env.WEBHOOK_SECRET?.trim();
  if (!expectedSecret || expectedSecret.length < 16) return false;

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = (
    event.headers['x-webhook-secret'] ||
    event.headers['X-Webhook-Secret'] ||
    ''
  ).trim();

  const incomingSecret = bearerToken || headerSecret;
  if (!incomingSecret) return false;

  const inBuf = crypto.createHash('sha256').update(incomingSecret).digest();
  const expBuf = crypto.createHash('sha256').update(expectedSecret).digest();
  return crypto.timingSafeEqual(inBuf, expBuf);
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  const isWorkerAuthorized = verifyWorkerSecret(event);
  const userAuth = requireAuth(event);

  if (!isWorkerAuthorized && !userAuth.authenticated) {
    return errorResponse(401, 'Доступ запрещён: требуется авторизация', null, origin);
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // POST: Сохранение отключённых источников пользователем из веб-интерфейса
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const disabledList: string[] = Array.isArray(body.disabledSources)
        ? body.disabledSources
        : Array.isArray(body.sources)
        ? body.sources
        : [];

      const cleanList = disabledList
        .map((s) => String(s).toLowerCase().replace(/^@/, '').trim())
        .filter(Boolean);

      if (redisUrl && redisToken) {
        const pipeline: any[] = [['DEL', 'leadhunter:disabled_sources']];
        if (cleanList.length > 0) {
          pipeline.push(['SADD', 'leadhunter:disabled_sources', ...cleanList]);
        }

        await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pipeline),
        });
      }

      return jsonResponse(200, { ok: true, disabledCount: cleanList.length }, origin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при сохранении источников';
      return errorResponse(500, msg, null, origin);
    }
  }

  // GET: Получение активных источников с исключением скрытых и отключённых
  if (event.httpMethod === 'GET') {
    let hidden = new Set<string>();
    let disabled = new Set<string>();

    if (redisUrl && redisToken) {
      try {
        const res = await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            ['SMEMBERS', 'leadhunter:hidden_channels'],
            ['SMEMBERS', 'leadhunter:disabled_sources'],
          ]),
          signal: AbortSignal.timeout(3000),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.[0]?.result)) {
            hidden = new Set(data[0].result.map((s: string) => String(s).toLowerCase().replace(/^@/, '')));
          }
          if (Array.isArray(data?.[1]?.result)) {
            disabled = new Set(data[1].result.map((s: string) => String(s).toLowerCase().replace(/^@/, '')));
          }
        }
      } catch (err: unknown) {
        console.warn('[sources-enabled] Ошибка чтения фильтров из Redis:', (err as Error).message);
      }
    }

    const catalog = rawCatalog as Array<{ username?: string; id?: string }>;
    const sources: string[] = [];

    for (const item of catalog) {
      const uname = (item.username || item.id || '').toLowerCase().replace(/^@/, '').trim();
      if (uname && !hidden.has(uname) && !disabled.has(uname)) {
        sources.push(uname);
      }
    }

    return jsonResponse(
      200,
      {
        ok: true,
        count: sources.length,
        sources,
        hiddenCount: hidden.size,
        disabledCount: disabled.size,
        timestamp: new Date().toISOString(),
      },
      origin
    );
  }

  return errorResponse(405, 'Метод не поддерживается. Используйте GET или POST.', null, origin);
}
