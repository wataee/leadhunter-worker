import {
  jsonResponse,
  errorResponse,
  handleOptions,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';

interface HandlerEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

export interface InboxLeadSnapshot {
  id: string;
  text: string;
  url: string;
  channel?: string;
  budget?: string | null;
  postedAt: string;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // 1.1 Protected endpoint requires authentication
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!redisUrl || !redisToken) {
    return jsonResponse(200, { items: [], redisConfigured: false }, origin);
  }

  // POST: Acknowledge (delete) items or add items
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const ids: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);

      if (ids.length === 0) {
        return errorResponse(400, 'Не указаны ids для подтверждения', null, origin);
      }

      // HDEL leadhunter:inbox <id1> <id2> ...
      const pipeline = ids.map((id) => ['HDEL', 'leadhunter:inbox', String(id)]);
      await fetchWithTimeout(`${redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pipeline),
      }, 5000);

      return jsonResponse(200, { ok: true, acked: ids.length }, origin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при обработке inbox ack';
      return errorResponse(500, msg, null, origin);
    }
  }

  // GET: Retrieve all items in inbox
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetchWithTimeout(`${redisUrl}/hgetall/leadhunter:inbox`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      }, 5000);

      if (!res.ok) {
        return jsonResponse(200, { items: [], error: 'Ошибка чтения Redis' }, origin);
      }

      const data = await res.json();
      const rawResult = data?.result;
      const items: InboxLeadSnapshot[] = [];

      if (Array.isArray(rawResult)) {
        // [key1, val1, key2, val2, ...]
        for (let i = 1; i < rawResult.length; i += 2) {
          try {
            const parsed = JSON.parse(rawResult[i]);
            items.push(parsed);
          } catch {
            // raw string fallback
          }
        }
      } else if (rawResult && typeof rawResult === 'object') {
        // { key1: val1, key2: val2 }
        for (const key of Object.keys(rawResult)) {
          try {
            const parsed = typeof rawResult[key] === 'string'
              ? JSON.parse(rawResult[key])
              : rawResult[key];
            items.push(parsed);
          } catch {
            // ignore
          }
        }
      }

      return jsonResponse(200, { items, redisConfigured: true }, origin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка получения inbox';
      return errorResponse(500, msg, null, origin);
    }
  }

  return errorResponse(405, 'Метод не поддерживается', null, origin);
}
