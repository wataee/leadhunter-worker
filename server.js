import http from 'http';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

dotenv.config();

const rawApiId = process.env.API_ID?.trim();
const API_HASH = process.env.API_HASH?.trim();
const SESSION_STRING = process.env.SESSION_STRING?.trim() || '';
const PORT = parseInt(process.env.PORT || '8080', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL?.trim() || 'https://fleurleads-work.netlify.app/api/tg-notify';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET?.trim() || '';
const ALLOWED_CHATS_RAW = process.env.ALLOWED_CHATS?.trim() || '';

// Валидация критических переменных окружения
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

// Список разрешенных чатов (если задан)
const ALLOWED_CHATS = ALLOWED_CHATS_RAW
  ? ALLOWED_CHATS_RAW.split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
  : null;

// Ключевые слова для поиска вакансий монтажёра
const CORE_ROLES = [
  'видеомонтажер',
  'видеомонтажёр',
  'монтажер',
  'монтажёр',
  'видеомонтаж',
  'монтаж видео',
  'монтаж ролик',
  'монтаж подкаст',
  'монтаж reels',
  'монтаж shorts',
  'монтажер reels',
  'рилсмейкер',
  'reelsмейкер',
  'video editor',
  'editor needed',
  'looking for editor',
];

const SECONDARY_TERMS = [
  'монтаж',
  'reels',
  'shorts',
  'подкаст',
  'видеоролик',
  'рилс',
  'premiere',
  'davinci',
  'capcut',
  'after effects',
];

const HIRING_SIGNALS = [
  'ищ',
  'нужн',
  'требу',
  'ваканси',
  'в поиск',
  'найм',
  'нанят',
  'оплат',
  'платим',
  'бюджет',
  'ставк',
  'отклик',
  'в команду',
  'hiring',
  'looking for',
  'job',
];

// Слова-исключения (резюме соискателей)
const EXCLUDE_KEYWORDS = [
  'ищу заказы',
  'ищу работу',
  'предлагаю услуги',
  'мои услуги',
  'резюме',
  'портфолио:',
  'возьму заказ',
  'делаю монтаж',
  'открыт к заказам',
  'готов к сотрудничеству',
];

let stats = {
  startedAt: new Date().toISOString(),
  messagesProcessed: 0,
  leadsFound: 0,
  lastLeadAt: null,
};

let privacyStats = {
  skippedOutgoing: 0,
  skippedPrivate: 0,
  skippedBots: 0,
  skippedNotAllowed: 0,
};

const recentLeads = [];

// Проверка валидности секрета через timingSafeEqual
function verifySecret(provided) {
  if (!WEBHOOK_SECRET) return true; // Если секрет не задан в env, защита отключена
  if (!provided || typeof provided !== 'string') return false;
  const pBuf = Buffer.from(provided);
  const sBuf = Buffer.from(WEBHOOK_SECRET);
  if (pBuf.length !== sBuf.length) return false;
  return crypto.timingSafeEqual(pBuf, sBuf);
}

// 1. Встроенный Health-check сервер
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
    return res.end(JSON.stringify({ stats, leads: recentLeads }, null, 2));
  }

  // Публичный health-check эндпоинт (без лидов и личной статистики)
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(
    JSON.stringify(
      {
        status: 'online',
        service: 'LeadHunter 24/7 Telegram Listener',
        uptimeSeconds: Math.floor(process.uptime()),
      },
      null,
      2
    )
  );
});

server.listen(PORT, () => {
  console.log(`[Health-Check] HTTP-сервер запущен на порту ${PORT}`);

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

if (!SESSION_STRING) {
  console.error('\n[ВНИМАНИЕ] SESSION_STRING не задан в .env файле!');
  console.error('Сначала выполните команду: npm run auth\n');
  process.exit(1);
}

// 2. Запуск Telegram MTProto клиента
async function startListener() {
  console.log('[Telegram] Подключение к Telegram через MTProto...');
  const stringSession = new StringSession(SESSION_STRING);
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 10,
  });

  await client.connect();
  const me = await client.getMe();
  console.log(`[Telegram] Успешно подключено под аккаунтом: ${me.firstName} (@${me.username || me.phone})`);
  if (ALLOWED_CHATS) {
    console.log(`[Telegram] Белый список чатов активен (${ALLOWED_CHATS.length} чатов)`);
  }
  console.log('[Telegram] Режим слушателя активен: отслеживаю каналы и группы 24/7...\n');

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message || !message.text) return;

      // 1.2 Приватность: фильтруем исходящие, личные переписки и ботов
      if (message.out) {
        privacyStats.skippedOutgoing++;
        return;
      }

      // Обрабатываем ТОЛЬКО каналы и группы / супергруппы
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
      let chatIdStr = '';

      try {
        const chat = await message.getChat();
        if (chat) {
          // Игнорируем ботов
          if ('bot' in chat && chat.bot) {
            privacyStats.skippedBots++;
            return;
          }
          chatTitle = chat.title || chat.username || 'Чат';
          chatUsername = chat.username ? chat.username.toLowerCase() : '';
          chatIdStr = String(chat.id || message.chatId || '');
        }
      } catch {}

      // Фильтрация по белому списку (если задан)
      if (ALLOWED_CHATS && ALLOWED_CHATS.length > 0) {
        const isAllowed =
          (chatUsername && ALLOWED_CHATS.includes(chatUsername)) ||
          (chatIdStr && ALLOWED_CHATS.includes(chatIdStr.replace(/^-100/, '')));

        if (!isAllowed) {
          privacyStats.skippedNotAllowed++;
          return;
        }
      }

      stats.messagesProcessed++;
      const text = message.text.toLowerCase();

      // Проверка исключений (резюме соискателей)
      const isExcluded = EXCLUDE_KEYWORDS.some((kw) => text.includes(kw));
      if (isExcluded) return;

      // Проверка ключевых слов: роль или термин монтажа + сигнал найма
      const matchedRoles = CORE_ROLES.filter((r) => text.includes(r));
      const hasSecondary = SECONDARY_TERMS.some((t) => text.includes(t));
      const hasHiringSignal = HIRING_SIGNALS.some((s) => text.includes(s));

      const isMatch = matchedRoles.length > 0 || (hasSecondary && hasHiringSignal);
      if (!isMatch) return;

      const matched = matchedRoles.length > 0 ? matchedRoles : ['монтаж (вакансия)'];

      stats.leadsFound++;
      stats.lastLeadAt = new Date().toISOString();

      const postUrl = chatUsername
        ? `https://t.me/${chatUsername}/${message.id}`
        : `https://t.me/c/${String(message.chatId).replace(/^-100/, '')}/${message.id}`;

      console.log(`\n🔥 [НАЙДЕНА ВАКАНСИЯ] в "${chatTitle}" (${matched.join(', ')})`);
      console.log(`Текст: ${message.text.slice(0, 150)}...`);
      console.log(`Ссылка: ${postUrl}\n`);

      const leadItem = {
        id: `tg_${String(message.chatId).replace(/^-100/, '')}_${message.id}`,
        channel: chatUsername ? `@${chatUsername}` : chatTitle,
        text: message.text,
        url: postUrl,
        matchedKeywords: matched,
        postedAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
      };

      recentLeads.unshift(leadItem);
      if (recentLeads.length > 200) recentLeads.pop();

      // Отправка в вебхук на Netlify с заголовком X-Webhook-Secret
      if (WEBHOOK_URL) {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (WEBHOOK_SECRET) {
            headers['X-Webhook-Secret'] = WEBHOOK_SECRET;
          }

          await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: `Вакансия монтажёра (${chatTitle})`,
              text: message.text,
              url: postUrl,
              channel: chatUsername ? `@${chatUsername}` : chatTitle,
            }),
          });
        } catch (fetchErr) {
          console.warn(`[Вебхук] Ошибка отправки: ${fetchErr.message}`);
        }
      }
    } catch (err) {
      console.error('[Ошибка обработки сообщения]:', err.message);
    }
  }, new NewMessage({}));
}

startListener().catch((err) => {
  console.error('[Критическая ошибка Telegram Listener]:', err);
});
