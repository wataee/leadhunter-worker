import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkDistributedRateLimit,
  validatePayloadSize,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';
import {
  sanitizeInput,
  wrapUserData,
  PROMPT_INJECTION_DEFENSE,
  generateAiCompletion,
} from './_shared/ai';
import { detectTextLanguage, translateFreeNeural } from '../../src/shared/translate.js';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body?: string | null;
}

interface TranslateRequest {
  text?: string;
  targetLang?: 'ru' | 'en';
  sourceLang?: string;
  mode?: 'vacancy' | 'pitch' | 'auto';
  customAiApiKey?: string;
  customAiProvider?: 'gemini' | 'groq' | 'openrouter';
}

function hasAnyAiKey(customKey?: string): boolean {
  return Boolean(
    customKey?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GROQ_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim()
  );
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method Not Allowed. Use POST.', undefined, origin);
  }

  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(401, auth.error || 'Unauthorized', undefined, origin);
  }

  const clientIp =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    'unknown';
  const rate = await checkDistributedRateLimit(`translate:${clientIp}`, 60, 60_000);
  if (!rate.allowed) {
    return errorResponse(429, 'Слишком много запросов перевода. Подождите минуту.', undefined, origin);
  }

  const sizeCheck = validatePayloadSize(event.body ?? null, 16 * 1024);
  if (!sizeCheck.valid) {
    return errorResponse(413, sizeCheck.error || 'Payload too large', undefined, origin);
  }

  let body: TranslateRequest;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Невалидный JSON запрос.', undefined, origin);
  }

  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!rawText) {
    return errorResponse(400, 'Поле "text" обязательно.', undefined, origin);
  }

  const targetLang: 'ru' | 'en' = body.targetLang === 'en' ? 'en' : 'ru';
  const detectedSourceLang =
    body.sourceLang && body.sourceLang !== 'auto'
      ? body.sourceLang
      : detectTextLanguage(rawText);

  if (detectedSourceLang === targetLang) {
    return jsonResponse(
      200,
      {
        translatedText: rawText,
        provider: 'native',
        model: 'none',
        detectedSourceLang,
      },
      origin
    );
  }

  const safeText = sanitizeInput(rawText, 3500);

  // 1. Prefer free AI (Gemini / Groq / OpenRouter) when API key is configured
  if (hasAnyAiKey(body.customAiApiKey)) {
    const targetName = targetLang === 'en' ? 'natural professional English' : 'natural Russian (понятно для видеомонтажёра)';
    const contextHint =
      body.mode === 'pitch'
        ? 'The text is an outreach pitch from a freelance video editor to a client. Make it sound sharp, confident, concise, and natural.'
        : 'The text is a freelance video-editing job posting. Preserve clarity of deliverables, rates, software, and deadlines.';

    const systemPrompt = `${PROMPT_INJECTION_DEFENSE}

You are a precise bilingual video-production translator.
Translate the user-supplied text accurately into ${targetName}.
${contextHint}
STRICT RULES:
1. Preserve all @usernames, email addresses, URLs, numbers, and currency signs ($ / € / £ / ₸) verbatim.
2. Preserve editing tool names (Premiere Pro, After Effects, DaVinci Resolve, CapCut, YouTube, Reels, Shorts).
3. Preserve paragraph line breaks.
4. Output ONLY the translated text — no intro, no explanations, no quotes.`;

    const userPrompt = wrapUserData(safeText, 'TEXT TO TRANSLATE');

    try {
      const aiRes = await generateAiCompletion(
        systemPrompt,
        userPrompt,
        body.customAiApiKey
          ? {
              apiKey: body.customAiApiKey,
              provider: body.customAiProvider,
            }
          : undefined
      );

      if (aiRes?.text?.trim()) {
        return jsonResponse(
          200,
          {
            translatedText: aiRes.text.trim(),
            provider: aiRes.provider,
            model: aiRes.model,
            detectedSourceLang,
          },
          origin
        );
      }
    } catch {
      // Seamless fallback to zero-key neural MT below if free AI quota is temporarily exhausted
    }
  }

  // 2. Zero-key free neural MT fallback (Google GTX -> MyMemory)
  try {
    const neural = await translateFreeNeural(
      safeText,
      targetLang,
      detectedSourceLang === 'other' ? 'auto' : detectedSourceLang
    );

    return jsonResponse(
      200,
      {
        translatedText: neural.translatedText,
        provider: neural.provider,
        model: 'free-neural-nmt',
        detectedSourceLang: neural.detectedSourceLang || detectedSourceLang,
      },
      origin
    );
  } catch (err) {
    return errorResponse(
      502,
      'Не удалось перевести текст. Повторите попытку позже.',
      err instanceof Error ? err.message : String(err),
      origin
    );
  }
}
