import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n===============================================');
  console.log('   Авторизация Telegram-клиента (LeadHunter)   ');
  console.log('===============================================\n');

  let apiIdStr = process.env.API_ID?.trim();
  if (!apiIdStr) {
    apiIdStr = await ask('Введите API_ID (с сайта https://my.telegram.org): ');
  }
  const apiId = parseInt(apiIdStr.trim(), 10);
  if (isNaN(apiId) || apiId <= 0) {
    console.error('Ошибка: API_ID должен быть положительным числом.');
    rl.close();
    process.exit(1);
  }

  let apiHash = process.env.API_HASH?.trim();
  if (!apiHash) {
    apiHash = await ask('Введите API_HASH (32-значный хэш с https://my.telegram.org): ');
  }
  apiHash = apiHash.trim();
  if (!/^[a-fA-F0-9]{32}$/.test(apiHash)) {
    console.error('Ошибка: API_HASH должен состоять из 32 шестнадцатеричных символов.');
    rl.close();
    process.exit(1);
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => {
      const phone = await ask('Введите номер телефона (в формате +79991234567): ');
      return phone.trim();
    },
    password: async () => {
      const pass = await ask('Введите пароль двухфакторной аутентификации 2FA (если нет, нажмите Enter): ');
      return pass.trim();
    },
    phoneCode: async () => {
      const code = await ask('Введите код подтверждения из Telegram: ');
      return code.trim();
    },
    onError: (err) => console.error('Ошибка входа:', err.message),
  });

  console.log('\nУспешный вход в аккаунт Telegram!');
  const savedSession = client.session.save();

  // Сохраняем в .env с сохранением комментариев и существующих переменных
  const envPath = path.join(__dirname, '.env');
  let existingContent = '';
  if (fs.existsSync(envPath)) {
    existingContent = fs.readFileSync(envPath, 'utf-8');
  }

  const keysToUpdate = {
    API_ID: String(apiId),
    API_HASH: apiHash,
    SESSION_STRING: savedSession,
  };

  let updatedContent = existingContent;
  for (const [key, value] of Object.entries(keysToUpdate)) {
    const keyRegex = new RegExp(`^(\\s*${key}\\s*=).*$`, 'm');
    if (keyRegex.test(updatedContent)) {
      updatedContent = updatedContent.replace(keyRegex, `$1${value}`);
    } else {
      updatedContent = updatedContent.trimEnd() + `\n${key}=${value}\n`;
    }
  }

  fs.writeFileSync(envPath, updatedContent.trim() + '\n', 'utf-8');

  console.log('Сессия успешно сохранена в файл .env!');
  console.log('\nВаша строка сессии (SESSION_STRING):\n');
  console.log(savedSession);
  console.log('\n===============================================\n');

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\nОшибка выполнения:', err.message);
  rl.close();
  process.exit(1);
});
