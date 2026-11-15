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
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
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

  const clientIp =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['client-ip'] ||
    event.headers['x-forwarded-for'] ||
    '127.0.0.1';

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
    const isDev = isDevEnvironment();

    // Если пароль приложения не настроен: открытый доступ
    if (!appPassword) {
      const { token } = signSessionToken();
      const response = jsonResponse(200, { ok: true, authenticated: true }, origin);
      response.headers['Set-Cookie'] = `lh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`;
      return response;
    }

    // Rate Limiting попыток входа (5 попыток на 15 минут)
    const rate = checkLoginRateLimit(clientIp);
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
      recordLoginFailure(clientIp);
      const remainingAttempts = checkLoginRateLimit(clientIp).remaining;
      return errorResponse(
        401,
        `Неверный пароль. Осталось попыток: ${remainingAttempts}`,
        { remainingAttempts },
        origin
      );
    }

    // Успешный вход: сбрасываем счётчик неудач и ставим куку
    resetLoginAttempts(clientIp);
    const { token, expiresAt } = signSessionToken();

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
