import http from 'http';
import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

dotenv.config();

const API_ID = parseInt(process.env.API_ID || '22569680', 10);
const API_HASH = process.env.API_HASH || '752ff1f9befbccd79b0018947e910101';
const SESSION_STRING = process.env.SESSION_STRING || '';
const PORT = process.env.PORT || 8080;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://fleurleads-work.netlify.app/api/tg-notify';

// Ключевые слова для поиска вакансий монтажёра
const INCLUDE_KEYWORDS = [
  'ищу монтажер',
  'ищу монтажёр',
  'нужен монтажер',
  'нужен монтажёр',
  'требуется монтажер',
  'ищем монтажер',
  'вакансия монтажер',
  'видеомонтажер',
  'видеомонтажёр',
  'монтаж видео',
  'монтаж ролик',
  'монтаж подкаст',
  'монтаж reels',
  'монтаж shorts',
  'монтажер reels',
  'видеомонтаж',
  'video editor',
  'editor needed',
  'looking for editor',
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
];

let stats = {
  startedAt: new Date().toISOString(),
  messagesProcessed: 0,
  leadsFound: 0,
  lastLeadAt: null,
};

const recentLeads = [];

// 1. Встроенный Health-check сервер (для Render и внешнего пинга каждые 10 мин)
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/recent') {
    res.writeHead(200);
    return res.end(JSON.stringify({ stats, leads: recentLeads }, null, 2));
  }

  res.writeHead(200);
  res.end(
    JSON.stringify(
      {
        status: 'online',
        service: 'LeadHunter 24/7 Telegram Listener',
        uptimeSeconds: Math.floor(process.uptime()),
        stats,
      },
      null,
      2
    )
  );
});

server.listen(PORT, () => {
  console.log(`[Health-Check] HTTP-сервер запущен на порту ${PORT}`);

  // Самопинг каждые 10 минут чтобы Render не усыплял процесс
  const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try {
      await fetch(`${selfUrl}/`);
      console.log(`[Keep-Alive] Самопинг OK → ${selfUrl}`);
    } catch {}
  }, 10 * 60 * 1000); // каждые 10 минут
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
  console.log('[Telegram] Режим слушателя активен: отслеживаю все чаты и каналы 24/7...\n');

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message || !message.text) return;

      stats.messagesProcessed++;
      const text = message.text.toLowerCase();

      // Проверка исключений (резюме соискателей)
      const isExcluded = EXCLUDE_KEYWORDS.some((kw) => text.includes(kw));
      if (isExcluded) return;

      // Проверка ключевых слов
      const matched = INCLUDE_KEYWORDS.filter((kw) => text.includes(kw));
      if (matched.length === 0) return;

      stats.leadsFound++;
      stats.lastLeadAt = new Date().toISOString();

      let chatTitle = 'Telegram';
      let chatUsername = '';
      try {
        const chat = await message.getChat();
        if (chat) {
          chatTitle = chat.title || chat.username || 'Чат';
          chatUsername = chat.username || '';
        }
      } catch {}

      const postUrl = chatUsername ? `https://t.me/${chatUsername}/${message.id}` : `https://t.me/c/${message.chatId}/${message.id}`;

      console.log(`\n🔥 [НАЙДЕНА ВАКАНСИЯ] в "${chatTitle}" (${matched.join(', ')})`);
      console.log(`Текст: ${message.text.slice(0, 150)}...`);
      console.log(`Ссылка: ${postUrl}\n`);

      const leadItem = {
        id: `tg_${Date.now()}_${message.id}`,
        channel: chatUsername || chatTitle,
        text: message.text,
        url: postUrl,
        matchedKeywords: matched,
        postedAt: new Date().toISOString(),
      };

      recentLeads.unshift(leadItem);
      if (recentLeads.length > 50) recentLeads.pop();

      // Отправка в вебхук на Netlify (если настроен)
      if (WEBHOOK_URL) {
        try {
          await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `Вакансия монтажёра (${chatTitle})`,
              text: message.text,
              url: postUrl,
              channel: chatUsername || chatTitle,
            }),
          });
        } catch (fetchErr) {
          // Игнорируем ошибки вебхука
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
