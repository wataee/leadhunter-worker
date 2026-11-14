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
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.');
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!geminiKey && !anthropicKey) {
    return errorResponse(
      400,
      'AI ключ не настроен. Добавьте бесплатный GEMINI_API_KEY (с aistudio.google.com) или ANTHROPIC_API_KEY в переменные окружения Netlify.'
    );
  }

  let body: RewriteBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON');
  }

  if (!body.text || !body.text.trim()) {
    return errorResponse(400, 'Передайте текст для улучшения.');
  }

  const userPrompt = `Улучши следующий текст сообщения для клиента${
    body.leadContext?.name ? ` (Клиент: ${body.leadContext.name})` : ''
  }:\n\n${body.text}`;

  // 1. Prefer Gemini API if GEMINI_API_KEY is available (FREE Tier!)
  if (geminiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`;
      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        return errorResponse(res.status, data?.error?.message || 'Ошибка вызова Gemini API');
      }

      const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      return jsonResponse(200, { rewritten: outputText });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      return errorResponse(500, `Ошибка соединения с Gemini API: ${msg}`);
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
        return errorResponse(res.status, data?.error?.message || 'Ошибка вызова Anthropic API');
      }

      const outputText = data?.content?.[0]?.text?.trim() || '';
      return jsonResponse(200, { rewritten: outputText });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      return errorResponse(500, `Ошибка соединения с Anthropic API: ${msg}`);
    }
  }

  return errorResponse(500, 'AI провайдер не найден');
}
