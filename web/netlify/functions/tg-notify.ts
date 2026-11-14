import {
  jsonResponse,
  errorResponse,
  handleOptions,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
  body: string | null;
}

interface NotifyBody {
  title?: string;
  text: string;
  url: string;
  channel?: string;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.');
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    return errorResponse(
      400,
      'Переменные TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID не настроены в Netlify.'
    );
  }

  let body: NotifyBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON');
  }

  if (!body.text || !body.url) {
    return errorResponse(400, 'Отсутствуют обязательные поля: text или url');
  }

  const cleanSnippet = body.text.slice(0, 400).trim();
  const message = [
    `🎯 <b>Новая горячая вакансия!</b> ${body.channel ? `(@${body.channel})` : ''}`,
    '',
    cleanSnippet,
    cleanSnippet.length >= 400 ? '...' : '',
    '',
    `🔗 <a href="${body.url}">Открыть пост в Telegram</a>`,
  ].join('\n');

  try {
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
        }),
      },
      8000
    );

    const data = await res.json();
    if (!res.ok) {
      return errorResponse(res.status, data?.description || 'Ошибка отправки в Telegram');
    }

    return jsonResponse(200, { success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
    return errorResponse(500, `Ошибка соединения с Telegram Bot API: ${msg}`);
  }
}
