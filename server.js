import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
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

const ALLOWED_CHATS = ALLOWED_CHATS_RAW
  ? ALLOWED_CHATS_RAW.split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
  : null;

// 2. Хранилище на диске (data/recent.json, data/failed-queue.json)
const DATA_DIR = path.resolve('data');
const RECENT_FILE = path.join(DATA_DIR, 'recent.json');
const FAILED_QUEUE_FILE = path.join(DATA_DIR, 'failed-queue.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn(`[Хранилище] Не удалось создать папку ${DATA_DIR}:`, err.message);
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let recentLeads = [];
let failedQueue = [];

function loadDataFromDisk() {
  try {
    if (fs.existsSync(RECENT_FILE)) {
      const raw = fs.readFileSync(RECENT_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        recentLeads = parsed
          .filter((item) => {
            const time = new Date(item.postedAt || item.createdAt || 0).getTime();
            return now - time <= SEVEN_DAYS_MS;
          })
          .slice(0, 500);
        console.log(`[Хранилище] Загружено ${recentLeads.length} недавних лидов из ${RECENT_FILE}`);
      }
    }
  } catch (err) {
    console.warn('[Хранилище] Ошибка загрузки recent.json:', err.message);
    recentLeads = [];
  }

  try {
    if (fs.existsSync(FAILED_QUEUE_FILE)) {
      const raw = fs.readFileSync(FAILED_QUEUE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        failedQueue = parsed;
        console.log(`[Хранилище] Загружено ${failedQueue.length} недоставленных сообщений из очереди`);
      }
    }
  } catch (err) {
    console.warn('[Хранилище] Ошибка загрузки failed-queue.json:', err.message);
    failedQueue = [];
  }
}

function saveDataToDisk() {
  try {
    fs.writeFileSync(RECENT_FILE, JSON.stringify(recentLeads.slice(0, 500), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Хранилище] Ошибка сохранения recent.json:', err.message);
  }

  try {
    fs.writeFileSync(FAILED_QUEUE_FILE, JSON.stringify(failedQueue, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Хранилище] Ошибка сохранения failed-queue.json:', err.message);
  }
}

loadDataFromDisk();

// 3. Статистика и дедупликация (24 часа)
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

// Дедупликация: Map<id | hash, timestamp>
const deduplicationCache = new Map();

function isDuplicate(leadId, textHash) {
  const now = Date.now();
  // Очистка старых записей
  for (const [key, ts] of deduplicationCache.entries()) {
    if (now - ts > TWENTY_FOUR_HOURS_MS) {
      deduplicationCache.delete(key);
    }
  }

  if (deduplicationCache.has(leadId) || deduplicationCache.has(textHash)) {
    return true;
  }

  deduplicationCache.set(leadId, now);
  deduplicationCache.set(textHash, now);
  return false;
}

// Заполняем дедупликацию из загруженных recentLeads
for (const lead of recentLeads) {
  if (lead.id) deduplicationCache.set(lead.id, Date.now());
  if (lead.text) deduplicationCache.set(computeTextHash(lead.text), Date.now());
}

// 4. Rate Limiter для уведомлений и группировка в дайджест
const notificationTimestamps = [];
let pendingDigestLeads = [];
let digestTimer = null;

function checkRateLimit() {
  const now = Date.now();
  // Удаляем отметки старше 60 секунд
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
      const headers = { 'Content-Type': 'application/json' };
      if (WEBHOOK_SECRET) {
        headers['X-Webhook-Secret'] = WEBHOOK_SECRET;
      }

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

// Обработка очереди недоставленных
async function processFailedQueue() {
  if (failedQueue.length === 0) return;
  console.log(`[Вебхук] Досылка ${failedQueue.length} лидов из failed-queue...`);

  const remaining = [];
  for (const item of failedQueue) {
    const ok = await sendWebhookWithRetry(item, 1);
    if (!ok) {
      remaining.push(item);
    }
  }

  failedQueue = remaining;
  saveDataToDisk();
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
      failedQueue.push(payload);
      saveDataToDisk();
    }
  } else {
    // Превышен лимит: группируем в дайджест
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
          failedQueue.push(digestPayload);
          saveDataToDisk();
        }
      }, 60000);
    }
  }
}

// 6. Проверка секрета для эндпоинта /recent
function verifySecret(provided) {
  if (!WEBHOOK_SECRET) return true;
  if (!provided || typeof provided !== 'string') return false;
  const pBuf = Buffer.from(provided);
  const sBuf = Buffer.from(WEBHOOK_SECRET);
  if (pBuf.length !== sBuf.length) return false;
  return crypto.timingSafeEqual(pBuf, sBuf);
}

// 7. Состояние подключения Telegram
let telegramConnected = false;
let lastMessageAt = null;
let disconnectedSince = null;
let client = null;

// 8. Встроенный Health-check HTTP сервер
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Защищённый эндпоинт /recent (только с секретом)
  if (urlObj.pathname === '/recent') {
    const authHeader = req.headers['x-webhook-secret'] || '';
    const queryKey = urlObj.searchParams.get('key') || '';
    const provided = typeof authHeader === 'string' && authHeader ? authHeader : queryKey;

    if (!verifySecret(provided)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing secret' }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ stats, privacyStats, leads: recentLeads }, null, 2));
  }

  // Публичный health-check эндпоинт
  // Если MTProto отвалился и не может переподключиться > 2 минут — отдаём 503
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

  // Запуск очистки очереди повторов каждые 2 минуты
  setInterval(() => {
    processFailedQueue().catch((err) => console.warn('[Очередь] Ошибка фоновой очистки:', err.message));
  }, 2 * 60 * 1000);

  // Самопинг каждые 10 минут, если задан RENDER_EXTERNAL_URL
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

// 9. Запуск Telegram MTProto клиента с обработкой разрывов и переподключений
if (!SESSION_STRING) {
  console.error('\n[ВНИМАНИЕ] SESSION_STRING не задан в .env файле!');
  console.error('Сначала выполните команду: npm run auth\n');
  process.exit(1);
}

async function startListener() {
  console.log('[Telegram] Подключение к Telegram через MTProto...');
  const stringSession = new StringSession(SESSION_STRING);
  client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 10,
    useWSS: false,
  });

  // Отслеживание состояния подключения
  const updateConnectionState = () => {
    try {
      const isConn = Boolean(client && client.connected);
      if (isConn !== telegramConnected) {
        telegramConnected = isConn;
        if (isConn) {
          console.log('[Telegram] Соединение MTProto активно.');
          disconnectedSince = null;
        } else {
          console.warn('[Telegram] Соединение MTProto разорвано!');
          if (!disconnectedSince) disconnectedSince = Date.now();
        }
      }
    } catch {}
  };

  setInterval(updateConnectionState, 5000);

  await client.connect();
  telegramConnected = true;
  disconnectedSince = null;

  const me = await client.getMe();
  console.log(`[Telegram] Успешно подключено под аккаунтом: ${me.firstName} (@${me.username || me.phone})`);
  if (ALLOWED_CHATS) {
    console.log(`[Telegram] Белый список чатов активен (${ALLOWED_CHATS.length} чатов)`);
  }
  console.log('[Telegram] Режим слушателя активен: отслеживаю каналы и группы 24/7...\n');

  // Досылаем недоставленные при старте
  processFailedQueue().catch(() => {});

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message || !message.text) return;

      lastMessageAt = new Date().toISOString();

      // 1.2 Приватность: фильтруем исходящие, личные переписки и ботов
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

      // Получаем информацию о чате для белого списка и ссылок
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

      // Фильтрация по белому списку (если задан)
      if (ALLOWED_CHATS && ALLOWED_CHATS.length > 0) {
        const isAllowed =
          (chatUsername && ALLOWED_CHATS.includes(chatUsername)) ||
          (cleanCId && ALLOWED_CHATS.includes(cleanCId));

        if (!isAllowed) {
          privacyStats.skippedNotAllowed++;
          return;
        }
      }

      stats.messagesProcessed++;

      // 2.3 Фильтрация вакансий с регулярными выражениями и стоп-листом соискателей
      const matchResult = matchesVacancy(message.text);
      if (!matchResult.isMatch) {
        return;
      }

      // 2.1 Идентификаторы, время и дедупликация
      const leadId = buildLeadId(rawChatId, message.id);
      const textHash = computeTextHash(message.text);

      if (isDuplicate(leadId, textHash)) {
        return;
      }

      stats.leadsFound++;
      stats.lastLeadAt = new Date().toISOString();

      // 2.2 Формирование ссылки на пост
      const postUrl = buildPostUrl(
        chatUsername ? { username: chatUsername } : { id: rawChatId },
        message.id
      );

      // 2.3б Парсер бюджета
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

      // 2.5 Сохранение в recentLeads и сброс на диск
      recentLeads.unshift(leadItem);
      if (recentLeads.length > 500) {
        recentLeads.pop();
      }
      saveDataToDisk();

      // 2.4 Отправка на вебхук с rate limit и очередью
      await dispatchLeadNotification(leadItem);
    } catch (err) {
      console.error('[Ошибка обработки сообщения]:', err.message);
    }
  }, new NewMessage({}));
}

// 10. Глобальный перехват ошибок и Graceful Shutdown (2.6)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] Необработанное отклонение промиса:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Необработанное исключение:', err);
});

async function handleShutdown(signal) {
  console.log(`\n[Shutdown] Получен сигнал ${signal}. Завершение работы...`);
  try {
    saveDataToDisk();
    if (server) {
      server.close(() => console.log('[Shutdown] HTTP-сервер остановлен'));
    }
    if (client) {
      await client.disconnect();
      console.log('[Shutdown] Telegram MTProto отключен');
    }
  } catch (err) {
    console.error('[Shutdown] Ошибка при завершении:', err.message);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startListener().catch((err) => {
  console.error('[Критическая ошибка Telegram Listener]:', err);
});
