import { jsonResponse, handleOptions, type NetlifyResponse } from './_shared/response';
import { requireAuth } from './_shared/auth';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // 1.4 Публичный минимальный статус (не раскрывает провайдеры и настройки неавторизованным)
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return jsonResponse(
      200,
      {
        ok: true,
        ts: new Date().toISOString(),
      },
      origin
    );
  }

  // Подробный статус — только после успешной авторизации
  const hasYoutube = Boolean(process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_API_KEY.trim().length > 0);
  const hasTelegram = Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_BOT_TOKEN.trim().length > 0 &&
    process.env.TELEGRAM_CHAT_ID &&
    process.env.TELEGRAM_CHAT_ID.trim().length > 0
  );

  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0);

  const hasAi = hasGemini || hasGroq || hasOpenRouter || hasAnthropic;

  return jsonResponse(
    200,
    {
      ok: true,
      authenticated: true,
      youtube: hasYoutube,
      telegram: hasTelegram,
      ai: hasAi,
      activeProvider: hasGemini ? 'gemini' : hasGroq ? 'groq' : hasOpenRouter ? 'openrouter' : hasAnthropic ? 'anthropic' : null,
      providers: {
        gemini: { configured: hasGemini, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' },
        groq: { configured: hasGroq, model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
        openrouter: { configured: hasOpenRouter, model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free' },
        anthropic: { configured: hasAnthropic, model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022' },
      },
      timestamp: new Date().toISOString(),
    },
    origin
  );
}
