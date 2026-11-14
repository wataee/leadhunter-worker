import crypto from 'crypto';
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from?: {
    id: number;
    first_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat?: {
      id: number;
    };
  };
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.', null, origin);
  }

  // Проверка секретного токена вебхука от Telegram Bot API
  const expectedSecret = process.env.WEBHOOK_SECRET?.trim();
  if (!expectedSecret || expectedSecret.length < 16) {
    return errorResponse(503, 'WEBHOOK_SECRET не настроен на сервере', null, origin);
  }

  const incomingSecret = (
    event.headers['x-telegram-bot-api-secret-token'] ||
    event.headers['X-Telegram-Bot-Api-Secret-Token'] ||
    event.headers['x-webhook-secret'] ||
    ''
  ).trim();

  if (!incomingSecret) {
    return errorResponse(401, 'Доступ запрещён: отсутствует токен проверки Telegram', null, origin);
  }

  const inBuf = crypto.createHash('sha256').update(incomingSecret).digest();
  const expBuf = crypto.createHash('sha256').update(expectedSecret).digest();

  if (!crypto.timingSafeEqual(inBuf, expBuf)) {
    return errorResponse(401, 'Доступ запрещён: неверный токен вебхука', null, origin);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return errorResponse(503, 'TELEGRAM_BOT_TOKEN не настроен', null, origin);
  }

  let update: TelegramUpdate;
  try {
    update = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON в запросе от Telegram', null, origin);
  }

  const cbQuery = update.callback_query;
  if (!cbQuery || !cbQuery.id) {
    // Просто подтверждаем другие обновления Telegram (message и т.д.)
    return jsonResponse(200, { ok: true, handled: 'non_callback' }, origin);
  }

  const queryId = cbQuery.id;
  const data = cbQuery.data || '';
  let responseText = 'Действие выполнено';

  try {
    if (data.startsWith('hide:')) {
      const channel = data.slice(5).trim();
      responseText = `Канал @${channel} скрыт из уведомлений`;

      // Если подключен Upstash Redis, сохраняем в множество скрытых каналов
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
      if (redisUrl && redisToken && channel) {
        await fetchWithTimeout(`${redisUrl}/sadd/leadhunter:hidden_channels/${encodeURIComponent(channel)}`, {
          headers: { Authorization: `Bearer ${redisToken}` },
        }, 3000).catch(() => {});
      }
    } else if (data.startsWith('lead:')) {
      const leadId = data.slice(5).trim();
      responseText = 'Вакансия сохранена в воронку!';

      const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
      if (redisUrl && redisToken && leadId) {
        await fetchWithTimeout(`${redisUrl}/sadd/leadhunter:saved_leads/${encodeURIComponent(leadId)}`, {
          headers: { Authorization: `Bearer ${redisToken}` },
        }, 3000).catch(() => {});
      }
    }

    // Подтверждаем клик пользователю в Telegram через answerCallbackQuery
    await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
          text: responseText,
          show_alert: false,
        }),
      },
      5000
    );

    return jsonResponse(200, { ok: true, data, responseText }, origin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обработки callback';
    return errorResponse(500, `Ошибка callback: ${msg}`, null, origin);
  }
}
