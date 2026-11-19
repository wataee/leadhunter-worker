import { jsonResponse, handleOptions, fetchWithTimeout, type NetlifyResponse } from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
}

interface TelegramBotHealth {
  status: 'ok' | 'error' | 'not_configured';
  username?: string;
  message?: string;
}

interface TelegramWebhookHealth {
  status: 'ok' | 'not_set' | 'error' | 'not_configured';
  url?: string | null;
  pendingUpdates?: number;
  lastError?: string | null;
  message?: string;
}

interface RedisHealth {
  status: 'ok' | 'error' | 'not_configured';
  latencyMs?: number;
  message?: string;
}

interface WorkerHealth {
  status: 'ok' | 'error' | 'not_configured';
  message?: string;
  uptimeSeconds?: number;
}

interface HealthData {
  status: 'ok' | 'degraded' | 'error';
  youtube: boolean;
  telegram: boolean;
  ai: boolean;
  providers: {
    gemini: boolean;
    groq: boolean;
    openrouter: boolean;
    anthropic: boolean;
  };
  models: {
    gemini: string;
    groq: string;
    openrouter: string;
  };
  telegramBot: TelegramBotHealth;
  telegramWebhook: TelegramWebhookHealth;
  redis: RedisHealth;
  worker: WorkerHealth;
  config: {
    authConfigured: boolean;
    sessionSecretConfigured: boolean;
    webhookSecretConfigured: boolean;
    telegramChatIdConfigured: boolean;
    youtubeConfigured: boolean;
  };
  timestamp: string;
}

let cachedHealth: { data: HealthData; expiresAt: number } | null = null;

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (cachedHealth && Date.now() < cachedHealth.expiresAt) {
    return jsonResponse(200, cachedHealth.data, origin);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() || '';
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim() || '';
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || '';
  const workerUrl = (
    process.env.TG_WORKER_URL ||
    process.env.VITE_TG_WORKER_URL ||
    ''
  ).trim();

  const checkTelegramBot = async (): Promise<TelegramBotHealth> => {
    if (!token) {
      return {
        status: 'not_configured',
        message: 'TELEGRAM_BOT_TOKEN не задан',
      };
    }
    try {
      const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`, {}, 3500);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.result) {
        return {
          status: 'ok',
          username: data.result.username ? `@${data.result.username}` : data.result.first_name,
        };
      }
      return {
        status: 'error',
        message: data?.description || `HTTP ${res.status}`,
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 3.5s',
      };
    }
  };

  const checkTelegramWebhook = async (): Promise<TelegramWebhookHealth> => {
    if (!token) {
      return { status: 'not_configured' };
    }
    try {
      const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getWebhookInfo`, {}, 3500);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.result) {
        const info = data.result;
        return {
          status: info.url ? 'ok' : 'not_set',
          url: info.url || null,
          pendingUpdates: info.pending_update_count || 0,
          lastError: info.last_error_message || null,
        };
      }
      return {
        status: 'error',
        message: data?.description || `HTTP ${res.status}`,
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 3.5s',
      };
    }
  };

  const checkRedis = async (): Promise<RedisHealth> => {
    if (!redisUrl || !redisToken) {
      return {
        status: 'not_configured',
        message: 'UPSTASH_REDIS_REST_URL/TOKEN не настроены',
      };
    }
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(
        redisUrl.replace(/\/$/, ''),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(['PING']),
        },
        2500
      );
      if (res.ok) {
        return {
          status: 'ok',
          latencyMs: Date.now() - t0,
        };
      }
      return {
        status: 'error',
        message: `HTTP ${res.status}`,
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 2.5s',
      };
    }
  };

  const checkWorker = async (): Promise<WorkerHealth> => {
    if (!workerUrl) {
      return {
        status: 'not_configured',
        message: 'TG_WORKER_URL не настроен',
      };
    }
    try {
      const res = await fetchWithTimeout(`${workerUrl.replace(/\/$/, '')}/`, {}, 3500);
      const data = await res.json().catch(() => null);
      if (res.ok) {
        return {
          status: 'ok',
          uptimeSeconds: data?.uptimeSeconds,
        };
      }
      return {
        status: 'error',
        message: `HTTP ${res.status}`,
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 3.5s',
      };
    }
  };

  const [telegramBot, telegramWebhook, redis, worker] = await Promise.all([
    checkTelegramBot(),
    checkTelegramWebhook(),
    checkRedis(),
    checkWorker(),
  ]);

  const authConfigured = Boolean(process.env.APP_PASSWORD?.trim());
  const sessionSecretConfigured = Boolean(process.env.APP_SESSION_SECRET?.trim());
  const webhookSecretConfigured = Boolean(process.env.WEBHOOK_SECRET?.trim());
  const telegramChatIdConfigured = Boolean(chatId);
  const youtubeConfigured = Boolean(process.env.YOUTUBE_API_KEY?.trim());
  const providers = {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    groq: Boolean(process.env.GROQ_API_KEY?.trim()),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  };
  const models = {
    gemini: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
    groq: process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile',
    openrouter: process.env.OPENROUTER_MODEL?.trim() || 'meta-llama/llama-3.3-70b-instruct:free',
  };
  const aiConfigured = Boolean(
    providers.gemini || providers.groq || providers.openrouter || providers.anthropic
  );

  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';
  if (telegramBot.status === 'error' || redis.status === 'error' || worker.status === 'error') {
    overallStatus = 'error';
  } else if (
    telegramBot.status === 'not_configured' ||
    telegramWebhook.status === 'not_set' ||
    redis.status === 'not_configured' ||
    worker.status === 'not_configured' ||
    !authConfigured
  ) {
    overallStatus = 'degraded';
  }

  const resultData: HealthData = {
    status: overallStatus,
    youtube: youtubeConfigured,
    telegram: telegramBot.status === 'ok',
    ai: aiConfigured,
    providers,
    models,
    telegramBot,
    telegramWebhook,
    redis,
    worker,
    config: {
      authConfigured,
      sessionSecretConfigured,
      webhookSecretConfigured,
      telegramChatIdConfigured,
      youtubeConfigured,
    },
    timestamp: new Date().toISOString(),
  };

  cachedHealth = {
    data: resultData,
    expiresAt: Date.now() + 30_000,
  };

  return jsonResponse(200, resultData, origin);
}
