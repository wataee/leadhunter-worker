import crypto from 'crypto';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitRecord>();

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 минут
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 дней

export function getSessionSecret(): string {
  return (
    process.env.APP_SESSION_SECRET?.trim() ||
    process.env.APP_PASSWORD?.trim() ||
    'insecure-dev-session-secret-change-me'
  );
}

export function isDevEnvironment(): boolean {
  return Boolean(
    process.env.NETLIFY_DEV ||
      (process.env.NODE_ENV && process.env.NODE_ENV !== 'production')
  );
}

export function signSessionToken(
  secret = getSessionSecret(),
  maxAgeMs = SESSION_MAX_AGE_SEC * 1000
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + maxAgeMs;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${expiresAt}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return {
    token: `${payload}.${sig}`,
    expiresAt,
  };
}

export function verifySessionToken(token: string, secret = getSessionSecret()): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [expStr, nonce, sig] = parts;
  const expiresAt = parseInt(expStr, 10);
  if (isNaN(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const payload = `${expiresAt}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const sigBuf = crypto.createHash('sha256').update(sig).digest();
  const expBuf = crypto.createHash('sha256').update(expectedSig).digest();

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function verifyPassword(provided: string, expected = process.env.APP_PASSWORD?.trim() || ''): boolean {
  if (!provided || !expected) return false;
  const pBuf = crypto.createHash('sha256').update(provided).digest();
  const eBuf = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(pBuf, eBuf);
}

export function checkLoginRateLimit(ip: string): { allowed: boolean; remaining: number; resetInSec: number } {
  const clientIp = ip || 'unknown';
  const now = Date.now();

  // Очистка старых записей
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (v.resetAt < now) loginAttempts.delete(k);
    }
  }

  const record = loginAttempts.get(clientIp);
  if (!record || record.resetAt < now) {
    return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS, resetInSec: Math.ceil(LOGIN_WINDOW_MS / 1000) };
  }

  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    const resetInSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetInSec };
  }

  return {
    allowed: true,
    remaining: LOGIN_MAX_ATTEMPTS - record.count,
    resetInSec: Math.ceil((record.resetAt - now) / 1000),
  };
}

export function recordLoginFailure(ip: string): void {
  const clientIp = ip || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(clientIp);
  if (!record || record.resetAt < now) {
    loginAttempts.set(clientIp, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    record.count += 1;
  }
}

export function resetLoginAttempts(ip: string): void {
  const clientIp = ip || 'unknown';
  loginAttempts.delete(clientIp);
}

export function parseSessionCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)lh_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export interface AuthCheckResult {
  authenticated: boolean;
  statusCode?: number;
  error?: string;
}

export function requireAuth(event: {
  headers?: Record<string, string | undefined>;
}): AuthCheckResult {
  const isDev = isDevEnvironment();
  const appPassword = process.env.APP_PASSWORD?.trim();

  // Если пароль не задан: в dev пропускаем, в проде fail-closed 503
  if (!appPassword) {
    if (isDev) {
      return { authenticated: true };
    }
    return {
      authenticated: false,
      statusCode: 503,
      error: 'Пароль приложения (APP_PASSWORD) не настроен на сервере',
    };
  }

  const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
  const cookieToken = parseSessionCookie(cookieHeader);

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const token = cookieToken || bearerToken;
  if (!token) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Требуется авторизация',
    };
  }

  if (!verifySessionToken(token)) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Сессия недействительна или истекла. Пожалуйста, выполните вход снова.',
    };
  }

  return { authenticated: true };
}
