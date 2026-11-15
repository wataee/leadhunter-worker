/**
 * LeadHunter - Source Verification Script (ESM)
 * 
 * Verifies candidate channels and groups, extracts metrics, evaluates
 * vacancy/quality scores, caches results, and compiles the catalog.
 *
 * Usage:
 *   node scripts/verify-sources.mjs
 *   node scripts/verify-sources.mjs --category=jobs_video
 *   node scripts/verify-sources.mjs --limit=10 --dry-run
 *   node scripts/verify-sources.mjs --force
 */

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { Agent, setGlobalDispatcher } from 'undici';
import { matchesVacancy, computeTextHash } from '../web/src/shared/filter.js';

// Resilient DNS resolver (8.8.8.8, 1.1.1.1)
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);
const dnsCache = new Map();

const agent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      if (dnsCache.has(hostname)) {
        const ip = dnsCache.get(hostname);
        return callback(null, options?.all ? [{ address: ip, family: 4 }] : ip, 4);
      }
      resolver.resolve4(hostname).then(
        (addrs) => {
          if (addrs && addrs.length > 0) {
            dnsCache.set(hostname, addrs[0]);
            return callback(null, options?.all ? addrs.map((a) => ({ address: a, family: 4 })) : addrs[0], 4);
          }
          return callback(new Error(`No IPv4 address for ${hostname}`));
        },
        (err) => callback(err)
      );
    },
  },
});
setGlobalDispatcher(agent);

// Parse CLI flags
const args = process.argv.slice(2);
let flagCategory = null;
let flagLimit = null;
let flagForce = false;
let flagDryRun = false;

args.forEach((arg) => {
  if (arg.startsWith('--category=')) flagCategory = arg.replace('--category=', '');
  if (arg.startsWith('--limit=')) flagLimit = parseInt(arg.replace('--limit=', ''), 10);
  if (arg === '--force') flagForce = true;
  if (arg === '--dry-run') flagDryRun = true;
});

const CACHE_DIR = path.resolve('data/verify-cache');
const CANDIDATES_FILE = path.resolve('data/sources.candidates.json');
const OUTPUT_CATALOG_FILE = path.resolve('web/src/shared/sources.catalog.json');
const UNVERIFIED_FILE = path.resolve('data/candidates.unverified.json');

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

const RESUME_PATTERNS = [
  /резюме/i,
  /ищу работу/i,
  /ищу проект/i,
  /монтирую/i,
  /мое портфолио/i,
  /моё портфолио/i,
  /обо мне:/i,
  /навыки:/i,
  /готов взять заказ/i,
  /portfolio:/i,
  /looking for work/i,
  /open for work/i,
];

const AD_PATTERNS = [
  /#реклама/i,
  /erid:/i,
  /скидк/i,
  /промокод/i,
  /купить курс/i,
  /записаться на курс/i,
  /спонсор/i,
  /партнерский/i,
];

const CLIENT_REQUEST_PATTERNS = [
  /кто смонтирует/i,
  /посоветуйте (монтажера|рилсмейкера)/i,
  /ищу на проект/i,
  /нужен монтажер/i,
  /ищем в команду/i,
  /подскажите специалиста/i,
  /требуется монтаж/i,
  /looking for editor/i,
  /need a video editor/i,
];

function isResumePost(text) {
  return RESUME_PATTERNS.some((p) => p.test(text));
}

function isAdPost(text) {
  return AD_PATTERNS.some((p) => p.test(text));
}

function isClientRequest(text) {
  return CLIENT_REQUEST_PATTERNS.some((p) => p.test(text));
}

async function fetchWithCache(url, cacheKey, force = false) {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  if (!force && fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      // 24 hour TTL
      if (Date.now() - data.cachedAt < 24 * 60 * 60 * 1000) {
        return data.content;
      }
    } catch {
      // Ignore cache read error, re-fetch
    }
  }

  // Polite delay for live requests
  await sleep(150);

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  const html = await res.text();
  const entry = {
    url,
    status: res.status,
    cachedAt: Date.now(),
    content: {
      status: res.status,
      html,
    },
  };

  fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf8');
  return entry.content;
}

export async function verifySource(candidate, force = false) {
  const username = candidate.id.toLowerCase();
  const previewUrl = `https://t.me/s/${username}`;
  const directUrl = `https://t.me/${username}`;

  // Fetch preview and direct page
  const [previewRes, directRes] = await Promise.all([
    fetchWithCache(previewUrl, `${username}_preview`, force),
    fetchWithCache(directUrl, `${username}_direct`, force),
  ]);

  const previewHtml = previewRes.html;
  const directHtml = directRes.html;

  // Check 404 / not found
  if (
    directHtml.includes('Channel with username') &&
    directHtml.includes('not found')
  ) {
    return {
      success: false,
      status: 'dead',
      reason: 'Channel or username not found on Telegram',
      candidate,
    };
  }

  // Check private invite required
  if (
    directHtml.includes('Join Group') &&
    directHtml.includes('t.me/+') &&
    !directHtml.includes('tgme_page_title')
  ) {
    return {
      success: false,
      status: 'private',
      reason: 'Requires private invite link',
      candidate,
    };
  }

  // Detect title
  const ogTitleMatch =
    previewHtml.match(/<meta property="og:title" content="([^"]+)">/) ||
    directHtml.match(/<meta property="og:title" content="([^"]+)">/);
  const title = ogTitleMatch ? cleanHtmlText(ogTitleMatch[1]).trim() : username;

  // Detect description
  const ogDescMatch =
    previewHtml.match(/<meta property="og:description" content="([^"]+)">/) ||
    directHtml.match(/<meta property="og:description" content="([^"]+)">/);
  const description = ogDescMatch
    ? cleanHtmlText(ogDescMatch[1]).slice(0, 150)
    : `Telegram источник @${username}`;

  // 2.1 Detect subscribers / members with full support for K, M, spaces, \u00A0 and &nbsp;
  let subscribers = 1500;
  let isGroup = false;

  const extraMatch =
    directHtml.match(/<div class="tgme_page_extra">([^<]+)<\/div>/i) ||
    previewHtml.match(/<div class="tgme_page_extra">([^<]+)<\/div>/i);

  if (extraMatch) {
    const rawExtra = extraMatch[1].replace(/&nbsp;|\u00A0/g, ' ').trim();
    if (
      /member|участник|online|онлайн/i.test(rawExtra) ||
      directHtml.includes('Join Group') ||
      directHtml.includes('t.me/joinchat')
    ) {
      isGroup = true;
    }

    const numMatch = rawExtra.match(/([\d\s.,]+)\s*([kmкм])?/i);
    if (numMatch) {
      const cleanDigits = numMatch[1].replace(/\s/g, '').replace(',', '.');
      let val = parseFloat(cleanDigits);
      if (!isNaN(val)) {
        const unit = (numMatch[2] || '').toLowerCase();
        if (unit === 'k' || unit === 'к') val *= 1000;
        if (unit === 'm' || unit === 'м') val *= 1000000;
        subscribers = Math.round(val);
      }
    }
  }

  // Check messages from preview
  const msgMatches = [...previewHtml.matchAll(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g)];
  const timeMatches = [...previewHtml.matchAll(/<time datetime="([^"]+)"/g)];

  const hasPreview = msgMatches.length > 0;

  // If no preview messages, check if valid group or public channel
  if (!hasPreview) {
    if (isGroup) {
      // 2.1 Verified public group/chat without preview
      return {
        success: true,
        item: {
          id: username,
          title,
          username,
          url: directUrl,
          type: 'group',
          category: candidate.category,
          language: candidate.language || 'ru',
          description,
          subscribers: subscribers || 1200,
          qualityScore: subscribers > 10000 ? 75 : 65,
          status: 'group_unverified',
          tags: candidate.tags || ['chat', 'community'],
          warnings: [],
          recommended: false,
          discoveredFrom: candidate.discoveredFrom,
          verifiedAt: new Date().toISOString(),
        },
      };
    }

    // Public channel where /s/ web preview is redirected or disabled
    if (extraMatch && (extraMatch[1].includes('subscribers') || extraMatch[1].includes('подписчиков'))) {
      return {
        success: true,
        item: {
          id: username,
          title,
          username,
          url: directUrl,
          type: 'channel',
          category: candidate.category,
          language: candidate.language || 'ru',
          description,
          subscribers: subscribers || 5000,
          postsPerWeek: 14,
          qualityScore: 65,
          status: 'ok',
          tags: candidate.tags || ['channel', 'remote'],
          recommended: false,
          discoveredFrom: candidate.discoveredFrom,
          verifiedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: false,
      status: 'dead',
      reason: 'No preview messages available and no member info',
      candidate,
    };
  }

  // Extract lastPostAt
  let lastPostAt = undefined;
  if (timeMatches.length > 0) {
    lastPostAt = timeMatches[timeMatches.length - 1][1];
  }

  // Calculate postsPerWeek
  let postsPerWeek = 14;
  if (timeMatches.length >= 2) {
    const firstDate = new Date(timeMatches[0][1]).getTime();
    const lastDate = new Date(timeMatches[timeMatches.length - 1][1]).getTime();
    const daysDiff = Math.max((lastDate - firstDate) / (1000 * 60 * 60 * 24), 1);
    postsPerWeek = Math.round((timeMatches.length / daysDiff) * 7);
  }

  // Analyze messages
  const texts = msgMatches.map((m) => cleanHtmlText(m[1]));
  const totalMsgs = texts.length;
  let vacancyCount = 0;
  let resumeCount = 0;
  let adCount = 0;
  let clientRequestCount = 0;
  const seenHashes = new Set();
  let duplicateCount = 0;

  for (const text of texts) {
    if (matchesVacancy(text).isMatch) {
      vacancyCount++;
    }
    if (isResumePost(text)) {
      resumeCount++;
    }
    if (isAdPost(text)) {
      adCount++;
    }
    if (isClientRequest(text)) {
      clientRequestCount++;
    }
    const hash = computeTextHash(text);
    if (seenHashes.has(hash)) {
      duplicateCount++;
    }
    seenHashes.add(hash);
  }

  // 2.2 Проверка релевантности по контенту среди последних 20 постов
  const recentTexts = texts.slice(-20);
  const totalRecent = recentTexts.length;
  let recentRelevantCount = 0;
  let recentContactCount = 0;

  for (const text of recentTexts) {
    if (matchesVacancy(text).isMatch) {
      recentRelevantCount++;
    }
    if (/@[\w_]{4,}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|t\.me\/[\w_]+/i.test(text)) {
      recentContactCount++;
    }
  }

  const relevanceRatio = totalRecent > 0 ? recentRelevantCount / totalRecent : 0;
  const responseRate = totalRecent > 0 ? recentContactCount / totalRecent : 0;

  const warnings = [];
  if (totalRecent >= 5 && relevanceRatio < 0.10) {
    warnings.push('low_relevance');
  }
  if (adRate > 0.35) {
    warnings.push('spam');
  }

  // 2.3 Формула качества источника:
  // quality_score = 0.3 * activity (постов в неделю) + 0.3 * relevance (доля целевых) +
  // 0.2 * response_rate (наличие прямых контактов @/email) + 0.2 * log(subscribers+1)
  const activityScore = Math.min(postsPerWeek / 20, 1) * 100;
  const relevanceScore = relevanceRatio * 100;
  const responseScore = responseRate * 100;
  const audienceScore = Math.min(Math.log10(subscribers + 1) / 5, 1) * 100;

  let rawQuality = 0.3 * activityScore + 0.3 * relevanceScore + 0.2 * responseScore + 0.2 * audienceScore;

  // Если релевантных <10% — quality_score снижаем вдвое
  if (warnings.includes('low_relevance')) {
    rawQuality *= 0.5;
  }

  let qualityScore = Math.round(Math.max(10, Math.min(100, rawQuality)));

  const now = Date.now();
  const lastPostTime = lastPostAt ? new Date(lastPostAt).getTime() : 0;
  const hoursSinceLastPost = lastPostTime ? (now - lastPostTime) / (1000 * 60 * 60) : 9999;
  const daysSinceLastPost = hoursSinceLastPost / 24;

  // Determine status
  let status = 'ok';
  if (daysSinceLastPost > 60) {
    status = 'dead';
  } else if (daysSinceLastPost > 14) {
    status = 'stale';
  } else if (qualityScore < 30) {
    status = 'stale';
  }

  if (status === 'dead' || status === 'private') {
    return {
      success: false,
      status,
      reason: `Status is ${status} (days since last post: ${Math.round(daysSinceLastPost)})`,
      candidate,
    };
  }

  const finalType = isGroup ? 'group' : 'channel';
  const itemStatus = isGroup ? 'group' : (status === 'stale' ? 'ok' : status);

  return {
    success: true,
    item: {
      id: username,
      title,
      username,
      url: directUrl,
      type: finalType,
      category: candidate.category,
      language: candidate.language || 'ru',
      description,
      subscribers: subscribers || 1500,
      postsPerWeek,
      lastPostAt,
      vacancyRate: relevanceRatio,
      qualityScore,
      status: itemStatus,
      warnings,
      tags: candidate.tags || ['video', 'editing'],
      recommended: false, // will be assigned to top 15 later
      discoveredFrom: candidate.discoveredFrom,
      verifiedAt: new Date().toISOString(),
    },
  };
}

async function main() {
  console.log('[Verify] Loading candidates from:', CANDIDATES_FILE);
  if (!fs.existsSync(CANDIDATES_FILE)) {
    console.error('[Error] Candidates file not found:', CANDIDATES_FILE);
    process.exit(1);
  }

  let candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
  console.log(`[Verify] Loaded ${candidates.length} candidates.`);

  if (flagCategory) {
    candidates = candidates.filter((c) => c.category === flagCategory);
    console.log(`[Verify] Filtered by category '${flagCategory}': ${candidates.length} candidates.`);
  }

  if (flagLimit && flagLimit > 0) {
    candidates = candidates.slice(0, flagLimit);
    console.log(`[Verify] Limited to ${flagLimit} candidates.`);
  }

  const verifiedItems = [];
  const unverifiedItems = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    process.stdout.write(`[${i + 1}/${candidates.length}] Checking @${candidate.id}... `);
    try {
      const result = await verifySource(candidate, flagForce);
      if (result.success && result.item) {
        verifiedItems.push(result.item);
        console.log(`OK (score: ${result.item.qualityScore}, status: ${result.item.status})`);
      } else {
        unverifiedItems.push({
          id: candidate.id,
          category: candidate.category,
          status: result.status,
          reason: result.reason,
          discoveredFrom: candidate.discoveredFrom,
          checkedAt: new Date().toISOString(),
        });
        console.log(`FAILED (${result.reason})`);
      }
    } catch (err) {
      console.log(`ERROR (${err.message})`);
      unverifiedItems.push({
        id: candidate.id,
        category: candidate.category,
        status: 'error',
        reason: err.message,
        discoveredFrom: candidate.discoveredFrom,
        checkedAt: new Date().toISOString(),
      });
    }
  }

  console.log(`\n[Verify] Summary:`);
  console.log(`  Valid verified items: ${verifiedItems.length}`);
  console.log(`  Unverified / excluded: ${unverifiedItems.length}`);

  // Sort by qualityScore descending
  verifiedItems.sort((a, b) => b.qualityScore - a.qualityScore);

  // 2.4 Mark top 15 sources (qualityScore >= 65, last post <= 3 days, no spam/low_relevance) as recommended
  let recommendedCount = 0;
  for (const item of verifiedItems) {
    const hoursSinceLastPost = item.lastPostAt
      ? (Date.now() - new Date(item.lastPostAt).getTime()) / (1000 * 3600)
      : 999;
    const daysSinceLast = hoursSinceLastPost / 24;
    const itemWarnings = item.warnings || [];

    const isEligible =
      item.qualityScore >= 65 &&
      daysSinceLast <= 3 &&
      !itemWarnings.includes('spam') &&
      !itemWarnings.includes('low_relevance');

    if (isEligible && recommendedCount < 15) {
      item.recommended = true;
      recommendedCount++;
    } else {
      item.recommended = false;
    }
  }
  console.log(`  Marked ${recommendedCount} sources as recommended (top-15).`);

  if (!flagDryRun) {
    fs.writeFileSync(OUTPUT_CATALOG_FILE, JSON.stringify(verifiedItems, null, 2), 'utf8');
    console.log(`[Verify] Saved catalog to: ${OUTPUT_CATALOG_FILE}`);

    fs.writeFileSync(UNVERIFIED_FILE, JSON.stringify(unverifiedItems, null, 2), 'utf8');
    console.log(`[Verify] Saved unverified to: ${UNVERIFIED_FILE}`);
  } else {
    console.log(`[Verify] DRY-RUN enabled, files not written.`);
  }
}

// Execute if run directly
if (process.argv[1] && process.argv[1].endsWith('verify-sources.mjs')) {
  main().catch((err) => {
    console.error('[Verify] Fatal error:', err);
    process.exit(1);
  });
}
