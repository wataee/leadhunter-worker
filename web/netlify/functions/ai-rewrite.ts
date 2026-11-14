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

interface RewriteBody {
  text: string;
  leadContext?: {
    name?: string;
    channel?: string;
    niche?: string;
  };
}

const SYSTEM_PROMPT =
  "Ты помогаешь видеомонтажёру писать холодные сообщения. Сделай текст короче, конкретнее, без лести и без слов 'услуги монтажа'. Сохрани все факты, таймкоды и вопрос в конце. Верни только текст сообщения.";

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
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

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!geminiKey && !anthropicKey) {
    return errorResponse(
      400,
      'AI ключ не настроен. Добавьте бесплатный GEMINI_API_KEY (с aistudio.google.com) или ANTHROPIC_API_KEY в переменные окружения Netlify.',
      null,
      origin
    );
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

  if (body.text.length > 5000) {
    return errorResponse(400, 'Текст слишком длинный (максимум 5000 символов).', null, origin);
  }

  const userPrompt = `Улучши следующий текст сообщения для клиента${
    body.leadContext?.name ? ` (Клиент: ${body.leadContext.name})` : ''
  }:\n\n${body.text}`;

  // 1. Prefer Gemini API if GEMINI_API_KEY is available (FREE Tier!)
  if (geminiKey) {
    try {
      const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 600,
            },
          }),
        },
        12000
      );

      const data = await res.json();
      if (!res.ok) {
        return errorResponse(res.status, 'Ошибка вызова Gemini API', null, origin);
      }

      const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      return jsonResponse(200, { rewritten: outputText }, origin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      return errorResponse(500, `Ошибка соединения с Gemini API: ${msg}`, null, origin);
    }
  }

  // 2. Anthropic fallback
  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-sonnet-20241022';
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: 600,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        },
        12000
      );

      const data = await res.json();
      if (!res.ok) {
        return errorResponse(res.status, 'Ошибка вызова Anthropic API', null, origin);
      }

      const outputText = data?.content?.[0]?.text?.trim() || '';
      return jsonResponse(200, { rewritten: outputText }, origin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      return errorResponse(500, `Ошибка соединения с Anthropic API: ${msg}`, null, origin);
    }
  }

  return errorResponse(500, 'AI провайдер не найден', null, origin);
}
