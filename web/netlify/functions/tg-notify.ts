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

interface BudgetObject {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  unit?: string | null;
}

interface NotifyBody {
  id?: string;
  title?: string;
  text: string;
  url: string;
  channel?: string;
  budget?: string | BudgetObject | null;
  type?: 'lead' | 'digest';
  kind?: 'lead' | 'digest';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBudget(budget: string | BudgetObject | null | undefined): string {
  if (!budget) return '';
  if (typeof budget === 'string') return budget;
  if (typeof budget === 'object') {
    if (budget.currency === 'NEGOTIABLE') return '💰 По договорённости';
    const cur = budget.currency === 'RUB' ? '₽' : budget.currency === 'USD' ? '$' : (budget.currency || '');
    const unit = budget.unit === 'per_video' ? ' / ролик' : budget.unit === 'per_month' ? ' / мес' : budget.unit === 'project' ? ' за проект' : '';
    if (budget.min && budget.max) {
      return `💰 ${budget.min.toLocaleString('ru-RU')}–${budget.max.toLocaleString('ru-RU')} ${cur}${unit}`.trim();
    }
    if (budget.min) {
      return `💰 от ${budget.min.toLocaleString('ru-RU')} ${cur}${unit}`.trim();
    }
    if (budget.max) {
      return `💰 до ${budget.max.toLocaleString('ru-RU')} ${cur}${unit}`.trim();
    }
  }
  return '';
}

// Ensure string fits in byte limit (e.g. Telegram 64 bytes limit for callback_data)
function truncateToBytes(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) {
    end--;
  }
  return buf.subarray(0, end).toString('utf8');
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

  const isDigest = body.type === 'digest' || body.kind === 'digest';
  const cleanUrl = body.url.trim();

  // B6: URL validation
  if (!isDigest) {
    const isTgUrl = /^https:\/\/t\.me\/(?:[a-zA-Z0-9_+/=-]+)$/.test(cleanUrl);
    if (!isTgUrl) {
      return errorResponse(
        400,
        'Недопустимый URL. Разрешены только ссылки вида https://t.me/...',
        null,
        origin
      );
    }
  } else {
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return errorResponse(400, 'Недопустимый URL дайджеста', null, origin);
      }
    } catch {
      return errorResponse(400, 'Некорректный URL дайджеста', null, origin);
    }
  }

  let message = '';
  const inlineButtons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];

  if (isDigest) {
    const hasHtml = /<\/?(?:b|i|a|code|pre|em|strong)[\s>]/i.test(body.text);
    const content = hasHtml ? body.text : escapeHtml(body.text);
    const safeTitle = body.title ? escapeHtml(body.title) : 'Дайджест вакансий LeadHunter';

    message = [
      `📊 <b>${safeTitle}</b>`,
      '',
      content,
      '',
      `🔗 <a href="${cleanUrl}">Открыть в LeadHunter</a>`,
    ].join('\n');

    inlineButtons.push([{ text: '🔗 Открыть LeadHunter', url: cleanUrl }]);
  } else {
    const cleanSnippet = escapeHtml(body.text.slice(0, 500).trim());
    const safeChannel = body.channel && typeof body.channel === 'string' ? escapeHtml(body.channel.trim()) : '';
    const safeTitle = body.title && typeof body.title === 'string' ? escapeHtml(body.title.trim()) : 'Новая вакансия';
    const formattedBudget = formatBudget(body.budget);

    const messageLines = [
      `🎯 <b>${safeTitle}</b> ${safeChannel ? `(${safeChannel})` : ''}`,
    ];
    if (formattedBudget) {
      messageLines.push(`<b>${escapeHtml(formattedBudget)}</b>`);
    }
    messageLines.push('');
    messageLines.push(cleanSnippet + (body.text.length > 500 ? '...' : ''));
    messageLines.push('');
    messageLines.push(`🔗 <a href="${cleanUrl}">Открыть пост в Telegram</a>`);
    message = messageLines.join('\n');

    // C2: Limit callback_data under 64 bytes total
    const rawChan = (body.channel || '').replace(/^@/, '').trim();
    const chanBytes = truncateToBytes(rawChan, 50); // 'hide:' is 5 bytes -> max 55 bytes
    const leadId = (body.id || `lead_${Date.now()}`).trim();
    const leadBytes = truncateToBytes(leadId, 50); // 'lead:' is 5 bytes -> max 55 bytes

    const row: Array<{ text: string; url?: string; callback_data?: string }> = [
      { text: '🔗 Открыть', url: cleanUrl },
    ];

    if (chanBytes) {
      row.push({ text: '🙈 Скрыть источник', callback_data: `hide:${chanBytes}` });
    }
    row.push({ text: '📥 В воронку', callback_data: `lead:${leadBytes}` });
    inlineButtons.push(row);

    // C2: Save snapshot to Redis via POST command array
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (redisUrl && redisToken) {
      const snapshot = {
        id: leadBytes,
        text: body.text,
        url: cleanUrl,
        channel: body.channel || chanBytes,
        budget: typeof body.budget === 'string' ? body.budget : formattedBudget || null,
        postedAt: new Date().toISOString(),
      };

      fetchWithTimeout(
        redisUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(['SET', `leadhunter:lead_snapshots:${leadBytes}`, JSON.stringify(snapshot), 'EX', '604800']),
        },
        3000
      ).catch((e) => {
        console.warn('[Redis] Ошибка сохранения снимка лида:', e.message);
      });
    }
  }

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
          reply_markup: {
            inline_keyboard: inlineButtons,
          },
        }),
      },
      8000
    );

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const desc = data?.description || `HTTP ${res.status}`;
      console.warn(`[Telegram Bot API Error]: ${desc}`);
      return errorResponse(res.status, `Telegram Bot API Error: ${desc}`, null, origin);
    }

    return jsonResponse(200, { success: true }, origin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сети';
    return errorResponse(500, `Ошибка отправки в Telegram: ${msg}`, null, origin);
  }
}
