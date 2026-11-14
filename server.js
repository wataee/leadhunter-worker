import http from 'http';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { parseBudget } from './web/src/shared/budget.js';
import {
  matchesVacancy,
  buildPostUrl,
  buildLeadId,
  computeTextHash,
  cleanChatId,
} from './web/src/shared/filter.js';
import { createStorage } from './storage.js';

dotenv.config();

// 1. Конфигурация и валидация
const rawApiId = process.env.API_ID?.trim();
const API_HASH = process.env.API_HASH?.trim();
const SESSION_STRING = process.env.SESSION_STRING?.trim() || '';
const PORT = parseInt(process.env.PORT || '8080', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL?.trim() || 'https://fleurleads-work.netlify.app/api/tg-notify';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET?.trim() || '';
const ALLOWED_CHATS_RAW = process.env.ALLOWED_CHATS?.trim() || '';
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '5', 10);

if (!rawApiId || !API_HASH) {
  console.error('[КРИТИЧЕСКАЯ ОШИБКА] Переменные API_ID и API_HASH обязательны!');
  console.error('Задайте их в .env файле или в панели управления Render.');
  process.exit(1);
}

const API_ID = parseInt(rawApiId, 10);
if (isNaN(API_ID) || API_ID <= 0) {
  console.error('[КРИТИЧЕСКАЯ ОШИБКА] API_ID должен быть положительным числом.');
  process.exit(1);
}

if (!/^[a-fA-F0-9]{32}$/.test(API_HASH)) {
  console.error('[КРИТИЧЕСКАЯ ОШИБКА] API_HASH должен состоять из 32 шестнадцатеричных символов.');
  process.exit(1);
}

if (!WEBHOOK_SECRET || WEBHOOK_SECRET.length < 16) {
  console.error('[КРИТИЧЕСКАЯ ОШИБКА] Переменная WEBHOOK_SECRET обязательна и должна содержать минимум 16 символов!');
  console.error('Сгенерируйте надёжный секрет (например: openssl rand -hex 32) и укажите в .env');
  process.exit(1);
}

const ALLOWED_CHATS_FILE = process.env.ALLOWED_CHATS_FILE?.trim() || '';

let allowedChatsSet = null;

function loadAllowedChats() {
  const chats = new Set();
  // 1. From env ALLOWED_CHATS
  if (ALLOWED_CHATS_RAW) {
    ALLOWED_CHATS_RAW.split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
      .forEach((c) => chats.add(c));
  }
  // 2. From ALLOWED_CHATS_FILE (reloaded every 10 mins)
  if (ALLOWED_CHATS_FILE && fs.existsSync(ALLOWED_CHATS_FILE)) {
    try {
      const content = fs.readFileSync(ALLOWED_CHATS_FILE, 'utf8');
      content
        .split(/[\r\n,]+/)
        .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
        .filter((s) => Boolean(s) && !s.startsWith('#'))
        .forEach((c) => chats.add(c));
    } catch (err) {
      console.error(`[AllowedChats] Ошибка чтения файла ${ALLOWED_CHATS_FILE}:`, err.message);
    }
  }

  if (chats.size > 0) {
    allowedChatsSet = chats;
    console.log(`[AllowedChats] Белый список активен (${chats.size} чатов/каналов)`);
  } else {
    allowedChatsSet = null;
  }
}

// Initial load
loadAllowedChats();

// Auto-reload every 10 minutes if ALLOWED_CHATS_FILE is set
if (ALLOWED_CHATS_FILE) {
  setInterval(loadAllowedChats, 10 * 60 * 1000);
}

// Backward compatibility alias for diagnostics
const ALLOWED_CHATS = allowedChatsSet ? Array.from(allowedChatsSet) : null;

// 2. Хранилище (Storage abstraction: File or Upstash Redis)
const storage = createStorage();

// 3. Статистика
const stats = {
  startedAt: new Date().toISOString(),
  messagesProcessed: 0,
  leadsFound: 0,
  lastLeadAt: null,
};

const privacyStats = {
  skippedOutgoing: 0,
  skippedPrivate: 0,
  skippedBots: 0,
  skippedNotAllowed: 0,
};

let errorsCount = 0;

// 4. Rate Limiter для уведомлений и группировка в дайджест
const notificationTimestamps = [];
let pendingDigestLeads = [];
let digestTimer = null;

function checkRateLimit() {
  const now = Date.now();
  while (notificationTimestamps.length > 0 && now - notificationTimestamps[0] > 60000) {
    notificationTimestamps.shift();
  }
  return notificationTimestamps.length < RATE_LIMIT_PER_MINUTE;
}

// 5. Доставка на вебхук с экспоненциальным backoff (1s, 4s, 16s) и таймаутом 8s
async function sendWebhookWithRetry(payload, maxRetries = 3) {
  if (!WEBHOOK_URL) return true;

  const backoffs = [1000, 4000, 16000];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET,
      };

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        return true;
      }

      console.warn(`[Вебхук] HTTP ${res.status} на попытке ${attempt + 1}/${maxRetries}`);
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err.name === 'AbortError';
      console.warn(`[Вебхук] Ошибка доставки (${isAbort ? 'Timeout 8s' : err.message}) на попытке ${attempt + 1}/${maxRetries}`);
    }

    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, backoffs[attempt]));
    }
  }

  return false;
}

// Обработка очереди повторов
async function processFailedQueue() {
  const queue = storage.getFailedQueue();
  if (queue.length === 0) return;

  console.log(`[Вебхук] Досылка ${queue.length} лидов из failed-queue...`);

  for (const item of [...queue]) {
    const ok = await sendWebhookWithRetry(item.payload, 1);
    if (ok) {
      storage.dequeueFailed(item.id);
    } else {
      storage.recordQueueAttempt(item.id, 'Failed webhook delivery on retry');
    }
  }
}

async function dispatchLeadNotification(leadItem) {
  if (!WEBHOOK_URL) return;

  if (checkRateLimit()) {
    notificationTimestamps.push(Date.now());
    const payload = {
      title: `Вакансия монтажёра (${leadItem.channel})`,
      text: leadItem.text,
      url: leadItem.url,
      channel: leadItem.channel,
      budget: leadItem.budget,
    };

    const sent = await sendWebhookWithRetry(payload);
    if (!sent) {
      storage.enqueueFailed(payload, 'Delivery failed after 3 retries');
    }
  } else {
    pendingDigestLeads.push(leadItem);
    console.log(`[Вебхук Rate Limit] Превышен лимит ${RATE_LIMIT_PER_MINUTE}/мин, добавлено в дайджест (${pendingDigestLeads.length})`);

    if (!digestTimer) {
      digestTimer = setTimeout(async () => {
        digestTimer = null;
        if (pendingDigestLeads.length === 0) return;

        const count = pendingDigestLeads.length;
        const digestSummary = pendingDigestLeads
          .slice(0, 5)
          .map((l, i) => `${i + 1}. ${l.channel}: ${l.text.slice(0, 100)}...\n${l.url}`)
          .join('\n\n');

        const digestPayload = {
          title: `Дайджест: ${count} новых вакансий монтажа`,
          text: `Найдено ${count} вакансий за последнюю минуту:\n\n${digestSummary}`,
          url: pendingDigestLeads[0].url,
          channel: 'LeadHunter Digest',
        };

        pendingDigestLeads = [];
        notificationTimestamps.push(Date.now());

        const sent = await sendWebhookWithRetry(digestPayload);
        if (!sent) {
          storage.enqueueFailed(digestPayload, 'Digest delivery failed');
        }
      }, 60000);
    }
  }
}

// 6. Проверка секрета для защищённых эндпоинтов
function verifySecret(provided) {
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET.length < 16) return false;
  if (!provided || typeof provided !== 'string') return false;
  const pBuf = crypto.createHash('sha256').update(provided).digest();
  const sBuf = crypto.createHash('sha256').update(WEBHOOK_SECRET).digest();
  return crypto.timingSafeEqual(pBuf, sBuf);
}

// 7. Состояние подключения Telegram
let telegramConnected = false;
let lastMessageAt = null;
let disconnectedSince = Date.now(); // 2.1 Явное состояние отключения на старте
let client = null;
let eventHandlerRef = null;
let reconnectTimer = null;
let reconnectDelayMs = 5000;
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000; // 5 минут
let isShuttingDown = false;

// 8. Встроенный Health-check HTTP сервер
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Защищённый эндпоинт /recent
  if (urlObj.pathname === '/recent') {
    const authHeader = req.headers['x-webhook-secret'] || '';
    const queryKey = urlObj.searchParams.get('key') || '';
    const provided = typeof authHeader === 'string' && authHeader ? authHeader : queryKey;

    if (!verifySecret(provided)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing secret' }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify(
        {
          stats,
          privacyStats,
          leads: storage.getRecentLeads(),
        },
        null,
        2
      )
    );
  }

  // 2.2 Защищённый эндпоинт /metrics
  if (urlObj.pathname === '/metrics') {
    const authHeader = req.headers['x-webhook-secret'] || '';
    const queryKey = urlObj.searchParams.get('key') || '';
    const provided = typeof authHeader === 'string' && authHeader ? authHeader : queryKey;

    if (!verifySecret(provided)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing secret' }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify(
        {
          service: 'LeadHunter Telegram Worker',
          uptimeSeconds: Math.floor(process.uptime()),
          telegramConnected,
          disconnectedSince: disconnectedSince ? new Date(disconnectedSince).toISOString() : null,
          lastMessageAt,
          stats,
          privacyStats,
          failedQueueCount: storage.getFailedQueue().length,
          recentLeadsCount: storage.getRecentLeads().length,
          errorsCount,
        },
        null,
        2
      )
    );
  }

  // Публичный health-check эндпоинт
  // Если не на связи > 2 минут — отдаём 503
  const isStalled = disconnectedSince && Date.now() - disconnectedSince > 2 * 60 * 1000;
  const statusCode = isStalled ? 503 : 200;

  res.setHeader('Content-Type', 'application/json');
  res.writeHead(statusCode);
  res.end(
    JSON.stringify(
      {
        status: isStalled ? 'degraded' : 'online',
        service: 'LeadHunter 24/7 Telegram Listener',
        uptimeSeconds: Math.floor(process.uptime()),
        telegram: {
          connected: telegramConnected,
          lastMessageAt,
          disconnectedSince: disconnectedSince ? new Date(disconnectedSince).toISOString() : null,
        },
      },
      null,
      2
    )
  );
});

server.listen(PORT, () => {
  console.log(`[Health-Check] HTTP-сервер запущен на порту ${PORT}`);

  setInterval(() => {
    processFailedQueue().catch((err) => console.warn('[Очередь] Ошибка фоновой очистки:', err.message));
  }, 2 * 60 * 1000);

  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (selfUrl) {
    setInterval(async () => {
      try {
        await fetch(`${selfUrl}/`);
        console.log(`[Keep-Alive] Самопинг OK → ${selfUrl}`);
      } catch (err) {
        console.warn(`[Keep-Alive] Ошибка самопинга: ${err.message}`);
      }
    }, 10 * 60 * 1000);
  }
});

// 9. Запуск Telegram MTProto клиента с обработкой разрывов и экспоненциальным backoff
if (!SESSION_STRING) {
  console.error('\n[ВНИМАНИЕ] SESSION_STRING не задан в .env файле!');
  console.error('Сначала выполните команду: npm run auth\n');
  process.exit(1);
}

async function connectTelegram() {
  if (isShuttingDown) return;

  // Очистка предыдущего клиента и слушателей во избежание дубликатов
  if (client) {
    try {
      if (eventHandlerRef) {
        client.removeEventHandler(eventHandlerRef);
        eventHandlerRef = null;
      }
      await client.disconnect();
    } catch {}
    client = null;
  }

  console.log('[Telegram] Подключение к Telegram через MTProto...');
  disconnectedSince = disconnectedSince || Date.now();
  telegramConnected = false;

  try {
    const stringSession = new StringSession(SESSION_STRING);
    client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: false,
    });

    await client.connect();

    const me = await client.getMe();
    console.log(`[Telegram] Успешно подключено под аккаунтом: ${me.firstName} (@${me.username || me.phone})`);

    telegramConnected = true;
    disconnectedSince = null;
    reconnectDelayMs = 5000; // Сброс задержки при успехе

    if (ALLOWED_CHATS) {
      console.log(`[Telegram] Белый список чатов активен (${ALLOWED_CHATS.length} чатов)`);
    }
    console.log('[Telegram] Режим слушателя активен: отслеживаю каналы и группы 24/7...\n');

    processFailedQueue().catch(() => {});

    eventHandlerRef = async (event) => {
      try {
        const message = event.message;
        if (!message || !message.text) return;

        lastMessageAt = new Date().toISOString();

        if (message.out) {
          privacyStats.skippedOutgoing++;
          return;
        }

        const isChannel = Boolean(event.isChannel || message.isChannel);
        const isGroup = Boolean(event.isGroup || message.isGroup);
        const isPrivate = Boolean(event.isPrivate || message.isPrivate);

        if (isPrivate || (!isChannel && !isGroup)) {
          privacyStats.skippedPrivate++;
          return;
        }

        let chatTitle = 'Telegram';
        let chatUsername = '';
        let rawChatId = message.chatId || '';

        try {
          const chat = await message.getChat();
          if (chat) {
            if ('bot' in chat && chat.bot) {
              privacyStats.skippedBots++;
              return;
            }
            chatTitle = chat.title || chat.username || 'Чат';
            chatUsername = chat.username ? chat.username.toLowerCase().replace(/^@/, '') : '';
            if (chat.id) rawChatId = chat.id;
          }
        } catch {}

        const cleanCId = cleanChatId(rawChatId);

        if (allowedChatsSet && allowedChatsSet.size > 0) {
          const isAllowed =
            (chatUsername && allowedChatsSet.has(chatUsername)) ||
            (cleanCId && allowedChatsSet.has(cleanCId));

          if (!isAllowed) {
            privacyStats.skippedNotAllowed++;
            return;
          }
        }

        stats.messagesProcessed++;

        // 2.4 Фильтрация вакансий с регулярными выражениями и стоп-листом соискателей
        const matchResult = matchesVacancy(message.text);
        if (!matchResult.isMatch) {
          return;
        }

        const leadId = buildLeadId(rawChatId, message.id);
        const textHash = computeTextHash(message.text);

        if (await storage.isDuplicate(leadId, textHash)) {
          return;
        }

        stats.leadsFound++;
        stats.lastLeadAt = new Date().toISOString();

        const postUrl = buildPostUrl(
          chatUsername ? { username: chatUsername } : { id: rawChatId },
          message.id
        );

        const budget = parseBudget(message.text);

        const postedAt = message.date
          ? new Date(message.date * 1000).toISOString()
          : new Date().toISOString();

        const leadItem = {
          id: leadId,
          channel: chatUsername ? `@${chatUsername}` : chatTitle,
          text: message.text,
          url: postUrl,
          matchedKeywords: matchResult.matched,
          budget,
          postedAt,
        };

        console.log(`\n🔥 [НАЙДЕНА ВАКАНСИЯ] в "${chatTitle}" (${matchResult.matched.join(', ')})`);
        if (budget) {
          console.log(`💰 Бюджет: ${budget.currency === 'NEGOTIABLE' ? 'Договорной' : `${budget.min || ''}-${budget.max || ''} ${budget.currency}`}`);
        }
        console.log(`Текст: ${message.text.slice(0, 140)}...`);
        console.log(`Ссылка: ${postUrl}\n`);

        storage.addRecentLead(leadItem);
        await dispatchLeadNotification(leadItem);
      } catch (err) {
        errorsCount++;
        console.error('[Ошибка обработки сообщения]:', err.message);
      }
    };

    client.addEventHandler(eventHandlerRef, new NewMessage({}));
  } catch (err) {
    errorsCount++;
    telegramConnected = false;
    if (!disconnectedSince) disconnectedSince = Date.now();

    const errStr = String(err.message || err);
    console.error(`[Telegram] Ошибка подключения: ${errStr}`);

    if (errStr.includes('AUTH_KEY_UNREGISTERED') || errStr.includes('SESSION_REVOKED')) {
      console.error('[Telegram КРИТИЧЕСКАЯ ОШИБКА] Сессия Telegram аннулирована (AUTH_KEY_UNREGISTERED)!');
      console.error('Необходимо заново пройти авторизацию: npm run auth');
      await handleShutdown('AUTH_KEY_UNREGISTERED', 1);
      return;
    }

    const floodMatch = errStr.match(/FLOOD_WAIT_(\d+)/i);
    let waitMs = reconnectDelayMs;
    if (floodMatch) {
      const waitSeconds = parseInt(floodMatch[1], 10);
      console.warn(`[Telegram FLOOD_WAIT] Telegram запросил ожидание ${waitSeconds} секунд`);
      waitMs = (waitSeconds + 2) * 1000;
    } else {
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    }

    console.log(`[Telegram Reconnect] Повторная попытка подключения через ${Math.round(waitMs / 1000)} сек...`);
    reconnectTimer = setTimeout(connectTelegram, waitMs);
  }
}

connectTelegram();

// 10. Глобальный перехват ошибок и Graceful Shutdown (2.1)
async function handleShutdown(signal, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (reconnectTimer) clearTimeout(reconnectTimer);

  console.log(`\n[Shutdown] Получен сигнал ${signal}. Завершение работы...`);
  try {
    storage.flush();
    if (server) {
      server.close(() => console.log('[Shutdown] HTTP-сервер остановлен'));
    }
    if (client) {
      const disconnectPromise = client.disconnect();
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([disconnectPromise, timeoutPromise]);
      console.log('[Shutdown] Telegram MTProto отключен');
    }
  } catch (err) {
    console.error('[Shutdown] Ошибка при завершении:', err.message);
  } finally {
    process.exit(exitCode);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] Необработанное отклонение промиса:', reason);
  errorsCount++;
  handleShutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Необработанное исключение:', err);
  errorsCount++;
  handleShutdown('uncaughtException', 1);
});

process.on('SIGTERM', () => handleShutdown('SIGTERM', 0));
process.on('SIGINT', () => handleShutdown('SIGINT', 0));
