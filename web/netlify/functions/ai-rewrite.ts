import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkRateLimit,
  validatePayloadSize,
  type NetlifyResponse,
} from './_shared/response';
import { generateAiCompletion, sanitizeInput } from './_shared/ai';
import { requireAuth } from './_shared/auth';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface RewriteBody {
  text: string;
  leadContext?: {
    name?: string;
    channel?: string;
    niche?: string;
  };
}

const SYSTEM_PROMPT =
  "Ты помогаешь видеомонтажёру писать холодные сообщения. Сделай текст короче, конкретнее, без лести и без слов 'услуги монтажа'. Сохрани все факты, таймкоды и вопрос в конце. Верни только готовый текст сообщения.";

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // 1.3 Проверка авторизации
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.', null, origin);
  }

  // Rate Limiting по IP
  const clientIp =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = checkRateLimit(clientIp, 30, 60_000);
  if (!rateCheck.allowed) {
    return errorResponse(429, 'Слишком много запросов. Пожалуйста, подождите минуту.', null, origin);
  }

  // Проверка размера тела запроса (макс 32 КБ)
  const sizeValidation = validatePayloadSize(event.body, 32 * 1024);
  if (!sizeValidation.valid) {
    return errorResponse(400, sizeValidation.error || 'Слишком большой запрос', null, origin);
  }

  let body: RewriteBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON', null, origin);
  }

  if (!body.text || !body.text.trim()) {
    return errorResponse(400, 'Передайте текст для улучшения.', null, origin);
  }

  const cleanText = sanitizeInput(body.text, 5000);
  const clientName = body.leadContext?.name ? sanitizeInput(body.leadContext.name, 100) : '';

  const userPrompt = `Улучши следующий текст сообщения для клиента${
    clientName ? ` (Клиент: ${clientName})` : ''
  }:\n\n${cleanText}`;

  try {
    const result = await generateAiCompletion(SYSTEM_PROMPT, userPrompt);
    return jsonResponse(
      200,
      {
        rewritten: result.text.trim(),
        provider: result.provider,
        model: result.model,
      },
      origin
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации ответа';
    return errorResponse(500, msg, null, origin);
  }
}
