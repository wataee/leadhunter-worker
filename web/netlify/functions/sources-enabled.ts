import crypto from 'crypto';
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  type NetlifyResponse,
} from './_shared/response';
import rawCatalog from '../../src/shared/sources.catalog.json';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Метод не поддерживается. Используйте GET.', null, origin);
  }

  // Проверка Bearer WEBHOOK_SECRET или заголовка x-webhook-secret
  const expectedSecret = process.env.WEBHOOK_SECRET?.trim();
  if (!expectedSecret || expectedSecret.length < 16) {
    return errorResponse(503, 'WEBHOOK_SECRET не настроен на сервере', null, origin);
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = (
    event.headers['x-webhook-secret'] ||
    event.headers['X-Webhook-Secret'] ||
    ''
  ).trim();

  const incomingSecret = bearerToken || headerSecret;
  if (!incomingSecret) {
    return errorResponse(401, 'Доступ запрещён: требуется Bearer WEBHOOK_SECRET', null, origin);
  }

  const inBuf = crypto.createHash('sha256').update(incomingSecret).digest();
  const expBuf = crypto.createHash('sha256').update(expectedSecret).digest();

  if (!crypto.timingSafeEqual(inBuf, expBuf)) {
    return errorResponse(401, 'Доступ запрещён: неверный секрет', null, origin);
  }

  // Получаем список активных каналов из каталога (и отфильтровываем скрытые, если Redis доступен)
  let hidden = new Set<string>();
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/smembers/leadhunter:hidden_channels`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.result)) {
          hidden = new Set(data.result.map((s: string) => String(s).toLowerCase().replace(/^@/, '')));
        }
      }
    } catch {
      // Игнорируем сетевые ошибки Redis
    }
  }

  const catalog = rawCatalog as Array<{ username?: string; id?: string }>;
  const sources: string[] = [];

  for (const item of catalog) {
    const uname = (item.username || item.id || '').toLowerCase().replace(/^@/, '').trim();
    if (uname && !hidden.has(uname)) {
      sources.push(uname);
    }
  }

  return jsonResponse(200, {
    ok: true,
    count: sources.length,
    sources,
    timestamp: new Date().toISOString(),
  }, origin);
}
