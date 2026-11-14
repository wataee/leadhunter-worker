import crypto from 'crypto';
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkRateLimit,
  validatePayloadSize,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface NotifyBody {
  id?: string;
  title?: string;
  text: string;
  url: string;
  channel?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.', null, origin);
  }

  // Rate Limiting по IP
  const clientIp =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['client-ip'] ||
    event.headers['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = checkRateLimit(clientIp, 60, 60_000);
  if (!rateCheck.allowed) {
    return errorResponse(429, 'Слишком много запросов. Пожалуйста, подождите минуту.', null, origin);
  }

  // Проверка размера тела запроса (макс 32 КБ)
  const sizeValidation = validatePayloadSize(event.body, 32 * 1024);
  if (!sizeValidation.valid) {
    return errorResponse(400, sizeValidation.error || 'Слишком большой запрос', null, origin);
  }

  // 1.3 Авторизация воркер → сайт (WEBHOOK_SECRET)
  const expectedSecret = process.env.WEBHOOK_SECRET?.trim();
  if (!expectedSecret || expectedSecret.length < 16) {
    return errorResponse(503, 'WEBHOOK_SECRET не настроен на сервере', null, origin);
  }

  const incomingSecret = (
    event.headers['x-webhook-secret'] ||
    event.headers['X-Webhook-Secret'] ||
    ''
  ).trim();

  if (!incomingSecret) {
    return errorResponse(401, 'Доступ запрещён: отсутствует заголовок X-Webhook-Secret', null, origin);
  }

  const inBuf = crypto.createHash('sha256').update(incomingSecret).digest();
  const expBuf = crypto.createHash('sha256').update(expectedSecret).digest();

  if (!crypto.timingSafeEqual(inBuf, expBuf)) {
    return errorResponse(401, 'Доступ запрещён: неверный X-Webhook-Secret', null, origin);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    return errorResponse(
      400,
      'Переменные TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID не настроены в Netlify.',
      null,
      origin
    );
  }

  let body: NotifyBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON', null, origin);
  }

  if (!body.text || typeof body.text !== 'string' || !body.url || typeof body.url !== 'string') {
    return errorResponse(400, 'Отсутствуют обязательные текстовые поля: text или url', null, origin);
  }

  // 1.5 Валидация URL: строго ссылки на посты в Telegram
  const cleanUrl = body.url.trim();
  const isTgUrl = /^https:\/\/t\.me\/(?:[a-zA-Z0-9_+/=-]+)$/.test(cleanUrl);
  if (!isTgUrl) {
    return errorResponse(
      400,
      'Недопустимый URL. Разрешены только ссылки вида https://t.me/...',
      null,
      origin
    );
  }

  // 1.5 Экранирование для HTML parse_mode
  const cleanSnippet = escapeHtml(body.text.slice(0, 500).trim());
  const safeChannel = body.channel && typeof body.channel === 'string' ? escapeHtml(body.channel.trim()) : '';
  const safeTitle = body.title && typeof body.title === 'string' ? escapeHtml(body.title.trim()) : 'Новая вакансия';

  const message = [
    `🎯 <b>${safeTitle}</b> ${safeChannel ? `(${safeChannel})` : ''}`,
    '',
    cleanSnippet,
    body.text.length > 500 ? '...' : '',
    '',
    `🔗 <a href="${cleanUrl}">Открыть пост в Telegram</a>`,
  ].join('\n');

  try {
    const channelSlug = (body.channel || '').replace(/^@/, '').slice(0, 40);
    const leadSlug = (body.id || channelSlug || 'lead').slice(0, 40);

    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔗 Открыть', url: cleanUrl },
                { text: '🙈 Скрыть источник', callback_data: `hide:${channelSlug}` },
                { text: '📥 В воронку', callback_data: `lead:${leadSlug}` },
              ],
            ],
          },
        }),
      },
      8000
    );

    const data = await res.json();
    if (!res.ok) {
      return errorResponse(res.status, 'Ошибка отправки сообщения в Telegram Bot API', null, origin);
    }

    return jsonResponse(200, { success: true }, origin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сети';
    return errorResponse(500, `Ошибка отправки в Telegram: ${msg}`, null, origin);
  }
}
