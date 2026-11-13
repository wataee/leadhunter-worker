import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_ID = 22569680;
const API_HASH = '752ff1f9befbccd79b0018947e910101';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n===============================================');
  console.log('   Авторизация Telegram-клиента (LeadHunter)   ');
  console.log('===============================================\n');

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
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

  // Сохраняем в .env
  const envPath = path.join(__dirname, '.env');
  const envContent = [
    `API_ID=${API_ID}`,
    `API_HASH=${API_HASH}`,
    `SESSION_STRING=${savedSession}`,
    `WEBHOOK_URL=https://fleurleads-work.netlify.app/api/tg-notify`,
    `PORT=8080`,
  ].join('\n');

  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.log('Сессия успешно сохранена в файл .env!');
  console.log('\nВаша строка сессии (SESSION_STRING):\n');
  console.log(savedSession);
  console.log('\n===============================================\n');

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\nОшибка выполнения:', err);
  rl.close();
  process.exit(1);
});
