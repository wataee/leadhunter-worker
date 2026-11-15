import {
  jsonResponse,
  errorResponse,
  handleOptions,
  type NetlifyResponse,
} from './_shared/response';
import {
  requireAuth,
  verifyPassword,
  signSessionToken,
  checkLoginRateLimitAsync,
  recordLoginFailureAsync,
  resetLoginAttemptsAsync,
  getSessionSecret,
  SESSION_MAX_AGE_SEC,
  isDevEnvironment,
} from './_shared/auth';

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

  const isDev = isDevEnvironment();
  // 1.2 IP строго из x-nf-client-connection-ip
  const clientIp = event.headers['x-nf-client-connection-ip'] || (isDev ? '127.0.0.1' : 'unknown');

  // GET: Проверка текущей сессии
  if (event.httpMethod === 'GET') {
    const auth = requireAuth(event);
    if (!auth.authenticated) {
      return errorResponse(auth.statusCode || 401, auth.error || 'Не авторизован', null, origin);
    }
    return jsonResponse(200, { ok: true, authenticated: true }, origin);
  }

  // DELETE или POST logout: Выход из системы
  if (event.httpMethod === 'DELETE') {
    const response = jsonResponse(200, { ok: true, message: 'Сессия завершена' }, origin);
    response.headers['Set-Cookie'] =
      'lh_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
    return response;
  }

  if (event.httpMethod === 'POST') {
    let body: { password?: string; action?: string } = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return errorResponse(400, 'Некорректный JSON в теле запроса', null, origin);
    }

    if (body.action === 'logout') {
      const response = jsonResponse(200, { ok: true, message: 'Сессия завершена' }, origin);
      response.headers['Set-Cookie'] =
        'lh_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
      return response;
    }

    const appPassword = process.env.APP_PASSWORD?.trim();

    // 1.1 Если APP_PASSWORD не задан и это НЕ dev: 503 «APP_PASSWORD не настроен» и не выдавать cookie
    if (!appPassword) {
      if (!isDev) {
        return errorResponse(503, 'APP_PASSWORD не настроен на сервере', null, origin);
      }
      return jsonResponse(
        200,
        { ok: true, authenticated: true, devMode: true, message: 'Dev-режим: доступ без пароля' },
        origin
      );
    }

    // 1.1 Требовать APP_SESSION_SECRET >= 32 символов
    let sessionSecret: string;
    try {
      sessionSecret = getSessionSecret();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'APP_SESSION_SECRET не настроен';
      return errorResponse(503, msg, null, origin);
    }

    // 1.2 Rate Limiting попыток входа (Upstash Redis или in-memory)
    const rate = await checkLoginRateLimitAsync(clientIp);
    if (!rate.allowed) {
      return errorResponse(
        429,
        `Слишком много неудачных попыток входа. Повторите через ${Math.ceil(
          rate.resetInSec / 60
        )} мин.`,
        { retryAfterSec: rate.resetInSec },
        origin
      );
    }

    const providedPassword = (body.password || '').trim();
    if (!providedPassword) {
      return errorResponse(400, 'Пароль обязателен для входа', null, origin);
    }

    const isValid = verifyPassword(providedPassword, appPassword);
    if (!isValid) {
      await recordLoginFailureAsync(clientIp);
      const remainingAttempts = (await checkLoginRateLimitAsync(clientIp)).remaining;
      return errorResponse(
        401,
        `Неверный пароль. Осталось попыток: ${remainingAttempts}`,
        { remainingAttempts },
        origin
      );
    }

    // Успешный вход: сбрасываем счётчик неудач и ставим куку
    await resetLoginAttemptsAsync(clientIp);
    const { token, expiresAt } = signSessionToken(sessionSecret);

    const response = jsonResponse(
      200,
      {
        ok: true,
        authenticated: true,
        expiresAt: new Date(expiresAt).toISOString(),
      },
      origin
    );

    // httpOnly, Secure, SameSite=Strict, 30 days
    response.headers['Set-Cookie'] = `lh_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SEC}`;

    return response;
  }

  return errorResponse(405, 'Метод не поддерживается. Доступны GET, POST, DELETE', null, origin);
}
