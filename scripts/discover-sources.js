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
let queriesFile = null;
let limit = 20;

args.forEach((arg) => {
  if (arg.startsWith('--query=')) query = arg.replace('--query=', '');
  if (arg.startsWith('--queries-file=')) queriesFile = arg.replace('--queries-file=', '');
  if (arg.startsWith('--limit=')) limit = parseInt(arg.replace('--limit=', ''), 10) || 20;
});

async function main() {
  console.log(`[Discover] Connecting to Telegram MTProto...`);
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.connect();

  const queries = [];
  if (queriesFile && fs.existsSync(queriesFile)) {
    const raw = JSON.parse(fs.readFileSync(queriesFile, 'utf8'));
    if (raw.categories) {
      for (const [catName, qList] of Object.entries(raw.categories)) {
        if (Array.isArray(qList)) {
          qList.forEach((q) => queries.push({ query: q, category: catName }));
        }
      }
    }
    console.log(`[Discover] Loaded ${queries.length} queries from ${queriesFile}`);
  } else {
    queries.push({ query, category: 'manual' });
  }

  const allCandidates = [];
  const seenUsernames = new Set();

  try {
    for (const qItem of queries) {
      console.log(`[Discover] Searching for "${qItem.query}" (limit: ${limit})...`);
      try {
        const result = await client.invoke(
          new Api.contacts.Search({
            q: qItem.query,
            limit,
          })
        );

        const chats = result.chats || [];
        for (const chat of chats) {
          if (chat.username) {
            const username = chat.username.toLowerCase();
            if (seenUsernames.has(username)) continue;
            seenUsernames.add(username);

            const isChannel = chat.broadcast === true;
            const isGroup = chat.megagroup === true || (!chat.broadcast && chat.participantsCount > 0);

            allCandidates.push({
              id: username,
              username,
              title: chat.title || username,
              url: `https://t.me/${username}`,
              type: isChannel ? 'channel' : 'group',
              subscribers: chat.participantsCount || undefined,
              discoveredFrom: `tg:contacts.Search?q=${encodeURIComponent(qItem.query)}`,
              categoryHint: qItem.category,
              discoveredAt: new Date().toISOString(),
            });
          }
        }
        // Polite delay between search invocations
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.warn(`[Discover] Warning on query "${qItem.query}":`, err.message);
        if (/FLOOD_WAIT_(\d+)/i.test(err.message)) {
          const waitSec = parseInt(err.message.match(/FLOOD_WAIT_(\d+)/i)[1], 10);
          console.warn(`[Discover] Flood wait: sleeping ${waitSec}s`);
          await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
        }
      }
    }

    console.log(`[Discover] Found ${allCandidates.length} unique candidates with public usernames.`);
    const outDir = path.resolve('data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outFile = path.join(outDir, `discovered-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(allCandidates, null, 2), 'utf8');
    console.log(`[Discover] Saved to ${outFile}`);
  } catch (err) {
    console.error('[Discover] Error during contacts.Search:', err.message);
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
