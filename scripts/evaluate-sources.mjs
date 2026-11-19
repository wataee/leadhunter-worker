/**
 * LeadHunter - Source Evaluation & Quality Re-scoring Script (ESM)
 * 
 * Evaluates real utility of Telegram channels in sources.catalog.json:
 * - Scrapes recent messages (preview or MTProto)
 * - Runs unified 3-level filter (matchesVacancy)
 * - Calculates gigRate, gigsPerWeek, lastEvaluatedAt
 * - Recalculates qualityScore based on real gig percentage
 * - Flags zero-gig sources with statusReason
 * - Assigns recommended: true to TOP-15 channels by gigRate
 * 
 * Usage:
 *   node scripts/evaluate-sources.mjs
 *   node scripts/evaluate-sources.mjs --dry-run
 *   node scripts/evaluate-sources.mjs --limit=20
 *   node scripts/evaluate-sources.mjs --channel=premiere_pro
 */

import fs from 'node:fs';
import path from 'node:path';
import { matchesVacancy } from '../web/src/shared/filter.js';

// Parse CLI flags
const args = process.argv.slice(2);
let flagLimit = null;
let flagChannel = null;
let flagDryRun = false;

args.forEach((arg) => {
  if (arg.startsWith('--limit=')) flagLimit = parseInt(arg.replace('--limit=', ''), 10);
  if (arg.startsWith('--channel=')) flagChannel = arg.replace('--channel=', '').toLowerCase().replace(/^@/, '');
  if (arg === '--dry-run') flagDryRun = true;
});

const CATALOG_PATH = path.resolve('web/src/shared/sources.catalog.json');
const CACHE_DIR = path.resolve('data/verify-cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanHtmlText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#33;/g, '!')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPreviewWithCache(username, force = false) {
  const cachePath = path.join(CACHE_DIR, `${username}_eval_preview.json`);
  if (!force && fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      // 12 hour TTL for evaluation cache
      if (Date.now() - data.cachedAt < 12 * 60 * 60 * 1000) {
        return data.content;
      }
    } catch {}
  }

  await sleep(250); // Respect Telegram web rate limits

  try {
    const url = `https://t.me/s/${username}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,kk;q=0.6',
      },
      signal: AbortSignal.timeout(8000),
    });

    const html = await res.text();
    const content = { status: res.status, html };

    if (res.status === 200) {
      fs.writeFileSync(cachePath, JSON.stringify({ cachedAt: Date.now(), content }), 'utf8');
    }
    return content;
  } catch (err) {
    return { status: 0, html: '', error: err.message };
  }
}

export async function evaluateChannelMessages(username, existingMeta = {}) {
  const preview = await fetchPreviewWithCache(username);
  if (!preview.html) {
    return {
      evaluated: false,
      reason: preview.error || 'Network or fetch failure',
      totalMessages: 0,
      gigCount: 0,
      gigRate: existingMeta.gigRate || 0,
      gigsPerWeek: existingMeta.gigsPerWeek || 0,
    };
  }

  const msgMatches = [...preview.html.matchAll(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g)];
  const timeMatches = [...preview.html.matchAll(/<time datetime="([^"]+)"/g)];

  const totalMessages = msgMatches.length;
  if (totalMessages === 0) {
    return {
      evaluated: false,
      reason: 'No preview messages available (private or invite only)',
      totalMessages: 0,
      gigCount: 0,
      gigRate: existingMeta.gigRate || (existingMeta.qualityScore > 75 ? 0.08 : 0.02),
      gigsPerWeek: existingMeta.gigsPerWeek || (existingMeta.postsPerWeek ? Math.round(existingMeta.postsPerWeek * 0.1) : 1),
    };
  }

  // Calculate days spanned by messages
  let daysCovered = 14;
  if (timeMatches.length >= 2) {
    const firstDate = new Date(timeMatches[0][1]).getTime();
    const lastDate = new Date(timeMatches[timeMatches.length - 1][1]).getTime();
    const diffDays = Math.max((lastDate - firstDate) / (1000 * 60 * 60 * 24), 1);
    daysCovered = Math.min(diffDays, 30);
  }

  let gigCount = 0;
  const gigReasons = [];

  for (const match of msgMatches) {
    const rawText = cleanHtmlText(match[1]);
    const filterRes = matchesVacancy(rawText, { minScore: 40 });
    if (filterRes.isMatch && filterRes.score >= 40) {
      gigCount++;
      gigReasons.push({
        score: filterRes.score,
        label: filterRes.label,
        snippet: rawText.slice(0, 100),
      });
    }
  }

  const gigRate = Number((gigCount / totalMessages).toFixed(3));
  const gigsPerWeek = Math.max(0, Math.round((gigCount / daysCovered) * 7));

  return {
    evaluated: true,
    totalMessages,
    gigCount,
    gigRate,
    gigsPerWeek,
    daysCovered: Math.round(daysCovered),
    sampleGigs: gigReasons.slice(0, 3),
  };
}

async function main() {
  console.log(`[EvaluateSources] Reading catalog from ${CATALOG_PATH}...`);
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`[Error] Catalog not found at ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  console.log(`[EvaluateSources] Loaded ${catalog.length} sources.`);

  let targetSources = catalog;
  if (flagChannel) {
    targetSources = catalog.filter((s) => s.id.toLowerCase() === flagChannel || s.username.toLowerCase() === flagChannel);
    console.log(`[EvaluateSources] Filtered to single channel: ${flagChannel}`);
  } else if (flagLimit && flagLimit > 0) {
    targetSources = catalog.slice(0, flagLimit);
    console.log(`[EvaluateSources] Limited to ${flagLimit} sources.`);
  }

  const results = [];
  let evaluatedCount = 0;

  for (let i = 0; i < targetSources.length; i++) {
    const source = targetSources[i];
    const username = (source.username || source.id).toLowerCase();
    process.stdout.write(`[${i + 1}/${targetSources.length}] @${username}... `);

    try {
      const evalRes = await evaluateChannelMessages(username, source);
      evaluatedCount++;

      source.gigRate = evalRes.gigRate;
      source.gigsPerWeek = evalRes.gigsPerWeek;
      source.lastEvaluatedAt = new Date().toISOString();

      // Recalculate qualityScore
      const postsPerWeek = source.postsPerWeek || 10;
      const subscribers = source.subscribers || 1000;
      const activityScore = Math.min(postsPerWeek / 15, 1) * 100;
      const relevanceScore = Math.min(source.gigRate * 250, 100);
      const audienceScore = Math.min(Math.log10(subscribers + 1) / 5, 1) * 100;

      let newQuality = Math.round(0.45 * relevanceScore + 0.30 * activityScore + 0.25 * audienceScore);

      if (evalRes.evaluated && evalRes.totalMessages >= 10 && evalRes.gigCount === 0) {
        source.statusReason = 'zero_gig_rate_30d';
        newQuality = Math.min(newQuality, 35);
      } else {
        source.statusReason = 'active_gig_stream';
      }

      source.qualityScore = Math.max(15, Math.min(99, newQuality));

      results.push({
        id: source.id,
        category: source.category,
        region: source.region,
        gigRate: source.gigRate,
        gigsPerWeek: source.gigsPerWeek,
        qualityScore: source.qualityScore,
        totalMessages: evalRes.totalMessages,
        gigCount: evalRes.gigCount,
        statusReason: source.statusReason,
      });

      console.log(`gigRate: ${(source.gigRate * 100).toFixed(1)}% (${evalRes.gigCount}/${evalRes.totalMessages}), qualityScore: ${source.qualityScore}`);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }

  // Assign recommended: true strictly to the TOP-15 sources by gigRate
  // ensuring recommendedCount is between 10 and 20 per test/catalog.test.js
  const sorted = [...catalog].sort((a, b) => (b.gigRate || 0) - (a.gigRate || 0));
  sorted.forEach((item, idx) => {
    if (idx < 15 && (item.gigRate || 0) > 0 && item.qualityScore >= 65) {
      item.recommended = true;
    } else {
      item.recommended = false;
    }
  });

  if (!flagDryRun) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`[EvaluateSources] Saved updated catalog with gigRate & lastEvaluatedAt to ${CATALOG_PATH}`);
  } else {
    console.log(`[EvaluateSources] DRY RUN - Catalog not updated on disk.`);
  }

  // Summary Report
  console.log('\n========================================');
  console.log('       TOP-30 CHANNELS BY GIG-RATE      ');
  console.log('========================================');
  console.log('| #  | Channel Username       | Region | Category            | Gig Rate | Gigs/Wk | Quality |');
  console.log('|----|------------------------|--------|---------------------|----------|---------|---------|');
  sorted.slice(0, 30).forEach((s, idx) => {
    const num = String(idx + 1).padStart(2, ' ');
    const uname = String(s.username || s.id).padEnd(22, ' ');
    const reg = String(s.region || '').padEnd(6, ' ');
    const cat = String(s.category || '').padEnd(19, ' ');
    const rate = `${((s.gigRate || 0) * 100).toFixed(1)}%`.padStart(8, ' ');
    const gigs = String(s.gigsPerWeek || 0).padStart(7, ' ');
    const q = String(s.qualityScore || 0).padStart(7, ' ');
    console.log(`| ${num} | @${uname} | ${reg} | ${cat} | ${rate} | ${gigs} | ${q} |`);
  });

  const zeroGigs = catalog.filter((s) => s.statusReason === 'zero_gig_rate_30d');
  console.log(`\nSources with 0 gig rate (last 30d): ${zeroGigs.length}`);
}

if (process.argv[1] && process.argv[1].endsWith('evaluate-sources.mjs')) {
  main().catch(console.error);
}
