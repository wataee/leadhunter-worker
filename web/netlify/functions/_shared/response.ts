export interface NetlifyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function getCorsHeaders(incomingOrigin?: string): Record<string, string> {
  const allowedRaw = process.env.ALLOWED_ORIGIN?.trim() || 'https://fleurleads-work.netlify.app';
  const allowedList = allowedRaw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const isDev = Boolean(process.env.NETLIFY_DEV);

  let matchedOrigin: string | null = null;
  if (incomingOrigin) {
    const trimmed = incomingOrigin.trim().replace(/\/$/, '');
    if (allowedList.includes(trimmed)) {
      matchedOrigin = trimmed;
    } else if (
      isDev &&
      (trimmed.startsWith('http://localhost:') || trimmed.startsWith('http://127.0.0.1:'))
    ) {
      matchedOrigin = trimmed;
    }
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  };

  if (matchedOrigin) {
    headers['Access-Control-Allow-Origin'] = matchedOrigin;
  }

  return headers;
}

// Backward compatible default headers
export const corsHeaders: Record<string, string> = getCorsHeaders();

export function jsonResponse(
  statusCode: number,
  data: unknown,
  origin?: string
): NetlifyResponse {
  return {
    statusCode,
    headers: getCorsHeaders(origin),
    body: JSON.stringify(data),
  };
}

export function errorResponse(
  statusCode: number,
  message: string,
  details?: unknown,
  origin?: string
): NetlifyResponse {
  return {
    statusCode,
    headers: getCorsHeaders(origin),
    body: JSON.stringify({
      error: message,
      details: details ?? null,
    }),
  };
}

export function handleOptions(origin?: string): NetlifyResponse {
  return {
    statusCode: 204,
    headers: getCorsHeaders(origin),
    body: '',
  };
}

// In-memory IP rate limiter (Sliding Window per Netlify execution instance)
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const ipBuckets = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  clientIp: string,
  maxRequests = 40,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  const ip = clientIp || 'unknown';
  const now = Date.now();

  // Prune expired buckets periodically
  if (ipBuckets.size > 1000) {
    for (const [k, v] of ipBuckets) {
      if (v.resetAt < now) ipBuckets.delete(k);
    }
  }

  const record = ipBuckets.get(ip);
  if (!record || record.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

// 3.2 Распределённый rate limiting через Upstash Redis REST с фоллбеком на in-memory
export async function checkDistributedRateLimit(
  clientIp: string,
  maxRequests = 40,
  windowMs = 60_000
): Promise<{ allowed: boolean; remaining: number }> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    try {
      const windowKey = Math.floor(Date.now() / windowMs);
      const cleanIp = (clientIp || 'unknown').replace(/[^a-zA-Z0-9:._-]/g, '');
      const key = `leadhunter:ratelimit:${cleanIp}:${windowKey}`;
      const expireSec = Math.ceil(windowMs / 1000) * 2;

      const res = await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, String(expireSec)],
        ]),
      });

      if (res.ok) {
        const data = await res.json();
        const currentCount = parseInt(data?.[0]?.result || '1', 10);
        if (currentCount > maxRequests) {
          return { allowed: false, remaining: 0 };
        }
        return { allowed: true, remaining: Math.max(0, maxRequests - currentCount) };
      }
    } catch {
      // При ошибке связи с Redis — мягкий фоллбек на in-memory
    }
  }

  return checkRateLimit(clientIp, maxRequests, windowMs);
}

export function validatePayloadSize(
  body: string | null,
  maxBytes = 32 * 1024
): { valid: boolean; error?: string } {
  if (!body) return { valid: true };
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > maxBytes) {
    return {
      valid: false,
      error: `Размер тела запроса (${Math.round(bytes / 1024)} КБ) превышает лимит (${Math.round(maxBytes / 1024)} КБ)`,
    };
  }
  return { valid: true };
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}
