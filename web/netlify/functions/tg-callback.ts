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

interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
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
    text?: string;
    chat?: {
      id: number;
    };
    reply_markup?: {
      inline_keyboard?: InlineKeyboardButton[][];
    };
  };
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
}

async function callRedisCommand(redisUrl: string, redisToken: string, command: any[]): Promise<{ ok: boolean; result?: any; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      redisUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
      },
      4000
    );
    if (!res.ok) {
      return { ok: false, error: `Redis HTTP ${res.status}` };
    }
    const data = await res.json();
    if (data?.error) {
      return { ok: false, error: data.error };
    }
    return { ok: true, result: data?.result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: msg };
  }
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
    return jsonResponse(200, { ok: true, handled: 'non_callback' }, origin);
  }

  // Принимаем callback только от доверенного TELEGRAM_CHAT_ID
  const expectedChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (expectedChatId) {
    const rawChatId = cbQuery.message?.chat?.id != null ? String(cbQuery.message.chat.id).trim() : '';
    const rawFromId = cbQuery.from?.id != null ? String(cbQuery.from.id).trim() : '';
    const cleanExpected = expectedChatId.replace(/^-100/, '');
    const cleanChat = rawChatId.replace(/^-100/, '');

    const chatMatches = rawChatId === expectedChatId || cleanChat === cleanExpected;
    const fromMatches = rawFromId === expectedChatId || rawFromId === cleanExpected;

    if (!chatMatches && !fromMatches) {
      console.warn(`[tg-callback] Отклонён запрос от неавторизованного чата ${rawChatId} / пользователя ${rawFromId}`);
      return jsonResponse(200, { ok: true, ignored: 'unauthorized_sender' }, origin);
    }
  }

  const queryId = cbQuery.id;
  const data = cbQuery.data || '';
  const messageChatId = cbQuery.message?.chat?.id;
  const messageId = cbQuery.message?.message_id;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // Если Redis не настроен — отвечаем «⚠️ База данных не настроена, функция недоступна»
  if (!redisUrl || !redisToken) {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
          text: '⚠️ База данных не настроена, функция недоступна',
          show_alert: true,
        }),
      },
      5000
    ).catch(() => {});

    return jsonResponse(200, { ok: false, error: 'Redis не настроен' }, origin);
  }

  let responseText = 'Действие выполнено';
  let showAlert = false;
  let updateMarkup: InlineKeyboardButton[][] | null = null;

  try {
    if (data === 'noop') {
      await fetchWithTimeout(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: queryId,
            text: 'Эта вакансия уже в вашей воронке',
            show_alert: false,
          }),
        },
        3000
      ).catch(() => {});
      return jsonResponse(200, { ok: true, noop: true }, origin);
    }

    if (data.startsWith('hide:')) {
      const channel = data.slice(5).trim().toLowerCase().replace(/^@/, '');
      if (channel) {
        const res = await callRedisCommand(redisUrl, redisToken, ['SADD', 'leadhunter:hidden_channels', channel]);
        if (res.ok) {
          responseText = `🙈 Канал @${channel} скрыт. Вакансии из него больше не будут приходить.`;
          // Обновляем разметку: удаляем кнопку «Скрыть источник»
          if (cbQuery.message?.reply_markup?.inline_keyboard) {
            updateMarkup = cbQuery.message.reply_markup.inline_keyboard.map((row) =>
              row.filter((btn) => !btn.callback_data?.startsWith('hide:'))
            ).filter((row) => row.length > 0);
          }
        } else {
          responseText = '⚠️ Ошибка сохранения в базу данных';
          showAlert = true;
        }
      }
    } else if (data.startsWith('lead:')) {
      const leadId = data.slice(5).trim();
      if (leadId) {
        let snapshot: any = null;
        // 1. Пытаемся забрать сохранённый снимок
        const snapRes = await callRedisCommand(redisUrl, redisToken, ['GET', `leadhunter:lead_snapshots:${leadId}`]);
        if (snapRes.ok && snapRes.result) {
          try {
            snapshot = typeof snapRes.result === 'string' ? JSON.parse(snapRes.result) : snapRes.result;
          } catch {}
        }

        // 2. Fallback: восстановление из текста сообщения
        if (!snapshot) {
          const msgText = cbQuery.message?.text || 'Вакансия из Telegram';
          let detectedUrl = `https://t.me/${leadId}`;
          if (cbQuery.message?.reply_markup?.inline_keyboard) {
            for (const row of cbQuery.message.reply_markup.inline_keyboard) {
              for (const btn of row) {
                if (btn.url && btn.url.startsWith('https://t.me/')) {
                  detectedUrl = btn.url;
                  break;
                }
              }
            }
          }
          snapshot = {
            id: leadId,
            text: msgText,
            url: detectedUrl,
            channel: '',
            postedAt: new Date().toISOString(),
          };
        }

        const snapshotJson = JSON.stringify(snapshot);
        const saveRes = await callRedisCommand(redisUrl, redisToken, ['HSET', 'leadhunter:inbox', leadId, snapshotJson]);

        if (saveRes.ok) {
          responseText = '✅ Вакансия добавлена в воронку! Откройте приложение, чтобы увидеть её.';
          showAlert = true;

          // Обновляем кнопку «В воронку» на «✅ В воронке»
          if (cbQuery.message?.reply_markup?.inline_keyboard) {
            updateMarkup = cbQuery.message.reply_markup.inline_keyboard.map((row) =>
              row.map((btn) => {
                if (btn.callback_data?.startsWith('lead:')) {
                  return { text: '✅ В воронке', callback_data: 'noop' };
                }
                return btn;
              })
            );
          }
        } else {
          responseText = '⚠️ Не удалось добавить в воронку: ошибка базы данных';
          showAlert = true;
        }
      }
    }

    // Подтверждаем клик через answerCallbackQuery
    await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
          text: responseText,
          show_alert: showAlert,
        }),
      },
      5000
    );

    // Если требуется обновить разметку кнопок сообщения
    if (updateMarkup && messageChatId && messageId) {
      await fetchWithTimeout(
        `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: messageChatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: updateMarkup,
            },
          }),
        },
        5000
      ).catch((e) => console.warn('[tg-callback] Ошибка editMessageReplyMarkup:', e.message));
    }

    return jsonResponse(200, { ok: true, data, responseText }, origin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обработки callback';
    return errorResponse(500, `Ошибка callback: ${msg}`, null, origin);
  }
}
