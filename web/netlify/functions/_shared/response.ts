export interface NetlifyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function getCorsHeaders(incomingOrigin?: string): Record<string, string> {
  const allowed = process.env.ALLOWED_ORIGIN?.trim() || 'https://fleurleads-work.netlify.app';
  let origin = allowed;

  if (incomingOrigin) {
    const trimmed = incomingOrigin.trim();
    if (
      trimmed === allowed ||
      trimmed.endsWith('.netlify.app') ||
      trimmed.startsWith('http://localhost:') ||
      trimmed.startsWith('http://127.0.0.1:')
    ) {
      origin = trimmed;
    }
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  };
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
