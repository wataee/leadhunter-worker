/**
 * Region detection for LeadHunter vacancies & sources.
 * Active target markets:
 *   - 'EU': Europe & UK (EUR / GBP / European hubs & languages)
 *   - 'US': USA & Global Remote (USD / North America / International EN)
 *   - 'KZ': Kazakhstan (KZT / KZ cities / Kazakh & KZ Russian channels)
 *
 * Legacy / excluded posts with explicit Russian Ruble or Russia-only indicators
 * resolve to 'RU' so workers and UI filters automatically exclude them.
 */

export const REGIONS = ['EU', 'US', 'KZ'];

export const REGION_LABELS = {
  EU: '🇪🇺 Европа / UK',
  US: '🇺🇸 США / Global',
  KZ: '🇰🇿 Казахстан',
};

export const REGION_SHORT_LABELS = {
  EU: '🇪🇺 EU',
  US: '🇺🇸 US',
  KZ: '🇰🇿 KZ',
};

export function isSupportedRegion(region) {
  return region === 'EU' || region === 'US' || region === 'KZ';
}

// Known Kazakhstan channel patterns
const KZ_CHANNEL_PATTERNS = [
  /(^|_)kz($|_)|qazaq|kazakh|almaty|astana|shymkent|karaganda|atyrau|aktau|aktobe|kostanay|pavlodar|mobilograf/i,
];

// Known European channel patterns
const EU_CHANNEL_PATTERNS = [
  /(^|_)(eu|uk|de|fr|es|pl|nl|it|ch|cz|at|be|se|no|dk|fi|pt|ie|ee|lv|lt|ge|am)($|_)|europe|london|berlin|deutsch|germany|france|paris|spain|madrid|barcelona|poland|praca|warsaw|amsterdam|netherlands|dublin|zurich|italy|milano|prague|vienna|nordic|baltic|reloc/i,
];

// Known USA / Global channel patterns
const US_CHANNEL_PATTERNS = [
  /(^|_)us($|_)|usa|america|global|worldwide|remotejobs|web3|crypto|video_?edit|shortform|ytjobs|creator/i,
];

// Populated & kept in sync with verified sources.catalog.json
export const KNOWN_KZ_CHANNELS = new Set([
  'digital_iskra',
  'digitalbussinesskz',
  'almaty_rabotao',
  'almaty_rabota_v',
  'skwanggur',
  'designervsekz',
  'bluescreenkz',
  'rabota_astanau',
  'zhumys_astana_kz',
  'almaty_rabota_vq',
  'almaty_rabota_vw',
  'astana_rabota',
  'rabota_a1maty',
  'almaty_rabota05',
  'almaty_rabota01',
  'it_jobs_kz',
  'astana_it_university_official',
  'rabota_astanakzt',
  'aitujobs',
  'remote_kazakhstan',
  'rabota_almaty',
  'astana_rabota_jumys',
  'shokhrukh_smm',
  'vakankz',
  'astanahubcareer',
  'shymkent_rabota_job',
  'astana_rabota_vacancy',
  'rabota_v_almaty_kz',
  'mediadam',
  'biznesshtabalmaty',
  'rabotav_kz',
  'designerkz',
  'rabota_astana_online',
  'itnomads_jobs',
  'atyrau_job_pavlin',
  'it_jobkz',
  'nationalbusiness_kz',
  'astana_hub_community',
  'job_rabota888',
  'digitalagentkz',
  'designerkz_chat',
  'almaty_vakansii_kz',
  'vakankz1',
  'rabota_kz_vsem',
  'digitalministry_kz',
  'vakansii_qazaqstan_kz',
  'vakansii_kz',
  'jobs_it_kz',
  'rabota_zhumys_kz',
  'almaty_zhumys_kz',
  'designerkz_flood',
  'vakansii_v_kz',
  'digitalnomad_club',
  'tiktokforbusiness_kz',
  'freelance_chat_kz',
  'kzanatty_design',
  'almaty1_rabota',
  'businesshub_kz',
  'shymkent_job_pavlin',
  'astanaituniversity',
  'beelinebusinesskz',
  'marketingalmaty',
  'business_it_astana_hub',
  'itsastana',
  'opvakansii',
  'qazaqbiz_chat',
  'target_kz',
  'almatydigital',
  'creators_kz',
  'digitalalmaty24',
  'smmjobkz',
  'atamekenalmaty',
  'freelancersofkz',
  'digitalbusinesskzcommunity',
  'almatydigitalcommunity',
  'mediadigitalalmaty',
  'smm_almaty_kz',
]);

export const KNOWN_EU_CHANNELS = new Set([
  'cresume',
  'jobforukrainians',
  'jobs_in_european_countries',
  'workersinlondon',
  'smartrecruit_deutschland',
  'relocateme',
  'germantechjobs',
  'vacantesremotasempleoverse',
  'european_jobs',
  'jobs_ingermany',
  'work_jobs_poland',
  'rabota_v_evrope5',
  'feministjobsgermany',
  'remotojob',
  'spain_it_jobs',
  'notificajobs_madrid',
  'jobsineurop',
  'jobsupportsupport',
  'tecnoempleo_remoto',
  'remotejobpositions',
  'horeca_premium',
  'notificajobs_barcelona',
  'serbia_jobs',
  'tbilisi_work',
  'minijobs_berlin',
  'batumi_work',
  'jobs_ukrainianinpoland',
  'ukr_jobs',
  'jobs0germany',
  'london_jobs',
  'united_kingdom_jobs',
  'arbeit_ausbildung_deutschland',
  'jobsin_poland',
  'affiliate_jobs_warsaw',
  'rabota_v_polshe_evrope',
  'work_ukr_deutschland',
  'tbilisi_it',
  'workeuropeeuwww',
  'work_with_us_in_europe',
  'arbeit_germaniya',
  'robotaeuro',
  'jobstream_ukr',
  'techinuk',
  'arbeit_doska_deutschland',
  'jobs_in_poland1',
  'sapjobscisg',
  'georgia_it',
  'findmyremote_europe',
  'berlinwork',
  'jobs24_spain',
  'ai9campus',
  'unitedkingdom_jobs',
  'work_jobs_germany',
  'armenia_it',
  'happyhiring',
  'hotberlinjobs',
  'barcajobs',
  'empleos_remoto',
  'emploifrance',
  'international_jobs',
  'jobsinberlin',
  'london_jobs_4u',
  'remotejobsspain',
  'digitalmarketing',
  'empleosremotos',
  'rabota_evropa_vakansii',
  'remotejobs_munbuh',
  'technolozhka_in_uk',
  'jobswarsaw',
  'vacantesremotasdiarias',
  'europeremote',
  'europe_jobs',
  'it_jobs_europe',
  'arbeite_in_deutschland_nvr',
  'work_in_europe',
  'remote_eu_ua',
  'prague_it',
  'rabotaem_v_evrope',
  'it_jobs_france',
  'londonjobs',
  'vieorks',
  'euro_jobs_rabota_v_evrope',
  'affcareers_berlin',
  'berlinjobsr',
  'it_jobs_germany0',
  'berlinstartups',
  'digital_poland',
  'greenbridgepoland',
  'jobs_poland_peopleup',
  'jobs_poland',
  'eng_jobs_spain',
]);

export const KNOWN_US_CHANNELS = new Set([
  'premiere_pro',
  'remotejobss',
  'product_jobs',
  'cryptojobslist',
  'devjobs',
  'brodetsky',
  'uiux_jobs',
  'videoeditors',
  'hiddengurus',
  'remotejobs4u',
  'blockchain_job',
  'hrtech_jobs',
  'remotejobs',
  'motion_graphics',
  'ddevjobs',
  'jsb_charts',
  'remoteweb3jobs',
  'seo_jobs',
  'jobs_cryptos',
  'remoteok',
  'saas_founders',
  'jobs_web3',
  'ibcghr',
  'gamedev_and_tech_vacancy',
  'startup_fairy',
  'social3jobs',
  'startupjobs',
  'yourweb3jobs',
  'techjobsdaily',
  'chainjobs1',
  'cryptoblockchainjobs',
  'startup_ai',
  'hr_tech_startups',
  'metaworkdao',
  'web3jobs',
  'rust_jobs_nobc',
  'blockchain_jobs',
  'ecommerce_hub',
  'productvibe',
  'jobsweb3',
  'crypto_jobs_hub',
  'techie_jobs',
  'remotejobsglobal',
  'ai_jobs',
  'crypto_jobs',
  'graphicdesign',
  'webflow_jobs',
  'tech_ai_startups',
  'aftereffects',
  'youtube_creators',
  'tech_remote_jobs',
  'indiehackers',
  'gtmbe',
  'marketing_vacancies',
  'creators_jobs',
]);

// Strong KZ text markers (₸, tenge, KZ cities, Kazakh alphabet, Kaspi, +7 7xx, .kz)
const KZ_TEXT_REGEX =
  /(?:[₸]|(?<!\p{L})(?:тенге|kzt|кзт|тг)(?!\p{L})|алматы|астан[аеы]|шымкент|караганд[аеы]|атырау|актау|акт[ою]бинск|павлодар|семей|тараз|уральск|костанай|каспи|kaspi|халык|halyk|казахстан|kazakhstan|қазақстан|жұмыс|бейнемонтаж|мобилограф|\.kz\b|\+7\s?7\d{2})/iu;

// Strong EU / UK text markers (€, £, EUR, GBP, EU countries/cities, CET/CEST/GMT/BST, EU languages)
const EU_TEXT_REGEX =
  /(?:[€£]|(?<!\p{L})(?:eur|gbp|euro|euros|pounds|pln|chf|czk|евро|фунтов)(?!\p{L})|europe|eu\s+time\s?zone|cet\/?cest|\bcet\b|\bgmt\b|\bbst\b|united kingdom|uk\s+(?:only|remote|timezone)|london|berlin|munich|hamburg|germany|deutschland|paris|france|amsterdam|netherlands|holland|spain|madrid|barcelona|italy|milan|rome|poland|warsaw|krakow|prague|vienna|zurich|switzerland|ireland|dublin|lisbon|portugal|stockholm|copenhagen|oslo|helsinki|tallinn|riga|vilnius|tbilisi|yerevan|limassol|cyprus|serbia|belgrade|montenegro|европ[аеуы]|германи[ияю]|польш[аеу]|испани[ияю]|франци[ияю]|великобритан[ияю]|лондон|берлин|варшав[ае]|праг[ае]|лиссабон|амстердам|кипр|лимассол|тбилиси|грузи[ия]|ереван|армени[ия]|серби[ия]|белград|черногор[ия]|gesucht|suche\s+video|schnitt|recherche\s+monteur|monteur\s+vid[eé]o|editor\s+de\s+v[ií]deo|montażysta)/iu;

// Strong US / Global text markers ($, USD, North America timezones & states, global EN hiring phrases)
const US_TEXT_REGEX =
  /(?:[$]|(?<!\p{L})(?:usd|dollars|bucks)(?!\p{L})|united states|\busa\b|\bus\s+(?:only|based|timezone|time zone|clients?)\b|north america|canada|toronto|vancouver|est\/pst|\best\b|\bpst\b|\bcst\b|california|los angeles|new york|\bnyc\b|florida|miami|texas|austin|remote worldwide|global remote)/iu;

// Strict RU indicators (to filter out Ruble / Russia-domestic cross-posts)
const RU_TEXT_REGEX =
  /(?:[₽]|(?<!\p{L})(?:руб|рубл[ейя]|rub|самозанятый|сбербанк|тинькофф)(?!\p{L})|(?<=\d)\s*р(?![а-яёa-z])|москв[аеы]|moscow|питер|петербург|спб|екатеринбург|новосибирск|казань|краснодар|росси[ияе]|\bрф\b|сбер|т-банк|альфа-банк|\.ru\b)/iu;

// Kazakh-specific Cyrillic letters (excluding 'і' which overlaps with Ukrainian)
const KAZAKH_CHARS_REGEX = /[әғқңөұүһӘҒҚҢӨҰҮҺ]/;

// European accented Latin characters
const EU_ACCENT_REGEX = /[äöüßàâçéèêëîïôùûüñąćęłńóśźż]/iu;

/**
 * Detects the geographical region for a vacancy or channel.
 * @param {string} [text] Post text
 * @param {string} [channel] Channel username (with or without @)
 * @returns {'EU' | 'US' | 'KZ' | 'RU'}
 */
export function detectVacancyRegion(text = '', channel = '') {
  const cleanChannel = (channel || '').toLowerCase().replace(/^@/, '').trim();
  const str = String(text || '');

  const hasKz = KZ_TEXT_REGEX.test(str);
  const hasEu = EU_TEXT_REGEX.test(str);
  const hasUs = US_TEXT_REGEX.test(str);
  const hasRu = RU_TEXT_REGEX.test(str);

  // 1. Explicit KZ indicators in text take top priority when no RU-only conflict
  if (hasKz) return 'KZ';

  // 2. Explicit EU indicators in text (EUR/GBP/European countries/EU languages)
  if (hasEu && !hasRu) return 'EU';

  // 3. Explicit US / North America indicators in text
  if (hasUs && !hasRu && !hasEu) return 'US';

  // 4. Filter out explicit Russian-Ruble / Russia-domestic cross-posts even inside CIS/global groups
  if (hasRu && !hasKz && !hasEu && !hasUs) {
    return 'RU';
  }

  // 5. Known channel lookup
  if (KNOWN_KZ_CHANNELS.has(cleanChannel)) return 'KZ';
  if (KNOWN_EU_CHANNELS.has(cleanChannel)) return 'EU';
  if (KNOWN_US_CHANNELS.has(cleanChannel)) return 'US';

  // 6. Channel name patterns
  if (cleanChannel) {
    if (KZ_CHANNEL_PATTERNS.some((p) => p.test(cleanChannel))) return 'KZ';
    if (EU_CHANNEL_PATTERNS.some((p) => p.test(cleanChannel))) return 'EU';
    if (US_CHANNEL_PATTERNS.some((p) => p.test(cleanChannel))) return 'US';
  }

  // 7. Mixed marker resolution when both foreign & RU keywords appear
  if (hasEu) return 'EU';
  if (hasUs) return 'US';
  if (hasRu) return 'RU';

  // 8. Script / language heuristics
  if (KAZAKH_CHARS_REGEX.test(str)) {
    return 'KZ';
  }

  const latinCount = (str.match(/[a-zA-Z]/g) || []).length;
  const cyrillicCount = (str.match(/[а-яА-ЯёЁәғқңөұүһіӘҒҚҢӨҰҮҺІ]/g) || []).length;

  if (EU_ACCENT_REGEX.test(str) && latinCount > cyrillicCount) {
    return 'EU';
  }

  if (latinCount > 25 && latinCount > cyrillicCount * 2) {
    return 'US';
  }

  // Generic Cyrillic without KZ/EU/US origin defaults to RU so unverified domestic ads are excluded
  return 'RU';
}

export default {
  REGIONS,
  REGION_LABELS,
  REGION_SHORT_LABELS,
  KNOWN_EU_CHANNELS,
  KNOWN_KZ_CHANNELS,
  KNOWN_US_CHANNELS,
  isSupportedRegion,
  detectVacancyRegion,
};
