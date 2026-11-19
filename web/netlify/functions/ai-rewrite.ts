import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkDistributedRateLimit,
  validatePayloadSize,
  type NetlifyResponse,
} from './_shared/response';
import { generateAiCompletion, sanitizeInput, wrapUserData, PROMPT_INJECTION_DEFENSE } from './_shared/ai';
import { requireAuth } from './_shared/auth';
import { detectTextLanguage } from '../../src/shared/translate.js';

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
  customApiKey?: string;
  customProvider?: string;
}

const SYSTEM_PROMPT_RU =
  "Ты помогаешь видеомонтажёру писать холодные сообщения. Сделай текст короче, конкретнее, без лести и без слов 'услуги монтажа'. Сохрани все факты, таймкоды и вопрос с нулевым трением в конце. " +
  PROMPT_INJECTION_DEFENSE +
  " Верни только готовый текст сообщения на русском языке.";

const SYSTEM_PROMPT_EN =
  "You help a video editor write sharp cold outreach messages and job replies in English. Make the message shorter, punchier, zero flattery, and never use the cliché 'video editing services'. Preserve all URLs, @handles, facts, timecodes, and keep a low-friction question at the end. " +
  PROMPT_INJECTION_DEFENSE +
  " Return ONLY the finished message text in English.";

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

  // Rate Limiting по IP (распределённый через Upstash Redis или in-memory)
  const clientIp =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = await checkDistributedRateLimit(clientIp, 30, 60_000);
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
  const detectedLang = detectTextLanguage(cleanText);
  const isRussian = detectedLang === 'ru' || detectedLang === 'kk';
  const systemPrompt = isRussian ? SYSTEM_PROMPT_RU : SYSTEM_PROMPT_EN;

  const userPrompt = isRussian
    ? `Улучши следующее сообщение для клиента${
        clientName ? ` (Клиент: ${clientName})` : ''
      }:\n\n${wrapUserData(cleanText, 'PITCH_DRAFT')}`
    : `Improve this outreach pitch for the client${
        clientName ? ` (Client: ${clientName})` : ''
      }:\n\n${wrapUserData(cleanText, 'PITCH_DRAFT')}`;

  const customKey = (
    event.headers?.['x-custom-ai-key'] ||
    event.headers?.['X-Custom-Ai-Key'] ||
    body.customApiKey ||
    ''
  ).trim();

  const customProvider = (
    event.headers?.['x-custom-ai-provider'] ||
    event.headers?.['X-Custom-Ai-Provider'] ||
    body.customProvider ||
    ''
  ).trim();

  try {
    const result = await generateAiCompletion(
      systemPrompt,
      userPrompt,
      customKey ? { apiKey: customKey, provider: customProvider } : undefined
    );
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
