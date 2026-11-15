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
  headers: Record<string, string | undefined>;
  body: string | null;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // GET: Public VAPID key (does not require secret)
  if (event.httpMethod === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || null;
    return jsonResponse(200, {
      configured: Boolean(publicKey),
      publicKey,
    }, origin);
  }

  // POST / DELETE requires authentication
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!redisUrl || !redisToken) {
    return errorResponse(503, 'Upstash Redis не настроен для хранения push-подписок', null, origin);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const subscription = body.subscription;
    if (!subscription || !subscription.endpoint) {
      return errorResponse(400, 'Некорректная подписка (отсутствует endpoint)', null, origin);
    }

    const subString = JSON.stringify(subscription);

    if (event.httpMethod === 'POST') {
      // Save subscription in Redis set
      await fetchWithTimeout(`${redisUrl}/sadd/leadhunter:push_subscriptions/${encodeURIComponent(subString)}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      }, 3000);
      return jsonResponse(200, { ok: true, saved: true }, origin);
    }

    if (event.httpMethod === 'DELETE') {
      // Remove subscription
      await fetchWithTimeout(`${redisUrl}/srem/leadhunter:push_subscriptions/${encodeURIComponent(subString)}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      }, 3000);
      return jsonResponse(200, { ok: true, removed: true }, origin);
    }

    return errorResponse(405, 'Метод не поддерживается', null, origin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка при обработке push-подписки';
    return errorResponse(500, msg, null, origin);
  }
}
