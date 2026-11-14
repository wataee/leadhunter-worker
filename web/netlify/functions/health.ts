import { jsonResponse, handleOptions, type NetlifyResponse } from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

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

  return jsonResponse(200, {
    youtube: hasYoutube,
    telegram: hasTelegram,
    ai: hasAi,
    aiProvider: hasGemini ? 'gemini' : hasGroq ? 'groq' : hasOpenRouter ? 'openrouter' : hasAnthropic ? 'anthropic' : null,
    providers: {
      gemini: hasGemini,
      groq: hasGroq,
      openrouter: hasOpenRouter,
      anthropic: hasAnthropic,
    },
    models: {
      gemini: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      openrouter: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    },
    timestamp: new Date().toISOString(),
  });
}
