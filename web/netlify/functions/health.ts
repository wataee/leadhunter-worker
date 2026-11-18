import { jsonResponse, handleOptions, fetchWithTimeout, type NetlifyResponse } from './_shared/response';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
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

  // 1. Telegram Bot (getMe)
  let telegramBot: { status: 'ok' | 'error' | 'not_configured'; username?: string; message?: string } = {
    status: 'not_configured',
    message: 'TELEGRAM_BOT_TOKEN не задан',
  };

  if (token) {
    try {
      const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`, {}, 3000);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.result) {
        telegramBot = {
          status: 'ok',
          username: data.result.username ? `@${data.result.username}` : data.result.first_name,
        };
      } else {
        telegramBot = {
          status: 'error',
          message: data?.description || `HTTP ${res.status}`,
        };
      }
    } catch (err: unknown) {
      telegramBot = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 3s',
      };
    }
  }

  // 2. Telegram Webhook (getWebhookInfo)
  let telegramWebhook: {
    status: 'ok' | 'not_set' | 'error' | 'not_configured';
    url?: string | null;
    pendingUpdates?: number;
    lastError?: string | null;
    message?: string;
  } = {
    status: 'not_configured',
  };

  if (token) {
    try {
      const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getWebhookInfo`, {}, 3000);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.result) {
        const info = data.result;
        telegramWebhook = {
          status: info.url ? 'ok' : 'not_set',
          url: info.url || null,
          pendingUpdates: info.pending_update_count || 0,
          lastError: info.last_error_message || null,
        };
      } else {
        telegramWebhook = {
          status: 'error',
          message: data?.description || `HTTP ${res.status}`,
        };
      }
    } catch (err: unknown) {
      telegramWebhook = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 3s',
      };
    }
  }

  // 3. Upstash Redis (PING)
  let redis: { status: 'ok' | 'error' | 'not_configured'; latencyMs?: number; message?: string } = {
    status: 'not_configured',
    message: 'UPSTASH_REDIS_REST_URL/TOKEN не настроены',
  };

  if (redisUrl && redisToken) {
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
        3000
      );
      if (res.ok) {
        redis = {
          status: 'ok',
          latencyMs: Date.now() - t0,
        };
      } else {
        redis = {
          status: 'error',
          message: `HTTP ${res.status}`,
        };
      }
    } catch (err: unknown) {
      redis = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 3s',
      };
    }
  }

  // 4. Worker (health check ping)
  let worker: { status: 'ok' | 'error' | 'not_configured'; message?: string; uptimeSeconds?: number } = {
    status: 'not_configured',
    message: 'TG_WORKER_URL не настроен',
  };

  if (workerUrl) {
    try {
      const res = await fetchWithTimeout(`${workerUrl.replace(/\/$/, '')}/`, {}, 3000);
      const data = await res.json().catch(() => null);
      if (res.ok) {
        worker = {
          status: 'ok',
          uptimeSeconds: data?.uptimeSeconds,
        };
      } else {
        worker = {
          status: 'error',
          message: `HTTP ${res.status}`,
        };
      }
    } catch (err: unknown) {
      worker = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Timeout 3s',
      };
    }
  }

  // 5. Конфигурация секретов (только boolean, без утечки значений)
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

  // Общий статус системы
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

  return jsonResponse(
    200,
    {
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
    },
    origin
  );
}
