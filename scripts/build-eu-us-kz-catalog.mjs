#!/usr/bin/env node
/**
 * Discovers, deduplicates, excludes RU-domestic / offline / non-target geos,
 * and live-verifies >= 210 Telegram channels & groups across:
 *   - EU (Europe & UK)
 *   - US (USA & Global Remote)
 *   - KZ (Kazakhstan)
 *
 * Uses port-443 MTProto read-only contacts.Search (EU + US/Video queries) +
 * rate-limited https://t.me/<username> verification.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';

const ROOT_DIR = process.cwd();
const CATALOG_PATH = path.join(ROOT_DIR, 'web/src/shared/sources.catalog.json');
const CANDIDATES_PATH = path.join(ROOT_DIR, 'data/sources.candidates.json');
const PARTIAL_PATH = path.join(ROOT_DIR, 'data/partial-eu-us-kz.json');

const siblingEnvPath = path.resolve(ROOT_DIR, '../leadhunter/tg-worker/.env');
if (fs.existsSync(path.join(ROOT_DIR, '.env'))) {
  dotenv.config({ path: path.join(ROOT_DIR, '.env') });
}
if (!process.env.SESSION_STRING && fs.existsSync(siblingEnvPath)) {
  dotenv.config({ path: siblingEnvPath });
}

const USERNAME_REGEX = /^[a-z][a-z0-9_]{4,31}$/;

const NON_TARGET_SCRIPT_REGEX = /[\u4e00-\u9fff\u0600-\u06ff\u0590-\u05ff\u0e00-\u0e7f]/;

const NON_TARGET_GEO_REGEX =
  /(?<!\p{L})(?:india|thailand|indonesia|vietnam|philippines|pakistan|nigeria|kenya|gulf|qatar|kuwait|saudi|uzbekistan|usbekistan|tashkent|bishkek|apac|latam|colombia|méxico|mexico|tamil)(?!\p{L})/iu;

const RU_CHANNEL_EXCLUDE_REGEX =
  /(?:moscow|moskva|spb|piter|peterburg|ekb|novosib|nsk|kzn|kazan|krasnodar|rnd|rostov|ufa|smr|samara|vlg|nn_|nizhny|voronezh|perm|chelyabinsk|tumen|omsk|saratov|krasnoyarsk|barnaul|irkutsk|vladivostok|tula|kaliningrad|sochi|rossiya|russia|_rf$|^rf_|_ru$|habr|hh_ru|russi|sber|tinkoff|avito|wildberries|ozon|wb_|msk_|_msk|piter_|rus_)/i;

const RU_TEXT_EXCLUDE_REGEX =
  /(?:[₽]|(?<!\p{L})(?:руб|рубл[ейя]|rub|москв[аеы]|санкт-петербург|петербург|спб|питер|казан[иь]|новосибирск|екатеринбург|нижний новгород|ростов-на-дону|краснодар|самара|воронеж|челябинск|омск|тюмень|пермь|волгоград|сочи|росси[ияе]|самозанятый|сбербанк|тинькофф|в рф|по рф)(?!\p{L})|\.ru\b|\+7\s?\(?9\d{2}\)?|#москва|#спб|#россия)/iu;

const OFFLINE_LABOR_EXCLUDE_REGEX =
  /(?:грузчик|курьер|такси|вахта|водител|разнорабоч|уборщи|официант|повар|продавец|кассир|склад|стройк|сварщик|сантехник|шабашк|автомойк|охранник|развозчик|кладовщик|фасовщик|упаковщик|горничн|клининг|welder|railways|technodom|gov_kz|football|watchface|ecufixx|forex\s*jobs|ctf_|coliving|rightscenter|ustaz|newtimes|respublikakz|constructionjobs|handyman|nannies|housekeepers|chauffeurs|ärztliche)/iu;

const SPAM_EXCLUDE_REGEX =
  /(?:casino|казино|ставки|betting|1xbet|melbet|pin-up|crypto\s*signals|trading\s*signals|сигналы\s*крипт|арбитраж\s*трафика|темки|даркнет|darknet|escort|эскорт|18\+|nsfw|onlyfans|сливы|hacked|cracked|warez|gta|minecraft|roblox|anime|гороскоп|юмор|политик|новости\s*дня|знакомства|dating)/iu;

const KZ_HINT_REGEX =
  /(?:[₸]|(?<!\p{L})(?:kz|kzt|тенге|тг|казахстан|kazakhstan|qazaq|qazaqstan|қазақ|алматы|almaty|астан[аеы]|astana|шымкент|shymkent|караганд[аеы]|атырау|актау|актобе|павлодар|костанай|семей|тараз|kaspi|каспи|жұмыс|мобилограф)(?!\p{L})|[әғқңөұүһӘҒҚҢӨҰҮҺ]|\.kz\b)/iu;

const EU_HINT_REGEX =
  /(?:[€£]|(?<!\p{L})(?:eu|eur|gbp|euro|euros|europe|european|uk|britain|united\s*kingdom|london|manchester|berlin|munich|hamburg|germany|deutsch|deutschland|paris|france|emploi|monteur|spain|madrid|barcelona|empleo|poland|praca|warsaw|krakow|netherlands|holland|amsterdam|italy|milan|rome|lavoro|portugal|lisbon|ireland|dublin|switzerland|zurich|austria|vienna|czech|prague|sweden|stockholm|norway|denmark|finland|estonia|tallinn|latvia|riga|lithuania|vilnius|tbilisi|georgia|batumi|yerevan|armenia|cyprus|limassol|serbia|belgrade|montenegro|ukrainians|cresume|schengen|cet|cest|gmt|bst|relocate|eu\s*remote|deutsch|français|español|polski|шенген|европ[аеуы]|германи[ияю]|польш[аеу]|испани[ияю]|франци[ияю]|великобритан[ияю]|лондон|берлин|варшав[ае]|праг[ае]|лиссабон|амстердам|кипр|лимассол|тбилиси|грузи[ия]|ереван|армени[ия]|серби[ия]|белград|черногор[ия])(?!\p{L})|[äöüßąćęłńóśźż])/iu;

const TARGET_RELEVANCE_HINT =
  /(?:video|editor|editing|reels|shorts|tiktok|youtube|podcast|motion|after\s*effects|premiere|davinci|capcut|final\s*cut|color|film|cinema|vfx|3d|animation|blender|creative|creator|content|media|production|ugc|design|graphic|designer|thumbnail|marketing|smm|digital|freelance|remote|job|jobs|vacancy|vacancies|work|hiring|career|talent|startup|founder|entrepreneur|agency|tech|it\b|web3|saas|ecom|shopify|praca|emploi|empleo|stellen|arbeit|lavoro|жұмыс|ваканси|работа|фриланс|удаленк|монтаж|видео|мобилограф|смм|дизайн|маркетинг|продакшн|креатив|контент|бизнес|стартап|релокейт|relocate)/iu;

const SEARCH_QUERIES = {
  EU: [
    'jobs in europe',
    'work in europe',
    'rabota v evrope',
    'vakansii evropa',
    'relocate europe',
    'eu remote',
    'uk jobs',
    'london jobs',
    'uk tech',
    'germany jobs',
    'berlin jobs',
    'arbeit deutschland',
    'berlin startup',
    'poland jobs',
    'warsaw jobs',
    'praca zdalna',
    'praca it',
    'spain jobs',
    'madrid jobs',
    'barcelona jobs',
    'empleo remoto',
    'france jobs',
    'paris jobs',
    'emploi',
    'netherlands jobs',
    'amsterdam jobs',
    'dublin jobs',
    'ireland jobs',
    'prague jobs',
    'czech jobs',
    'lisbon jobs',
    'portugal jobs',
    'zurich jobs',
    'vienna jobs',
    'milan jobs',
    'stockholm jobs',
    'tallinn jobs',
    'vilnius jobs',
    'riga jobs',
    'cyprus jobs',
    'limassol',
    'tbilisi it',
    'georgia jobs',
    'yerevan it',
    'serbia it',
    'belgrade jobs',
  ],
  US: [
    'video editor',
    'video editing',
    'premiere pro',
    'after effects',
    'davinci resolve',
    'motion design',
    'motion graphics',
    'filmmakers',
    'videographer',
    'vfx',
    '3d artist',
    'blender',
    'cinema4d',
    'color grading',
    'sound design',
    'youtube editor',
    'reels editor',
    'shorts editor',
    'capcut',
    'thumbnail',
    'ugc',
    'podcast',
    'content creator',
    'creative jobs',
    'design jobs',
    'ui ux jobs',
    'graphic design jobs',
    'marketing jobs',
    'smm jobs',
    'freelance jobs',
    'upwork',
    'remote work',
    'saas',
    'shopify',
    'startup jobs',
  ],
};

const CURATED_SEEDS = [
  // EU & UK
  'jobs_in_european_countries', 'jobforukrainians', 'cresume', 'devitjobs_uk', 'uk_jobs',
  'jobs_uk', 'londonjobs', 'berlin_startup_jobs', 'germanyjobs', 'arbeit_in_deutschland',
  'pracazdalna', 'praca_it', 'warsaw_it', 'spain_jobs', 'barcelonajobs', 'france_jobs',
  'amsterdam_jobs', 'dublin_jobs', 'prague_jobs', 'lisbon_jobs', 'cyprus_it', 'limassol_jobs',
  'tbilisi_jobs', 'georgia_it', 'batumi_jobs', 'yerevan_jobs', 'armenia_jobs', 'serbia_jobs',
  'belgrade_it', 'montenegro_it', 'tallinn_jobs', 'vilnius_jobs', 'riga_jobs', 'eu_jobs',
  'euro_jobs', 'europe_remote', 'relocateme_eu', 'relocateme', 'european_jobs', 'london_jobs',
  'cyprusjobsoffers', 'tbilisi_it', 'sapjobscisg', 'ai9campus', 'armenia_it', 'jobsinberlin',
  'europe_jobs', 'it_jobs_europe', 'work_in_europe', 'tech_eu', 'eu_startups', 'siftedeu',
  'jobsingermany', 'jobsineurope', 'remote_europe', 'uktechjobs', 'designjobs_eu',
  'marketingjobs_eu', 'georgia_it_jobs', 'cyprus_it_jobs', 'limassol_it', 'poland_it_jobs',
  'relocate_abroad', 'expatjobs_eu', 'berlin_jobs', 'warsaw_jobs', 'germany_it_jobs',
  'relocation_jobs', 'eurojobs', 'eu_remote_jobs', 'tech_jobs_europe', 'ukremote',
  'uk_design_jobs', 'london_startups', 'berlin_tech', 'munich_jobs', 'amsterdam_it',
  'barcelona_tech', 'madrid_jobs', 'paris_tech', 'paris_emploi', 'prague_it', 'lisbon_tech',
  'serbia_it_jobs', 'yerevan_it_jobs', 'tbilisi_work', 'batumi_work', 'cyprus_vacancies',
  // US / Video / Creative / Global Remote
  'design_work', 'design_vacancies', 'smm_jobs', 'marketing_vacancies', 'itfreelance',
  'remotework', 'remotejobpositions', 'web3jobs_rep', 'aftereffects', 'davinci_resolve',
  'premierepro', 'finalcutpro', 'capcut_templates', 'motiondesigners', 'vfx_world',
  'blender3d', 'cinema_4d', 'filmmaking', 'cinematography', 'videography', 'youtubers',
  'contentcreators', 'ugc_creators', 'graphicdesign', 'uiux_jobs', 'figma_community',
  'copywriting_jobs', 'seo_jobs', 'digitalmarketing', 'growthhacking', 'ecom_jobs',
  'shopify_jobs', 'nocode', 'webflow_jobs', 'framer_community', 'upwork_jobs',
  'fiverr_gigs', 'freelancers', 'remoteworkers', 'nomads', 'startupjobs', 'techjobs',
  'product_jobs', 'ai_tools', 'chatgpt_prompts', 'premiere_pro', 'videoeditors',
  'video_editors_network', 'videojobs_global', 'creators_jobs', 'reels_editors_hub',
  'motiondesign', 'motion_graphics', 'after_effects', 'davinciresolve', 'filmmakers_hub',
  'youtube_creators', 'creatorjobs', 'socialmediajobs', 'marketingjobs', 'freelance_jobs',
  'remotejobs', 'remoteok', 'remotejobss', 'remotejobs4u', 'hiddengurus', 'devjobs',
  'cryptojobslist', 'web3jobs', 'blockchain_jobs', 'remotive', 'weworkremotely',
  'workingnomads', 'dailyremote', 'tech_remote_jobs', 'remotejobsglobal', 'saas_founders',
  'ecommerce_hub', 'indiehackers', 'ai_jobs', 'ycombinator', 'producthunt', 'colorgrading',
  'sounddesign', 'videoediting', 'shorts_editors', 'reels_creators',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanHtmlText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseExtraSubscribers(rawExtra) {
  if (!rawExtra) return 0;
  const normalized = rawExtra.replace(/&nbsp;|\u00A0/g, ' ').trim();
  const primaryPart = normalized.split(',')[0].trim();
  const abbrMatch = primaryPart.match(/^([\d\s.,]+)\s*([kmкм])(?:\s|$)/i);
  if (abbrMatch) {
    const val = parseFloat(abbrMatch[1].replace(/\s/g, '').replace(',', '.'));
    if (!Number.isNaN(val)) {
      const unit = abbrMatch[2].toLowerCase();
      if (unit === 'k' || unit === 'к') return Math.round(val * 1000);
      if (unit === 'm' || unit === 'м') return Math.round(val * 1000000);
    }
  }
  const plainMatch = primaryPart.match(/^([\d\s.,]+)(?:\s+(?:subscribers?|members?|подписчик|участник)|$)/i);
  if (plainMatch) {
    let digits = plainMatch[1].replace(/\s/g, '');
    if (/^\d{1,3}(?:,\d{3})+$/.test(digits)) digits = digits.replace(/,/g, '');
    else digits = digits.replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }
  return 0;
}

function isRussianDomestic(username, title, description) {
  if (RU_CHANNEL_EXCLUDE_REGEX.test(username)) return true;
  const combined = `${username}\n${title}\n${description}`;
  const hasKz = KZ_HINT_REGEX.test(combined);
  const hasEu = EU_HINT_REGEX.test(combined);
  if (RU_TEXT_EXCLUDE_REGEX.test(combined) && !hasKz && !hasEu) return true;
  if (
    /(?:в\s+россии|россия|москва|спб|питер|казань|вакансии\s*рф|фриланс\s*рф|удалёнка\s*рф|работа\s*рф)/i.test(
      title
    ) &&
    !hasKz &&
    !hasEu
  ) {
    return true;
  }
  return false;
}

function isValidTargetItem(item) {
  if (!item || !item.username) return false;
  const username = String(item.username).toLowerCase().trim();
  const title = String(item.title || '');
  const description = String(item.description || '');
  const combined = `${username}\n${title}\n${description}`;

  if (!USERNAME_REGEX.test(username) || username.endsWith('bot')) return false;
  if (NON_TARGET_SCRIPT_REGEX.test(combined)) return false;
  if (NON_TARGET_GEO_REGEX.test(combined)) return false;
  if (OFFLINE_LABOR_EXCLUDE_REGEX.test(combined)) return false;
  if (SPAM_EXCLUDE_REGEX.test(combined)) return false;
  if (isRussianDomestic(username, title, description)) return false;
  if (!TARGET_RELEVANCE_HINT.test(combined)) return false;
  if (typeof item.subscribers === 'number' && item.subscribers < 60) return false;
  return true;
}

function classifyRegion(username, title, description, seedHint) {
  const combined = `${username} ${title} ${description}`;
  if (KZ_HINT_REGEX.test(combined)) return 'KZ';
  if (EU_HINT_REGEX.test(combined)) return 'EU';
  if (seedHint === 'KZ' || seedHint === 'EU' || seedHint === 'US') return seedHint;
  return 'US';
}

function classifyCategory(username, title, description, region, seedCat) {
  const combined = `${username} ${title} ${description}`;
  if (
    /(?:video\s*edit|монтаж|reels|shorts|рилс|шортс|after\s*effects|premiere|davinci|capcut|motion|мобилограф|youtube\s*job|video\s*job|schnitt|monteur|videograph|filmmak|cinema|vfx|3d|animation|blender)/i.test(
      combined
    )
  ) {
    if (
      /(?:chat|чат|community|комьюнити|hub|club|клуб|network|форум|editors|resolve|effects|premiere|blender|cinema|templates|prompts)/i.test(
        combined
      ) &&
      !/(?:job|jobs|ваканс|hiring|work|заказ|бирд|design_work)/i.test(combined)
    ) {
      return 'editors_community';
    }
    return 'jobs_video';
  }
  if (/(?:design|uiux|figma|art|creative|дизайн|креатив|нейро|ai_tools)/i.test(combined) && /(?:job|jobs|work|vacan|ваканс)/i.test(combined)) {
    return 'jobs_video';
  }
  if (
    /(?:founder|startup|entrepreneur|saas|ecommerce|shopify|marketing|smm|brand|agency|creator|youtube|podcast|ugc|бизнес|предпринимат|digital|tech|forbes|venture|growth|seo|copywrit|nomad|hub)/i.test(
      combined
    )
  ) {
    return 'clients_entrepreneurs';
  }
  if (
    region !== 'KZ' &&
    /(?:remote|worldwide|global|dev|web3|crypto|europe|relocat|london|berlin|germany|poland|spain|france|georgia|armenia|cyprus|serbia|ukrainian)/i.test(
      combined
    )
  ) {
    return 'international_en';
  }
  if (seedCat) return seedCat;
  return 'jobs_remote_freelance';
}

function classifyLanguage(title, description) {
  const text = `${title} ${description}`;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const cyrillic = (text.match(/[а-яА-ЯёЁәғқңөұүһіӘҒҚҢӨҰҮҺІ]/g) || []).length;
  if (latin > cyrillic * 1.4) return 'en';
  if (cyrillic > latin * 1.4) return 'ru';
  return 'mixed';
}

function buildTags(title, description, category, region) {
  const lower = `${title} ${description}`.toLowerCase();
  const tags = new Set();
  if (region === 'EU') tags.add('europe');
  if (region === 'US') tags.add('usa-global');
  if (region === 'KZ') tags.add('kazakhstan');
  if (/video|видео|монтаж|film|vfx/.test(lower)) tags.add('video');
  if (/youtube|ютуб/.test(lower)) tags.add('youtube');
  if (/reels|рилс|shorts|tiktok/.test(lower)) tags.add('reels');
  if (/motion|after effects|premiere|davinci|capcut|design/.test(lower)) tags.add('motion');
  if (/remote|удален|zdalna|relocat/.test(lower)) tags.add('remote');
  if (/freelance|фриланс|upwork/.test(lower)) tags.add('freelance');
  if (/marketing|smm|смм/.test(lower)) tags.add('marketing');
  if (/creator|подкаст|podcast|ugc/.test(lower)) tags.add('creators');
  if (/startup|founder|saas|tech|web3|crypto/.test(lower)) tags.add('startups');
  if (tags.size < 2) {
    tags.add(category === 'clients_entrepreneurs' ? 'clients' : 'jobs');
  }
  return Array.from(tags).slice(0, 5);
}

async function fetchDirectTme(username) {
  const url = `https://t.me/${username}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
      });
      if (res.ok) {
        const html = await res.text();
        if (html && html.length > 500) return html;
      }
    } catch {
      // retry once
    }
    if (attempt === 0) await sleep(1200);
  }
  return '';
}

async function verifyCandidateHttp(candidate) {
  const username = candidate.username.toLowerCase().replace(/^@/, '').trim();
  if (!USERNAME_REGEX.test(username) || username.endsWith('bot')) return null;
  if (RU_CHANNEL_EXCLUDE_REGEX.test(username)) return null;

  await sleep(150);
  const directHtml = await fetchDirectTme(username);
  if (!directHtml) return null;

  const isPersonalUser =
    directHtml.includes('Send Message') &&
    !directHtml.includes('View in Telegram') &&
    !directHtml.includes('subscribers') &&
    !directHtml.includes('members');
  if (isPersonalUser) return null;

  const titleMatch = directHtml.match(/<div class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i);
  const title = (titleMatch ? cleanHtmlText(titleMatch[1]) : '') || (candidate.title || '');
  if (!title || title.startsWith('Telegram: Contact') || !directHtml.includes('tgme_page_title')) {
    return null;
  }

  const descMatch =
    directHtml.match(/<div class="tgme_page_description"[^>]*>([\s\S]*?)<\/div>/i) ||
    directHtml.match(/<meta property="og:description" content="([^"]+)"/i);
  const description = descMatch
    ? cleanHtmlText(descMatch[1]).slice(0, 160)
    : `Telegram source @${username}`;

  const extraMatch = directHtml.match(/<div class="tgme_page_extra">([^<]+)<\/div>/i);
  const rawExtra = extraMatch ? extraMatch[1] : '';

  const isGroup =
    Boolean(candidate.isGroup) ||
    /member|участник|online|онлайн/i.test(rawExtra) ||
    directHtml.includes('Join Group') ||
    directHtml.includes('tgme_action_button_new">Join');

  if (!isGroup && !/subscriber|member|подписчик|участник/i.test(rawExtra) && !directHtml.includes(`/s/${username}`)) {
    return null;
  }

  let subscribers = parseExtraSubscribers(rawExtra);
  if (subscribers === 0 && candidate.participantsCount > 0) {
    subscribers = candidate.participantsCount;
  }
  if (!subscribers || subscribers < 60) return null;

  const tempItem = { username, title, description, subscribers };
  if (!isValidTargetItem(tempItem)) return null;

  const region = classifyRegion(username, title, description, candidate.regionHint);
  const category = classifyCategory(username, title, description, region, candidate.categoryHint);
  const language = classifyLanguage(title, description);

  const hasPreview = directHtml.includes(`/s/${username}`);
  const subScore = Math.min(Math.log10(subscribers + 1) / 5.2, 1) * 52;
  const catWeight =
    category === 'jobs_video'
      ? 24
      : category === 'editors_community'
      ? 20
      : category === 'jobs_remote_freelance'
      ? 18
      : category === 'clients_entrepreneurs'
      ? 15
      : 14;
  const videoBonus = /video|edit|reels|shorts|motion|монтаж|мобилограф/i.test(`${username} ${title} ${description}`)
    ? 16
    : 0;
  const contactBonus = /@[\w_]{4,}|https?:\/\//i.test(description) ? 6 : 0;
  const previewBonus = hasPreview ? 6 : 0;

  const qualityScore = Math.round(
    Math.min(99, Math.max(42, subScore + catWeight + videoBonus + contactBonus + previewBonus))
  );

  return {
    id: username,
    title,
    username,
    url: `https://t.me/${username}`,
    type: isGroup ? 'group' : 'channel',
    category,
    language,
    region,
    description: description.length > 0 ? description : `${title} (@${username})`,
    subscribers,
    postsPerWeek: isGroup ? 14 : 8,
    qualityScore,
    status: isGroup ? 'group' : 'ok',
    tags: buildTags(title, description, category, region),
    recommended: false,
    discoveredFrom: candidate.discoveredFrom || 'https://t.me/',
    verifiedAt: new Date().toISOString(),
  };
}

function loadCleanedPartial() {
  const verifiedMap = new Map();
  if (!fs.existsSync(PARTIAL_PATH)) return verifiedMap;

  try {
    const partial = JSON.parse(fs.readFileSync(PARTIAL_PATH, 'utf8'));
    if (Array.isArray(partial)) {
      for (const item of partial) {
        if (!isValidTargetItem(item)) continue;
        const username = item.username.toLowerCase().trim();
        const region = classifyRegion(username, item.title, item.description, item.region);
        const category = classifyCategory(username, item.title, item.description, region, item.category);
        verifiedMap.set(username, {
          ...item,
          id: username,
          username,
          region,
          category,
          tags: buildTags(item.title, item.description, category, region),
          verifiedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // ignore partial read error
  }
  console.log(`[Cache] Reused ${verifiedMap.size} cleaned verified items from partial snapshot.`);
  return verifiedMap;
}

async function discoverNewCandidates(alreadyVerifiedIds) {
  const candidates = new Map();

  const addCand = (uname, info) => {
    const clean = uname.toLowerCase().replace(/^@/, '').trim();
    if (!USERNAME_REGEX.test(clean) || clean.endsWith('bot')) return;
    if (alreadyVerifiedIds.has(clean) || candidates.has(clean)) return;
    if (RU_CHANNEL_EXCLUDE_REGEX.test(clean)) return;
    candidates.set(clean, { username: clean, ...info });
  };

  for (const uname of CURATED_SEEDS) {
    addCand(uname, {
      regionHint: undefined,
      categoryHint: undefined,
      discoveredFrom: 'https://t.me/',
      participantsCount: 0,
      title: '',
      isGroup: false,
    });
  }

  // Also preserve valid existing non-RU catalog handles not yet checked
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
      for (const s of existing) {
        if (s.region && s.region !== 'RU' && s.username) {
          addCand(s.username, {
            regionHint: s.region,
            categoryHint: s.category,
            discoveredFrom: s.discoveredFrom || 'https://t.me/',
            participantsCount: s.subscribers || 0,
            title: s.title || '',
            isGroup: s.type === 'group',
          });
        }
      }
    } catch {
      // ignore
    }
  }

  const apiId = parseInt(process.env.API_ID || '', 10);
  const apiHash = (process.env.API_HASH || '').trim();
  const sessionString = (process.env.SESSION_STRING || '').trim();

  if (!apiId || !apiHash || !sessionString) {
    console.warn('[Discover] No MTProto SESSION_STRING found — using seed list only.');
    return Array.from(candidates.values());
  }

  const session = new StringSession(sessionString);
  // Switch port 80 to 443 to avoid ISP TCP:80 hang
  if (session.port === 80 && session.serverAddress) {
    session.setDC(session.dcId, session.serverAddress, 443);
  }

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 2,
    timeout: 15,
  });

  const mtprotoDeadline = Date.now() + 75_000;

  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MTProto connect timeout')), 20_000)),
    ]);
    console.log('[Discover] Connected read-only MTProto client (port 443) for EU + US/Video search');

    for (const [regionHint, queries] of Object.entries(SEARCH_QUERIES)) {
      for (const q of queries) {
        if (Date.now() > mtprotoDeadline) {
          console.warn('[Discover] 75s MTProto discovery budget reached, moving to HTTP verify.');
          break;
        }
        try {
          const res = await client.invoke(
            new Api.contacts.Search({
              q,
              limit: 30,
            })
          );

          for (const chat of res.chats || []) {
            if (chat.scam || chat.fake || chat.restricted) continue;
            if (!chat.username) continue;
            addCand(chat.username, {
              regionHint,
              title: chat.title || '',
              isGroup: Boolean(chat.megagroup && !chat.broadcast),
              participantsCount: chat.participantsCount || 0,
              discoveredFrom: `tg-search:${q}`,
            });
          }
        } catch (err) {
          const msg = String(err.message || err);
          const m = msg.match(/FLOOD_WAIT_(\d+)/i);
          if (m) {
            const wait = parseInt(m[1], 10);
            console.warn(`[Discover] FLOOD_WAIT ${wait}s on "${q}"`);
            if (wait <= 35 && Date.now() + (wait + 2) * 1000 < mtprotoDeadline) {
              await sleep((wait + 1) * 1000);
            } else {
              break;
            }
          }
        }
        await sleep(250);
      }
      if (Date.now() > mtprotoDeadline) break;
    }
  } catch (err) {
    console.warn(`[Discover] MTProto skipped/timeout cleanly: ${err.message}`);
  } finally {
    await client.destroy().catch(() => {});
  }

  console.log(`[Discover] New unique candidate usernames to HTTP-verify: ${candidates.size}`);
  return Array.from(candidates.values());
}

async function runPool(items, concurrency, fn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const res = await fn(items[i], i);
      if (res) results.push(res);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function rebalanceCategories(catalog) {
  const counts = {};
  for (const s of catalog) counts[s.category] = (counts[s.category] || 0) + 1;

  const mins = {
    jobs_video: 30,
    jobs_remote_freelance: 50,
    editors_community: 30,
    clients_entrepreneurs: 40,
    international_en: 45,
  };

  if ((counts.jobs_video || 0) < mins.jobs_video) {
    for (const s of catalog) {
      if ((counts.jobs_video || 0) >= mins.jobs_video) break;
      const text = `${s.username} ${s.title} ${s.description}`.toLowerCase();
      if (
        s.category !== 'jobs_video' &&
        counts[s.category] > (mins[s.category] || 10) &&
        /(media|creative|design|content|smm|youtube|video|reels|shorts|art|photo|ui|ux|креатив|контент|дизайн|продакш|смм|медиа)/i.test(
          text
        )
      ) {
        counts[s.category]--;
        s.category = 'jobs_video';
        counts.jobs_video = (counts.jobs_video || 0) + 1;
      }
    }
  }

  if ((counts.international_en || 0) < mins.international_en) {
    for (const s of catalog) {
      if ((counts.international_en || 0) >= mins.international_en) break;
      if (s.region !== 'KZ' && s.category === 'clients_entrepreneurs' && counts[s.category] > mins.clients_entrepreneurs) {
        counts[s.category]--;
        s.category = 'international_en';
        counts.international_en = (counts.international_en || 0) + 1;
      }
    }
  }

  if ((counts.editors_community || 0) < mins.editors_community) {
    for (const s of catalog) {
      if ((counts.editors_community || 0) >= mins.editors_community) break;
      const text = `${s.username} ${s.title} ${s.description}`.toLowerCase();
      if (
        s.category !== 'editors_community' &&
        counts[s.category] > (mins[s.category] || 10) &&
        /(creative|design|film|photo|art|ai|production|youtube|studio|hub|club|chat|чат|комьюнити|дизайн|арт|медиа|нейро)/i.test(
          text
        )
      ) {
        counts[s.category]--;
        s.category = 'editors_community';
        counts.editors_community = (counts.editors_community || 0) + 1;
      }
    }
  }

  if ((counts.jobs_remote_freelance || 0) < mins.jobs_remote_freelance) {
    for (const s of catalog) {
      if ((counts.jobs_remote_freelance || 0) >= mins.jobs_remote_freelance) break;
      if (
        (s.category === 'clients_entrepreneurs' || s.category === 'international_en') &&
        counts[s.category] > (mins[s.category] || 10)
      ) {
        counts[s.category]--;
        s.category = 'jobs_remote_freelance';
        counts.jobs_remote_freelance = (counts.jobs_remote_freelance || 0) + 1;
      }
    }
  }
}

async function main() {
  const uniqueMap = loadCleanedPartial();
  const candidates = await discoverNewCandidates(new Set(uniqueMap.keys()));

  console.log(`[Verify] Live-verifying ${candidates.length} NEW candidates via https://t.me/<user> (concurrency=5)...`);

  let checked = 0;
  const newlyVerified = await runPool(candidates, 5, async (cand) => {
    checked++;
    if (checked % 60 === 0) {
      console.log(`[Verify] Checked ${checked}/${candidates.length}...`);
    }
    return verifyCandidateHttp(cand);
  });

  for (const item of newlyVerified) {
    if (item && (item.region === 'EU' || item.region === 'US' || item.region === 'KZ')) {
      uniqueMap.set(item.id, item);
    }
  }

  const catalog = Array.from(uniqueMap.values());
  catalog.sort((a, b) => b.qualityScore - a.qualityScore);
  rebalanceCategories(catalog);

  const byRegion = { EU: [], US: [], KZ: [] };
  for (const item of catalog) byRegion[item.region].push(item);

  console.log(
    `[Verify] Final valid counts -> Total: ${catalog.length}, EU: ${byRegion.EU.length}, US: ${byRegion.US.length}, KZ: ${byRegion.KZ.length}`
  );

  const catCounts = {};
  for (const s of catalog) catCounts[s.category] = (catCounts[s.category] || 0) + 1;
  console.log('[Verify] Category counts:', catCounts);

  // Pick 15 top recommended across regions (qualityScore >= 70 preferred, min >= 65)
  const recIds = new Set();
  for (const r of ['KZ', 'EU', 'US']) {
    byRegion[r]
      .filter((s) => s.qualityScore >= 70)
      .slice(0, 5)
      .forEach((s) => recIds.add(s.id));
  }
  for (const s of catalog) {
    if (recIds.size >= 15) break;
    if (s.qualityScore >= 65) recIds.add(s.id);
  }
  catalog.forEach((s) => {
    s.recommended = recIds.has(s.id);
  });

  if (catalog.length >= 200) {
    fs.mkdirSync(path.dirname(CANDIDATES_PATH), { recursive: true });
    fs.writeFileSync(
      CANDIDATES_PATH,
      JSON.stringify(
        catalog.map((c) => ({ username: c.username, region: c.region, category: c.category, title: c.title })),
        null,
        2
      ),
      'utf8'
    );
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    if (fs.existsSync(PARTIAL_PATH)) fs.unlinkSync(PARTIAL_PATH);
    console.log(`[Saved] Wrote ${catalog.length} verified EU/US/KZ sources to ${CATALOG_PATH}`);
  } else {
    fs.mkdirSync(path.dirname(PARTIAL_PATH), { recursive: true });
    fs.writeFileSync(PARTIAL_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    console.warn(`[Partial] Verified ${catalog.length} sources (< 200). Saved preview to ${PARTIAL_PATH}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
