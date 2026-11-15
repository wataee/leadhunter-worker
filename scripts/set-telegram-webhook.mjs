#!/usr/bin/env node
import dotenv from 'dotenv';

dotenv.config();

const token = (process.argv[2] || process.env.TELEGRAM_BOT_TOKEN || '').trim();
const rawSiteUrl = (
  process.argv[3] ||
  process.env.SITE_URL ||
  process.env.ALLOWED_ORIGIN?.split(',')[0] ||
  'https://fleurleads-work.netlify.app'
).trim();
const secret = (process.env.WEBHOOK_SECRET || '').trim();

if (!token) {
  console.error('❌ Ошибка: Не задан TELEGRAM_BOT_TOKEN (в .env или первым аргументом)');
  console.error('Использование: node scripts/set-telegram-webhook.mjs [BOT_TOKEN] [SITE_URL]');
  process.exit(1);
}

if (!rawSiteUrl) {
  console.error('❌ Ошибка: Не задан SITE_URL (в .env или вторым аргументом)');
  console.error('Пример: https://fleurleads-work.netlify.app');
  process.exit(1);
}

let siteUrl = rawSiteUrl.replace(/\/$/, '');
if (!siteUrl.startsWith('http')) {
  siteUrl = `https://${siteUrl}`;
}

const webhookUrl = `${siteUrl}/api/tg-callback`;

// Secret validation: Telegram allows 1-256 characters [A-Za-z0-9_-]
if (secret && !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('❌ Ошибка: WEBHOOK_SECRET должен содержать от 1 до 256 символов [A-Za-z0-9_-]');
  console.error('Текущее значение содержит недопустимые спецсимволы.');
  process.exit(1);
}

console.log(`\n🤖 Настройка Telegram Webhook для бота...`);
console.log(`🔗 Webhook URL: ${webhookUrl}`);
console.log(
  `🔒 Secret Token: ${secret ? 'Установлен (' + secret.slice(0, 4) + '...' + secret.slice(-4) + ')' : 'Не задан'}`
);

async function setupWebhook() {
  try {
    const payload = {
      url: webhookUrl,
      allowed_updates: ['callback_query'],
    };
    if (secret) {
      payload.secret_token = secret;
    }

    const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const setData = await setRes.json();
    if (!setData.ok) {
      console.error(`❌ Ошибка setWebhook: ${setData.description || JSON.stringify(setData)}`);
      process.exit(1);
    }
    console.log(`✅ Webhook успешно установлен: ${setData.description || 'OK'}\n`);

    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoData = await infoRes.json();

    if (infoData.ok && infoData.result) {
      const info = infoData.result;
      console.log('📋 Текущий статус Telegram Webhook:');
      console.log(`   URL:                   ${info.url}`);
      console.log(`   Кастомный сертификат:  ${info.has_custom_certificate ? 'Да' : 'Нет'}`);
      console.log(`   Ожидающие обновления:  ${info.pending_update_count}`);
      console.log(`   Разрешённые updates:   ${(info.allowed_updates || []).join(', ') || 'все'}`);
      if (info.last_error_date) {
        const errDate = new Date(info.last_error_date * 1000).toLocaleString('ru-RU');
        console.log(`   ⚠️ Последняя ошибка:   ${errDate} - ${info.last_error_message}`);
      } else {
        console.log(`   ✅ Ошибок нет`);
      }
    }
  } catch (err) {
    console.error('❌ Сетевая ошибка при вызове Telegram API:', err.message);
    process.exit(1);
  }
}

setupWebhook();
