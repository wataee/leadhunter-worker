#!/usr/bin/env node
/**
 * scripts/join-sources.js
 *
 * Безопасный CLI-скрипт для вступления аккаунта Telegram в чаты и группы
 * из каталога источников LeadHunter (категории editors_community и clients_entrepreneurs).
 *
 * ВАЖНО:
 * - Запускается ТОЛЬКО вручную с локальной машины (не на Render/сервере).
 * - По умолчанию работает в режиме --dry-run (ничего не делает без флага --confirm-join).
 * - Ограничение: максимум 15 вступлений за 24 часа.
 * - Случайная пауза 45-120 секунд между вступлениями для защиты от PeerFlood/Spambot.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import { errors } from 'telegram';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_PATH = path.resolve(__dirname, '../web/src/shared/sources.catalog.json');
const HISTORY_PATH = path.resolve(__dirname, '../data/joined-sources.json');

const DAILY_LIMIT = parseInt(process.env.JOIN_DAILY_LIMIT || '15', 10);
const MIN_DELAY_SEC = 45;
const MAX_DELAY_SEC = 120;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    categories: ['jobs_video', 'jobs_remote_freelance', 'editors_community'],
    recommendedOnly: false,
    dryRun: true,
    printAllowed: false,
    limit: DAILY_LIMIT,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--category' && args[i + 1]) {
      options.categories = args[i + 1].split(',').map((c) => c.trim());
      i++;
    } else if (arg === '--recommended') {
      options.recommendedOnly = true;
    } else if (arg === '--confirm-join') {
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--print-allowed') {
      options.printAllowed = true;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Использование: node scripts/join-sources.js [опции]

Опции:
  --category <cat1,cat2>   Категории (по умолч.: editors_community,clients_entrepreneurs)
  --recommended            Вступать только в рекомендованные источники (recommended: true)
  --dry-run                Безопасный режим эмуляции (по умолчанию)
  --confirm-join           РЕАЛЬНОЕ вступление в чаты (требует подтверждения)
  --print-allowed          Вывести строку ALLOWED_CHATS для .env воркера
  --limit <N>              Лимит вступлений за 24 ч (по умолч.: 15)
  --help, -h               Показать эту справку
      `);
      process.exit(0);
    }
  }

  return options;
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { joined: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return { joined: [] };
  }
}

function saveHistory(history) {
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

function getRecentJoinsCount(history, hours = 24) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return history.joined.filter(
    (item) => item.status === 'success' && new Date(item.timestamp).getTime() > cutoff
  ).length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function main() {
  const opts = parseArgs();

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`[Ошибка] Каталог не найден: ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const history = loadHistory();
  const joinedUsernames = new Set(
    history.joined
      .filter((j) => j.status === 'success' || j.status === 'already_participant')
      .map((j) => j.username.toLowerCase())
  );

  // Filter candidates
  let targets = catalog.filter((item) => {
    if (!opts.categories.includes(item.category)) return false;
    if (opts.recommendedOnly && !item.recommended) return false;
    return true;
  });

  if (opts.printAllowed) {
    const usernames = targets.map((t) => t.username.toLowerCase());
    console.log('\n=== Строка для ALLOWED_CHATS в .env Render-воркера ===');
    console.log(`ALLOWED_CHATS=${usernames.join(',')}\n`);
    return;
  }

  console.log('====================================================');
  console.log('  LeadHunter Telegram Source Joiner');
  console.log('====================================================');
  console.log(`Режим: ${opts.dryRun ? 'DRY-RUN (Эмуляция, изменения не вносятся)' : 'CONFIRM-JOIN (РЕАЛЬНЫЙ)'}`);
  console.log(`Категории: ${opts.categories.join(', ')}`);
  console.log(`Только рекомендованные: ${opts.recommendedOnly ? 'ДА' : 'НЕТ'}`);
  console.log(`Всего кандидатов в каталоге: ${targets.length}`);

  const pending = targets.filter((t) => !joinedUsernames.has(t.username.toLowerCase()));
  console.log(`Уже числятся вступившими в истории: ${targets.length - pending.length}`);
  console.log(`Осталось для вступления: ${pending.length}`);

  const recentCount = getRecentJoinsCount(history, 24);
  console.log(`Вступлений за последние 24 часа: ${recentCount} / ${opts.limit}`);

  if (opts.dryRun) {
    console.log('\n[DRY-RUN] План вступления (первые 15):');
    pending.slice(0, 15).forEach((item, idx) => {
      console.log(`  ${idx + 1}. @${item.username} [${item.category}] (${item.title}) - Score: ${item.qualityScore}`);
    });
    console.log('\nЧтобы реально вступить в эти чаты, запустите с флагом --confirm-join:');
    console.log('  node scripts/join-sources.js --confirm-join\n');
    return;
  }

  // Real execution
  const apiId = parseInt(process.env.API_ID || '', 10);
  const apiHash = process.env.API_HASH;
  const sessionString = process.env.SESSION_STRING;

  if (!apiId || !apiHash || !sessionString) {
    console.error('[Ошибка] Для реального вступления требуются API_ID, API_HASH и SESSION_STRING в .env');
    process.exit(1);
  }

  let remainingQuota = opts.limit - recentCount;
  if (remainingQuota <= 0) {
    console.warn(`[Лимит исчерпан] За последние 24 часа уже выполнено ${recentCount} вступлений.`);
    console.warn('Telegram может наложить временные ограничения. Подождите до завтра.');
    return;
  }

  console.log(`\nПодключаюсь к Telegram MTProto...`);
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  const me = await client.getMe();
  console.log(`Авторизован как: ${me.firstName} (@${me.username || me.phone})`);

  let joinedThisRun = 0;

  for (const item of pending) {
    if (joinedThisRun >= remainingQuota) {
      console.log(`\n[Стоп] Достигнут суточный лимит (${opts.limit} вступлений за 24 ч).`);
      break;
    }

    const username = item.username.toLowerCase();
    console.log(`\n[${joinedThisRun + 1}/${remainingQuota}] Обработка @${username} (${item.title})...`);

    try {
      // Resolve entity
      const entity = await client.getEntity(username);
      
      // Join channel / supergroup
      await client.invoke(new Api.channels.JoinChannel({ channel: entity }));

      console.log(`  ✓ Успешно вступили в @${username}`);
      history.joined.push({
        timestamp: new Date().toISOString(),
        username,
        title: item.title,
        status: 'success',
      });
      joinedThisRun++;
      saveHistory(history);

      // Random jitter delay between joins
      const delay = randomBetween(MIN_DELAY_SEC, MAX_DELAY_SEC);
      console.log(`  Ожидание ${delay} сек перед следующим вступлением (антифрод)...`);
      await sleep(delay * 1000);
    } catch (err) {
      const errMsg = err.message || String(err);

      if (err instanceof errors.FloodWaitError || errMsg.includes('FLOOD_WAIT')) {
        const seconds = err.seconds || 300;
        console.error(`\n[ВНИМАНИЕ: FLOOD_WAIT] Telegram просит подождать ${seconds} секунд.`);
        console.error('Завершаю работу скрипта во избежание блокировки аккаунта.');
        history.joined.push({
          timestamp: new Date().toISOString(),
          username,
          status: 'flood_wait',
          error: `FloodWait: ${seconds}s`,
        });
        saveHistory(history);
        break;
      } else if (
        errMsg.includes('USER_ALREADY_PARTICIPANT') ||
        errMsg.includes('ALREADY_PARTICIPANT')
      ) {
        console.log(`  ℹ Уже являетесь участником @${username}`);
        history.joined.push({
          timestamp: new Date().toISOString(),
          username,
          title: item.title,
          status: 'already_participant',
        });
        saveHistory(history);
      } else if (errMsg.includes('INVITE_REQUEST_SENT')) {
        console.log(`  ℹ Отправлена заявка на вступление в @${username}`);
        history.joined.push({
          timestamp: new Date().toISOString(),
          username,
          title: item.title,
          status: 'request_sent',
        });
        saveHistory(history);
      } else {
        console.error(`  ✗ Ошибка при вступлении в @${username}: ${errMsg}`);
        history.joined.push({
          timestamp: new Date().toISOString(),
          username,
          title: item.title,
          status: 'error',
          error: errMsg,
        });
        saveHistory(history);
      }
    }
  }

  await client.disconnect();
  console.log('\n====================================================');
  console.log(`Готово. Вступлений за этот сеанс: ${joinedThisRun}`);
  console.log(`История сохранена в: ${HISTORY_PATH}`);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('[Непредвиденная фатальная ошибка]:', err);
  process.exit(1);
});
