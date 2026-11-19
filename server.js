import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { parseBudget } from './web/src/shared/budget.js';
import { detectVacancyRegion } from './web/src/shared/regions.js';
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
const rawWebhookUrl = process.env.WEBHOOK_URL?.trim() || '';
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

// B4: WEBHOOK_URL опционален для старта воркера
let WEBHOOK_URL = '';
const allowAnyHost =
  process.env.ALLOW_ANY_WEBHOOK_HOST === '1' ||
  process.env.ALLOW_ANY_WEBHOOK_HOST === 'true';
const allowedOriginRaw = process.env.ALLOWED_ORIGIN?.trim() || '';

if (!rawWebhookUrl) {
  console.warn(
    '[ВНИМАНИЕ] WEBHOOK_URL не задан: уведомления в Netlify/бота отключены, посты собираются только в recent.json / memory'
  );
} else {
  let parsedWebhook;
  try {
    parsedWebhook = new URL(rawWebhookUrl);
  } catch {
    console.error('[КРИТИЧЕСКАЯ ОШИБКА] WEBHOOK_URL имеет невалидный формат URL.');
    process.exit(1);
  }

  if (
    parsedWebhook.protocol !== 'https:' &&
    parsedWebhook.hostname !== 'localhost' &&
    parsedWebhook.hostname !== '127.0.0.1'
  ) {
    console.error('[КРИТИЧЕСКАЯ ОШИБКА] WEBHOOK_URL должен использовать протокол HTTPS!');
    process.exit(1);
  }

  if (!allowAnyHost && allowedOriginRaw) {
    const allowedHosts = allowedOriginRaw
      .split(',')
      .map((o) => {
        try {
          return new URL(o.trim()).hostname;
        } catch {
          return o.trim().replace(/^https?:\/\//, '').split('/')[0];
        }
      })
      .filter(Boolean);

    if (allowedHosts.length > 0 && !allowedHosts.includes(parsedWebhook.hostname)) {
      console.error(
        `[КРИТИЧЕСКАЯ ОШИБКА] Домен WEBHOOK_URL (${parsedWebhook.hostname}) не совпадает с ALLOWED_ORIGIN (${allowedHosts.join(', ')}).`
      );
      console.error('Укажите ALLOW_ANY_WEBHOOK_HOST=1 или добавьте домен в ALLOWED_ORIGIN');
      process.exit(1);
    }
  }

  WEBHOOK_URL = rawWebhookUrl;
}

const ALLOWED_CHATS_FILE = process.env.ALLOWED_CHATS_FILE?.trim() || '';
let allowedChatsSet = null;
const channelPriorityMap = new Map();

function updateChannelPriorityFromCatalog() {
  try {
    const catalogPath = './web/src/shared/sources.catalog.json';
    if (fs.existsSync(catalogPath)) {
      const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      if (Array.isArray(catalogData)) {
        catalogData.forEach((item) => {
          if (item.username) {
            const uname = item.username.toLowerCase().replace(/^@/, '');
            const gigRate = typeof item.gigRate === 'number' ? item.gigRate : (item.recommended ? 0.2 : 0.02);
            channelPriorityMap.set(uname, {
              gigRate,
              recommended: !!item.recommended,
              qualityScore: item.qualityScore || 50,
              enabled: item.enabled !== false && item.status !== 'stale' && item.status !== 'dead',
            });
          }
        });
      }
    }
  } catch (err) {
    console.error('[AllowedChats] Ошибка чтения метаданных каталога:', err.message);
  }
}

// B2: Вывод размера и первых 10 каналов в лог при старте
function logAllowedChatsSummary(chats) {
  if (!chats || chats.size === 0) {
    console.warn(
      '[AllowedChats] ВНИМАНИЕ: мониторинг не будет находить вакансии, так как список разрешённых каналов пуст!'
    );
    return;
  }
  const sample = Array.from(chats).slice(0, 10).map((c) => `@${c}`).join(', ');
  console.log(`[AllowedChats] Белый список активен (${chats.size} каналов). Первые: ${sample}`);
}

function loadAllowedChats() {
  const chats = new Set();
  // 1. From env ALLOWED_CHATS
  if (ALLOWED_CHATS_RAW) {
    ALLOWED_CHATS_RAW.split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
      .forEach((c) => chats.add(c));
  }
  // 2. From ALLOWED_CHATS_FILE
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

  // 3. Fallback: verified EU/US/KZ catalog
  if (chats.size === 0) {
    try {
      const catalogPath = './web/src/shared/sources.catalog.json';
      if (fs.existsSync(catalogPath)) {
        const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        if (Array.isArray(catalogData)) {
          catalogData.forEach((item) => {
            if (item.username) {
              chats.add(item.username.toLowerCase().replace(/^@/, ''));
            }
          });
        }
      }
    } catch (err) {
      console.error('[AllowedChats] Ошибка чтения каталога:', err.message);
    }
  }

  if (chats.size > 0) {
    allowedChatsSet = chats;
    logAllowedChatsSummary(chats);
  } else {
    allowedChatsSet = null;
    logAllowedChatsSummary(null);
  }
}

const activeIntervals = [];
function trackInterval(fn, ms) {
  const id = setInterval(fn, ms);
  activeIntervals.push(id);
  return id;
}

loadAllowedChats();
updateChannelPriorityFromCatalog();

if (ALLOWED_CHATS_FILE) {
  trackInterval(loadAllowedChats, 10 * 60 * 1000);
}

// B5: Периодическая синхронизация источников с обработкой ошибок и rate-limit логов
let lastSyncErrorStatus = 0;
let lastSyncErrorLogAt = 0;

async function syncEnabledSourcesFromApi() {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) return;

  try {
    const originUrl = new URL(WEBHOOK_URL).origin;
    const apiUrl = `${originUrl}/api/sources-enabled`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${WEBHOOK_SECRET}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.sources)) {
        if (data.sources.length > 0) {
          const chats = new Set(data.sources.map((s) => String(s).toLowerCase().replace(/^@/, '')));
          allowedChatsSet = chats;
          console.log(`[AllowedChats] Белый список обновлён из API (${chats.size} каналов)`);
        } else {
          console.warn('[AllowedChats Sync] sources-enabled вернул пустой список источников, сохраняем текущий белый список');
        }
      } else {
        console.warn('[AllowedChats Sync] sources-enabled вернул не массив sources, игнорируем ответ');
      }
    } else {
      const now = Date.now();
      if (res.status !== lastSyncErrorStatus || now - lastSyncErrorLogAt > 30 * 60 * 1000) {
        lastSyncErrorStatus = res.status;
        lastSyncErrorLogAt = now;
        const textSnippet = (await res.text().catch(() => '')).slice(0, 200);
        console.warn(`[AllowedChats Sync] Ошибка синхронизации источников: HTTP ${res.status} (${textSnippet})`);
      }
    }
  } catch (err) {
    const now = Date.now();
    if (now - lastSyncErrorLogAt > 30 * 60 * 1000) {
      lastSyncErrorLogAt = now;
      console.warn(`[AllowedChats Sync] Сетевая ошибка при синхронизации источников: ${err.message}`);
    }
  }
}

setTimeout(syncEnabledSourcesFromApi, 15000);
trackInterval(syncEnabledSourcesFromApi, 5 * 60 * 1000);

// 2. Хранилище (File or Upstash Redis)
const storage = createStorage();

// 3. Статистика
const stats = {
  startedAt: new Date().toISOString(),
  messagesProcessed: 0,
  leadsFound: 0,
  lastLeadAt: null,
  lastMatchedAt: null,
  duplicates: 0,
};

const filterStats = {
  total: 0,
  reasons: {},
};

const privacyStats = {
  skippedOutgoing: 0,
  skippedPrivate: 0,
  skippedBots: 0,
  skippedNotAllowed: 0,
};

let errorsCount = 0;

// Poller stats
let pollerLastRunAt = null;
let pollerChannelsOk = 0;
let pollerChannelsFailed = 0;

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

      // C2: Permanent 4xx errors should not be endlessly retried
      if ([400, 401, 403, 404].includes(res.status)) {
        console.warn(`[Вебхук] Постоянная ошибка HTTP ${res.status}: дальнейшие повторы отменены`);
        return false;
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

// 1.5 Кэш скрытых источников из Redis
let cachedHiddenChannels = new Set();
let lastHiddenChannelsFetch = 0;

async function getHiddenChannels() {
  const now = Date.now();
  if (now - lastHiddenChannelsFetch < 60000) {
    return cachedHiddenChannels;
  }
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) return cachedHiddenChannels;

  try {
    const res = await fetch(`${redisUrl}/smembers/leadhunter:hidden_channels`, {
      headers: { Authorization: `Bearer ${redisToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.result)) {
        cachedHiddenChannels = new Set(
          data.result.map((s) => String(s).toLowerCase().replace(/^@/, ''))
        );
        lastHiddenChannelsFetch = now;
      }
    }
  } catch {}
  return cachedHiddenChannels;
}

async function dispatchLeadNotification(leadItem) {
  if (!WEBHOOK_URL) return;

  const hidden = await getHiddenChannels();
  const chan = (leadItem.channel || '').toLowerCase().replace(/^@/, '');
  if (chan && hidden.has(chan)) {
    console.log(`[Notification] Пропуск лида из скрытого канала: @${chan}`);
    return;
  }

  // Фильтр по скору для Telegram-уведомлений (по умолчанию >= 70, не спамить сомнительными)
  const botMinScore = Number(process.env.BOT_MIN_SCORE || FILTER_CONFIG.thresholds.botNotifyMinScore || 70);
  if (leadItem.score !== undefined && leadItem.score < botMinScore) {
    console.log(`[Notification] Скор ${leadItem.score} < ${botMinScore}: лид сохранён в ленту, уведомление в бота пропущено`);
    return;
  }

  if (checkRateLimit()) {
    notificationTimestamps.push(Date.now());
    const payload = {
      id: leadItem.id,
      title: `Вакансия монтажёра (${leadItem.channel})`,
      text: leadItem.text,
      url: leadItem.url,
      channel: leadItem.channel,
      region: leadItem.region,
      budget: leadItem.budget,
      type: 'lead',
      kind: 'lead',
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
          type: 'digest',
          kind: 'digest',
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

// B6: Утренний (9:00 MSK) и еженедельный пятничный (18:00 MSK) дайджесты с обработкой ошибок
let lastMorningDigestDate = '';
let lastWeeklyDigestDate = '';
const recentCollectedLeads = [];

function trackRecentLead(leadItem) {
  recentCollectedLeads.push({ ...leadItem, collectedAt: Date.now() });
  if (recentCollectedLeads.length > 200) {
    recentCollectedLeads.shift();
  }
}

async function checkScheduledDigests() {
  const now = new Date();
  const mskTime = new Date(now.getTime() + 3 * 3600 * 1000);
  const mskHours = mskTime.getUTCHours();
  const mskDay = mskTime.getUTCDay();
  const dateStr = mskTime.toISOString().slice(0, 10);

  // 1. Morning Digest at 9:00 MSK
  if (mskHours === 9 && lastMorningDigestDate !== dateStr) {
    lastMorningDigestDate = dateStr;
    const nightLeads = recentCollectedLeads.filter(
      (l) => Date.now() - l.collectedAt <= 14 * 3600 * 1000
    );
    if (nightLeads.length > 0) {
      const top5 = nightLeads.slice(-5).reverse();
      const summary = top5
        .map((l, i) => `${i + 1}. <b>@${l.channel}</b>: ${l.text.slice(0, 80)}...\n🔗 ${l.url}`)
        .join('\n\n');
      const payload = {
        title: '🌅 Утренний дайджест вакансий',
        text: `Доброе утро! Топ-5 свежих вакансий монтажа за ночь:\n\n${summary}`,
        url: top5[0].url,
        channel: 'LeadHunter Digest',
        type: 'digest',
        kind: 'digest',
      };
      const sent = await sendWebhookWithRetry(payload);
      if (!sent) {
        console.warn('[Digest] Ошибка доставки утреннего дайджеста, сохраняем в очередь');
        storage.enqueueFailed(payload, 'Morning digest delivery failed');
      } else {
        console.log(`[Digest] Утренний дайджест отправлен (${top5.length} лидов)`);
      }
    }
  }

  // 2. Weekly Report on Friday at 18:00 MSK
  if (mskDay === 5 && mskHours === 18 && lastWeeklyDigestDate !== dateStr) {
    lastWeeklyDigestDate = dateStr;
    const siteUrl = allowedOriginRaw ? allowedOriginRaw.split(',')[0].trim() : 'https://fleurleads-work.netlify.app';
    const payload = {
      title: '📊 Итоги недели LeadHunter',
      text: `За прошедшую неделю перехвачено ${stats.leadsFound} вакансий монтажа. Обработано сообщений: ${stats.messagesProcessed}. Удачных откликов и закрытых проектов!`,
      url: `${siteUrl}/vacancies`,
      channel: 'LeadHunter Stats',
      type: 'digest',
      kind: 'digest',
    };
    const sent = await sendWebhookWithRetry(payload);
    if (!sent) {
      console.warn('[Digest] Ошибка доставки еженедельного дайджеста, сохраняем в очередь');
      storage.enqueueFailed(payload, 'Weekly digest delivery failed');
    } else {
      console.log('[Digest] Еженедельный дайджест отправлен');
    }
  }
}

trackInterval(checkScheduledDigests, 60 * 1000);

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
let connectedAt = 0;
let lastMessageAt = null;
let disconnectedSince = Date.now();
let client = null;
let eventHandlerRef = null;
let reconnectTimer = null;
let reconnectDelayMs = 5000;
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;
let isConnecting = false;
let isShuttingDown = false;
const reconnectFailures = [];

// B2: Вынесенная функция обработки входящего сообщения (для listener и polling)
async function processIncomingMessage(message, chatMeta = {}) {
  if (!message || !message.text) return;

  lastMessageAt = new Date().toISOString();

  let chatTitle = chatMeta.chatTitle || 'Telegram';
  let chatUsername = chatMeta.chatUsername ? chatMeta.chatUsername.toLowerCase().replace(/^@/, '') : '';
  let rawChatId = chatMeta.rawChatId || message.chatId || '';

  if (!chatUsername && message.getChat) {
    try {
      const chat = await message.getChat();
      if (chat) {
        if ('bot' in chat && chat.bot) {
          privacyStats.skippedBots++;
          return;
        }
        chatTitle = chat.title || chat.username || chatTitle;
        chatUsername = chat.username ? chat.username.toLowerCase().replace(/^@/, '') : '';
        if (chat.id) rawChatId = chat.id;
      }
    } catch (chatErr) {
      // B2: Попытка получить сущность через getEntity(message.peerId)
      if (message.peerId && client?.getEntity) {
        try {
          const entity = await client.getEntity(message.peerId);
          if (entity) {
            chatTitle = entity.title || entity.username || chatTitle;
            chatUsername = entity.username ? entity.username.toLowerCase().replace(/^@/, '') : chatUsername;
            if (entity.id) rawChatId = entity.id;
          }
        } catch (peerErr) {
          console.warn(`[Telegram] Не удалось получить сущность для peerId: ${peerErr.message}`);
        }
      }
    }
  }

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

  // 1. Проверка возраста поста (по умолчанию 48 часов)
  const maxPostAgeHours = Number(process.env.MAX_POST_AGE_HOURS || FILTER_CONFIG.thresholds.maxPostAgeHours || 48);
  if (message.date) {
    const postAgeMs = Date.now() - message.date * 1000;
    if (postAgeMs > maxPostAgeHours * 3600 * 1000) {
      filterStats.total++;
      filterStats.reasons['post_too_old'] = (filterStats.reasons['post_too_old'] || 0) + 1;
      return;
    }
  }

  // 2. Трёхуровневый скоринг и фильтрация
  const webMinScore = Number(process.env.WEB_MIN_SCORE || FILTER_CONFIG.thresholds.passMinScore || 45);
  const matchResult = matchesVacancy(message.text, { minScore: webMinScore, isWorkerLead: true });
  if (!matchResult.isMatch) {
    filterStats.total++;
    const reason = matchResult.reason || 'no_core_keywords';
    filterStats.reasons[reason] = (filterStats.reasons[reason] || 0) + 1;
    return;
  }

  const budget = parseBudget(message.text);
  const detectedRegion = detectVacancyRegion(message.text, chatUsername);

  // 3. Настраиваемое отсечение региона RU и рублей
  const excludeRu = process.env.EXCLUDE_RU_REGION !== undefined
    ? process.env.EXCLUDE_RU_REGION === 'true'
    : (FILTER_CONFIG.thresholds.excludeRuRegion ?? true);
  const excludeRub = process.env.EXCLUDE_RUB_CURRENCY !== undefined
    ? process.env.EXCLUDE_RUB_CURRENCY === 'true'
    : (FILTER_CONFIG.thresholds.excludeRubCurrency ?? true);

  if ((excludeRu && detectedRegion === 'RU') || (excludeRub && budget?.currency === 'RUB')) {
    filterStats.total++;
    filterStats.reasons['excluded_ru_region'] = (filterStats.reasons['excluded_ru_region'] || 0) + 1;
    return;
  }

  const leadId = buildLeadId(rawChatId, message.id);
  const textHash = computeTextHash(message.text);

  const isDup = await storage.isDuplicate(leadId, textHash);
  if (isDup) {
    stats.duplicates++;
    return;
  }

  stats.leadsFound++;
  stats.lastLeadAt = new Date().toISOString();
  stats.lastMatchedAt = new Date().toISOString();

  const postUrl = buildPostUrl(
    chatUsername ? { username: chatUsername } : { id: rawChatId },
    message.id
  );

  const postedAt = message.date
    ? new Date(message.date * 1000).toISOString()
    : new Date().toISOString();

  const leadItem = {
    id: leadId,
    channel: chatUsername ? `@${chatUsername}` : chatTitle,
    text: message.text,
    url: postUrl,
    matchedKeywords: matchResult.matched || [],
    score: matchResult.score,
    label: matchResult.label,
    reasons: matchResult.reasons || [],
    budget,
    region: detectedRegion,
    postedAt,
  };

  console.log(`\n🔥 [НАЙДЕНА ВАКАНСИЯ] в "${chatTitle}" (${(matchResult.matched || []).join(', ')})`);
  if (budget) {
    console.log(`💰 Бюджет: ${budget.currency === 'NEGOTIABLE' ? 'Договорной' : `${budget.min || ''}-${budget.max || ''} ${budget.currency}`}`);
  }
  console.log(`Текст: ${message.text.slice(0, 140)}...`);
  console.log(`Ссылка: ${postUrl}\n`);

  storage.addRecentLead(leadItem);
  trackRecentLead(leadItem);
  await dispatchLeadNotification(leadItem);
}

// B2: Приоритетный Fallback-поллинг каждые 3 минуты (min_id + storage-прогресс + приоритет gigRate)
let highPriorityIndex = 0;
let mediumPriorityIndex = 0;
let lowPriorityIndex = 0;
const lastPolledIdMap = new Map();
const disabledPollChannels = new Map();

async function runPollingCycle() {
  if (!client || !telegramConnected) return;

  const validChannels = Array.from(allowedChatsSet || [])
    .filter((c) => /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(c))
    .filter((c) => {
      const disabledUntil = disabledPollChannels.get(c);
      return !disabledUntil || Date.now() > disabledUntil;
    });

  if (validChannels.length === 0) return;

  pollerLastRunAt = new Date().toISOString();

  // Приоритетная группировка каналов по gigRate и qualityScore
  const highPriority = [];
  const mediumPriority = [];
  const lowPriority = [];

  for (const ch of validChannels) {
    const meta = channelPriorityMap.get(ch);
    const gigRate = meta?.gigRate || 0;
    if (meta?.recommended || gigRate >= 0.08) {
      highPriority.push(ch);
    } else if (gigRate > 0 || (meta?.qualityScore || 0) >= 60) {
      mediumPriority.push(ch);
    } else {
      lowPriority.push(ch);
    }
  }

  // Сборка батча до 20 каналов: 10 High, 6 Medium, 4 Low
  const batch = [];
  function pickFromGroup(group, count, getIndex, setIndex) {
    if (group.length === 0) return;
    const take = Math.min(count, group.length);
    const idx = getIndex();
    for (let i = 0; i < take; i++) {
      const ch = group[(idx + i) % group.length];
      if (!batch.includes(ch)) batch.push(ch);
    }
    setIndex((idx + take) % group.length);
  }

  pickFromGroup(highPriority, 10, () => highPriorityIndex, (v) => { highPriorityIndex = v; });
  pickFromGroup(mediumPriority, 6, () => mediumPriorityIndex, (v) => { mediumPriorityIndex = v; });
  pickFromGroup(lowPriority, 4, () => lowPriorityIndex, (v) => { lowPriorityIndex = v; });

  // Добор до 20 каналов при наличии свободного места
  if (batch.length < 20 && validChannels.length > batch.length) {
    for (const ch of validChannels) {
      if (!batch.includes(ch)) {
        batch.push(ch);
        if (batch.length >= 20) break;
      }
    }
  }

  for (const username of batch) {
    if (!telegramConnected || !client) break;
    await new Promise((r) => setTimeout(r, 1500));

    try {
      // Восстанавливаем сохранённый lastId из storage
      let lastId = lastPolledIdMap.get(username);
      if (lastId === undefined && storage?.getLastPolledId) {
        lastId = (await storage.getLastPolledId(username)) || 0;
        lastPolledIdMap.set(username, lastId);
      }
      lastId = lastId || 0;

      // Опрос с minId: Telegram вернёт только свежие сообщения
      const pollOpts = { limit: 25 };
      if (lastId > 0) {
        pollOpts.minId = lastId;
      }

      const msgs = await client.getMessages(username, pollOpts);
      pollerChannelsOk++;
      let maxId = lastId;

      const maxPostAgeMs = MAX_POST_AGE_HOURS * 3600 * 1000;
      const now = Date.now();

      const newMsgs = msgs
        .filter((m) => {
          if (!m || !m.id || !m.text) return false;
          if (m.id <= lastId) return false;
          // Если это первая загрузка канала (lastId === 0), проверяем возраст поста
          if (lastId === 0 && m.date) {
            const postTime = m.date * 1000;
            if (now - postTime > maxPostAgeMs) return false;
          }
          return true;
        })
        .reverse();

      for (const msg of newMsgs) {
        if (msg.id > maxId) maxId = msg.id;
        await processIncomingMessage(msg, {
          chatTitle: `@${username}`,
          chatUsername: username,
          rawChatId: msg.chatId || '',
        });
      }

      // Если в выборке msgs были сообщения с id > maxId, обновляем прогресс
      for (const m of msgs) {
        if (m && m.id && m.id > maxId) {
          maxId = m.id;
        }
      }

      if (maxId > lastId) {
        lastPolledIdMap.set(username, maxId);
        if (storage?.setLastPolledId) {
          await storage.setLastPolledId(username, maxId);
        }
      }
    } catch (err) {
      pollerChannelsFailed++;
      const errMsg = String(err.message || err);
      if (/FLOOD_WAIT_(\d+)/i.test(errMsg)) {
        const waitSec = parseInt(errMsg.match(/FLOOD_WAIT_(\d+)/i)[1], 10);
        console.warn(`[Poller FLOOD_WAIT] Пауза опроса на ${waitSec}с:`, errMsg);
        break;
      }
      if (/USERNAME_NOT_OCCUPIED|USERNAME_INVALID|CHANNEL_PRIVATE/i.test(errMsg)) {
        console.warn(`[Poller] Канал @${username} недоступен (${errMsg}), отключён на 24ч`);
        disabledPollChannels.set(username, Date.now() + 24 * 3600 * 1000);
      } else {
        console.warn(`[Poller] Ошибка опроса @${username}:`, errMsg);
      }
    }
  }
}

trackInterval(runPollingCycle, 3 * 60 * 1000);
setTimeout(runPollingCycle, 30 * 1000);

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

  // B2: Защищённый эндпоинт /metrics с подробной диагностикой
  if (urlObj.pathname === '/metrics') {
    const authHeader = req.headers['x-webhook-secret'] || '';
    const queryKey = urlObj.searchParams.get('key') || '';
    const provided = typeof authHeader === 'string' && authHeader ? authHeader : queryKey;

    if (!verifySecret(provided)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing secret' }));
    }

    const topReasons = Object.entries(filterStats.reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify(
        {
          service: 'LeadHunter Telegram Worker',
          uptimeSeconds: Math.floor(process.uptime()),
          telegramConnected,
          disconnectedSince: disconnectedSince ? new Date(disconnectedSince).toISOString() : null,
          lastMessageAt,
          lastMatchedAt: stats.lastMatchedAt,
          pollerLastRunAt,
          pollerChannelsOk,
          pollerChannelsFailed,
          stats,
          privacyStats: {
            ...privacyStats,
            duplicates: stats.duplicates,
            skippedByFilter: {
              total: filterStats.total,
              topReasons,
            },
          },
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
  const isStalled = disconnectedSince && Date.now() - disconnectedSince > 2 * 60 * 1000;

  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Health-Check] HTTP-сервер запущен на 0.0.0.0:${PORT}`);

  trackInterval(() => {
    processFailedQueue().catch((err) => console.warn('[Очередь] Ошибка фоновой очистки:', err.message));
  }, 2 * 60 * 1000);

  const selfUrl =
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : null);

  if (selfUrl) {
    console.log(`[Keep-Alive] Автоматический самопинг активен для ${selfUrl}`);
    trackInterval(async () => {
      try {
        await fetch(`${selfUrl}/`, { signal: AbortSignal.timeout(5000) });
      } catch (err) {
        console.warn(`[Keep-Alive] Ошибка самопинга: ${err.message}`);
      }
    }, 10 * 60 * 1000);
  }
});

// B7: Корректное отключение старого клиента
async function cleanupOldClient() {
  if (client) {
    try {
      if (eventHandlerRef) {
        client.removeEventHandler(eventHandlerRef);
        eventHandlerRef = null;
      }
      await Promise.race([
        Promise.allSettled([
          client.disconnect?.(),
          client.destroy?.(),
        ]),
        new Promise((_, r) => setTimeout(() => r(new Error('disconnect timeout')), 5000)),
      ]);
    } catch (e) {
      console.warn('[Telegram] Ошибка очистки старого клиента:', e.message);
    }
    client = null;
  }
}

function scheduleReconnect(customDelayMs) {
  if (isConnecting || isShuttingDown) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const delay = typeof customDelayMs === 'number' ? customDelayMs : reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);

  console.log(`[Telegram Reconnect] Запланировано переподключение через ${Math.round(delay / 1000)} сек...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectTelegram();
  }, delay);
}

trackInterval(() => {
  if (telegramConnected && !isConnecting) {
    const lastActivity = Math.max(
      new Date(lastMessageAt || 0).getTime(),
      new Date(pollerLastRunAt || 0).getTime(),
      connectedAt
    );
    if (Date.now() - lastActivity > 15 * 60 * 1000) {
      console.warn('[Watchdog] Нет активности более 15 минут при статусе connected. Принудительный реконнект...');
      telegramConnected = false;
      disconnectedSince = Date.now();
      scheduleReconnect(1000);
    }
  }
}, 60 * 1000);

// 9. Запуск Telegram MTProto клиента
if (!SESSION_STRING) {
  console.error('\n[ВНИМАНИЕ] SESSION_STRING не задан в .env файле!');
  console.error('Сначала выполните команду: npm run auth\n');
  process.exit(1);
}

async function connectTelegram() {
  if (isShuttingDown || isConnecting) return;
  isConnecting = true;

  await cleanupOldClient();

  console.log('[Telegram] Подключение к Telegram через MTProto...');
  disconnectedSince = disconnectedSince || Date.now();
  telegramConnected = false;

  try {
    const stringSession = new StringSession(SESSION_STRING);
    // B7: Параметры autoReconnect и floodSleepThreshold
    client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
      autoReconnect: true,
      floodSleepThreshold: 60,
      useWSS: false,
    });

    await client.connect();

    const me = await client.getMe();
    console.log(`[Telegram] Успешно подключено под аккаунтом: ${me.firstName} (@${me.username || me.phone})`);

    // B2: Загрузка диалогов и catchUp
    try {
      console.log('[Telegram] Загрузка списка диалогов (getDialogs)...');
      await client.getDialogs({ limit: 300 });
      console.log('[Telegram] Диалоги успешно загружены.');
    } catch (diagErr) {
      console.warn('[Telegram] Ошибка при вызове getDialogs:', diagErr.message);
    }

    try {
      if (typeof client.catchUp === 'function') {
        await client.catchUp();
        console.log('[Telegram] catchUp успешно выполнен.');
      }
    } catch (catchUpErr) {
      console.warn('[Telegram] catchUp не поддерживается или завершился с ошибкой:', catchUpErr.message);
    }

    telegramConnected = true;
    connectedAt = Date.now();
    disconnectedSince = null;
    reconnectDelayMs = 5000;

    console.log('[Telegram] Режим слушателя активен: отслеживаю каналы и группы 24/7...\n');
    processFailedQueue().catch(() => {});

    // B3: NewMessage обработчик с перехватом сетевых ошибок
    eventHandlerRef = async (event) => {
      try {
        const message = event.message;
        if (!message || !message.text) return;

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

        await processIncomingMessage(message);
      } catch (err) {
        errorsCount++;
        const msg = String(err?.message || err);
        console.error('[NewMessage Error]:', msg);

        if (/TIMEOUT|ECONNRESET|ETIMEDOUT|Not connected|Connection closed/i.test(msg)) {
          console.warn('[Telegram] Разрыв соединения в NewMessage. Запуск реконнекта...');
          telegramConnected = false;
          disconnectedSince = Date.now();
          scheduleReconnect();
        }
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

    // B3: Отслеживание числа падений реконнекта (более 5 за 10 мин -> выход)
    const now = Date.now();
    reconnectFailures.push(now);
    while (reconnectFailures.length > 0 && now - reconnectFailures[0] > 10 * 60 * 1000) {
      reconnectFailures.shift();
    }
    if (reconnectFailures.length >= 5) {
      console.error('[Telegram КРИТИЧЕСКАЯ ОШИБКА] Более 5 сбоев подключения подряд за 10 минут!');
      await handleShutdown('EXCESSIVE_RECONNECT_FAILURES', 1);
      return;
    }

    const floodMatch = errStr.match(/FLOOD_WAIT_(\d+)/i);
    let waitMs = reconnectDelayMs;
    if (floodMatch) {
      const waitSeconds = parseInt(floodMatch[1], 10);
      console.warn(`[Telegram FLOOD_WAIT] Telegram запросил ожидание ${waitSeconds} секунд`);
      waitMs = (waitSeconds + 2) * 1000;
    }

    scheduleReconnect(waitMs);
  } finally {
    isConnecting = false;
  }
}

connectTelegram();

async function handleShutdown(signal, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (reconnectTimer) clearTimeout(reconnectTimer);
  activeIntervals.forEach(clearInterval);
  activeIntervals.length = 0;

  console.log(`\n[Shutdown] Получен сигнал ${signal}. Завершение работы...`);
  try {
    storage.flush();
    if (typeof storage?.close === 'function') {
      storage.close();
    }
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close(() => console.log('[Shutdown] HTTP-сервер остановлен'));
    }
    await cleanupOldClient();
    console.log('[Shutdown] Telegram MTProto отключен');
  } catch (err) {
    console.error('[Shutdown] Ошибка при завершении:', err.message);
  } finally {
    process.exit(exitCode);
  }
}

process.on('unhandledRejection', (reason) => {
  const msg = String(reason?.message || reason || '');
  console.error('[unhandledRejection]:', msg);
  errorsCount++;

  if (/TIMEOUT|ECONNRESET|ETIMEDOUT|Not connected|Connection closed/i.test(msg)) {
    console.warn('[unhandledRejection] Сетевой сбой MTProto — запуск переподключения без остановки процесса.');
    telegramConnected = false;
    disconnectedSince = disconnectedSince || Date.now();
    scheduleReconnect();
    return;
  }
  if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('SESSION_REVOKED')) {
    handleShutdown('FATAL_AUTH_ERROR', 1);
  }
});

process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err || '');
  console.error('[uncaughtException]:', msg);
  errorsCount++;

  if (/TIMEOUT|ECONNRESET|ETIMEDOUT|Not connected|Connection closed/i.test(msg)) {
    console.warn('[uncaughtException] Сетевой сбой MTProto — запуск переподключения без остановки процесса.');
    telegramConnected = false;
    disconnectedSince = disconnectedSince || Date.now();
    scheduleReconnect();
    return;
  }
  if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('SESSION_REVOKED')) {
    handleShutdown('FATAL_AUTH_ERROR', 1);
    return;
  }
  handleShutdown('uncaughtException', 1);
});

process.on('SIGTERM', () => handleShutdown('SIGTERM', 0));
process.on('SIGINT', () => handleShutdown('SIGINT', 0));
