/**
 * LeadHunter - Discover Sources (GramJS MTProto search)
 * 
 * MANUAL EXECUTION TOOL ONLY - DO NOT RUN AUTOMATICALLY IN CI/WORKER
 * Searches public Telegram channels and chats using MTProto `contacts.Search`.
 *
 * Usage:
 *   node scripts/discover-sources.js --query="видеомонтаж вакансии" --limit=20
 *   node scripts/discover-sources.js --queries-file=scripts/search-queries.json
 */

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const apiId = parseInt(process.env.API_ID || '', 10);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING;

if (!apiId || !apiHash || !sessionString) {
  console.error('[Error] Missing required Telegram credentials in process.env (API_ID, API_HASH, SESSION_STRING).');
  console.error('Please configure your .env file before running discovery.');
  process.exit(1);
}

const args = process.argv.slice(2);
let query = 'видеомонтаж вакансии';
let limit = 20;

args.forEach((arg) => {
  if (arg.startsWith('--query=')) query = arg.replace('--query=', '');
  if (arg.startsWith('--limit=')) limit = parseInt(arg.replace('--limit=', ''), 10) || 20;
});

async function main() {
  console.log(`[Discover] Connecting to Telegram MTProto...`);
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.connect();
  console.log(`[Discover] Connected. Searching for: "${query}" (limit: ${limit})...`);

  try {
    const result = await client.invoke(
      new Api.contacts.Search({
        q: query,
        limit,
      })
    );

    const candidates = [];
    const chats = result.chats || [];

    for (const chat of chats) {
      if (chat.username) {
        const username = chat.username.toLowerCase();
        const isChannel = chat.broadcast === true;
        const isGroup = chat.megagroup === true || (!chat.broadcast && chat.participantsCount > 0);

        candidates.push({
          id: username,
          username,
          title: chat.title || username,
          url: `https://t.me/${username}`,
          type: isChannel ? 'channel' : 'group',
          subscribers: chat.participantsCount || undefined,
          discoveredFrom: `tg:contacts.Search?q=${encodeURIComponent(query)}`,
          discoveredAt: new Date().toISOString(),
        });
      }
    }

    console.log(`[Discover] Found ${candidates.length} candidates with public usernames.`);
    const outDir = path.resolve('data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outFile = path.join(outDir, `discovered-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(candidates, null, 2), 'utf8');
    console.log(`[Discover] Saved to ${outFile}`);
  } catch (err) {
    console.error('[Discover] Error during contacts.Search:', err.message);
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
