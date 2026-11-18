/* global URL */
/**
 * Smart Portfolio Deep-Link Matcher for .fleur Video Editing Portfolio
 * Maps vacancy/lead text, niche, format, and language/region to exact filtered portfolio URLs.
 */

export const PORTFOLIO_CATEGORIES = [
  { key: 'auto', labelRu: 'Авто-подбор под заказ', labelEn: 'Auto-match by job' },
  { key: 'vertical', labelRu: 'Reels / Shorts / TikTok (9:16)', labelEn: 'Short-Form Reels / Shorts' },
  { key: 'finance', labelRu: 'AI, Tech, Crypto & SaaS (16:9)', labelEn: 'AI, Tech, Crypto & SaaS' },
  { key: 'personal_brand', labelRu: 'YouTube Podcasts & Personal Brand', labelEn: 'Podcasts & Personal Brand' },
  { key: 'real_estate', labelRu: 'Real Estate, Auto & Commercial', labelEn: 'Real Estate & Commercial' },
  { key: 'all', labelRu: 'Все работы (.fleur)', labelEn: 'Selected Works' },
];

const SAMPLE_BY_CATEGORY = {
  finance: 'https://youtu.be/cZZgi5xn930',
  personal_brand: 'https://youtu.be/2elUAbxD4wA',
  real_estate: 'https://youtu.be/JpYdNQUO9gA',
  vertical: 'https://youtu.be/cZZgi5xn930',
  all: 'https://youtu.be/cZZgi5xn930',
};

const LABELS_BY_KEY = {
  vertical: {
    labelRu: 'Reels / Shorts (9:16)',
    labelEn: 'Reels / Shorts (9:16)',
  },
  finance: {
    labelRu: 'AI, Финансы и Крипто (16:9)',
    labelEn: 'AI, Finance & Crypto',
  },
  personal_brand: {
    labelRu: 'Подкасты и YouTube-каналы',
    labelEn: 'Podcasts & YouTube',
  },
  real_estate: {
    labelRu: 'Недвижимость, Авто и Реклама',
    labelEn: 'Real Estate, Auto & Ads',
  },
  all: {
    labelRu: 'Все кейсы .fleur',
    labelEn: 'Selected Portfolio',
  },
};

export function matchPortfolioDeepLink(options = {}) {
  const {
    text = '',
    channelOrNiche = '',
    region = 'US',
    lang = '',
    basePortfolioUrl = 'https://fleur-editor.netlify.app',
    overrideCategory = 'auto',
  } = options;

  let cleanBase = String(basePortfolioUrl || 'https://fleur-editor.netlify.app').trim();
  if (!/^https?:\/\//i.test(cleanBase)) {
    cleanBase = `https://${cleanBase}`;
  }
  cleanBase = cleanBase.replace(/\/+(?:ru|kz|en)?\/?$/i, '');

  const normalizedLang = String(lang || '').toLowerCase();
  const normalizedRegion = String(region || 'US').toUpperCase();

  let localePath = '/';
  if (normalizedLang === 'kk' || normalizedLang === 'kz') {
    localePath = '/kz/';
  } else if (normalizedLang === 'ru' && normalizedRegion !== 'EU' && normalizedRegion !== 'US') {
    localePath = '/ru/';
  } else if (normalizedRegion === 'KZ' && /[әғқңөұүһ]/i.test(text)) {
    localePath = '/kz/';
  } else if (normalizedRegion === 'KZ' && /[а-яё]/i.test(text) && !/[a-zA-Z]{10,}/.test(text)) {
    localePath = '/ru/';
  }

  let niche = 'all';
  let format = null;

  const combined = `${text || ''} ${channelOrNiche || ''}`;

  if (overrideCategory && overrideCategory !== 'auto') {
    if (overrideCategory === 'vertical') {
      format = 'vertical';
    } else if (['finance', 'personal_brand', 'real_estate', 'all'].includes(overrideCategory)) {
      niche = overrideCategory;
    }
  } else {
    if (
      /(?<![\p{L}\d])(?:reels|shorts|tiktok|vertical|9:16|ugc|clip\p{L}*|рилс\p{L}*|шортс\p{L}*|тикток\p{L}*|вертикал\p{L}*|нарезк\p{L}*)(?![\p{L}\d])/iu.test(
        combined
      )
    ) {
      format = 'vertical';
    }

    if (
      /(?<![\p{L}\d])(?:ai|artificial intelligence|saas|crypto|web3|finance|trading|invest\p{L}*|tech|startup\p{L}*|explainer\p{L}*|infographic\p{L}*|нейросет\p{L}*|ии|крипт\p{L}*|финанс\p{L}*|трейд\p{L}*|инвест\p{L}*|стартап\p{L}*|инфографик\p{L}*)(?![\p{L}\d])/iu.test(
        combined
      )
    ) {
      niche = 'finance';
    } else if (
      /(?<![\p{L}\d])(?:real estate|property|luxury|automotive|car|commercial|promo|agency|ad creative\p{L}*|vsl|недвижимост\p{L}*|риелтор\p{L}*|авто\p{L}*|коммерч\p{L}*|реклам\p{L}*)(?![\p{L}\d])/iu.test(
        combined
      )
    ) {
      niche = 'real_estate';
    } else if (
      /(?<![\p{L}\d])(?:podcast\p{L}*|interview\p{L}*|talking head\p{L}*|multicam|coach\p{L}*|vlog\p{L}*|creator\p{L}*|personal brand|course\p{L}*|youtube|подкаст\p{L}*|интервью|мультикам\p{L}*|блог\p{L}*|эксперт\p{L}*|курс\p{L}*|спикер\p{L}*|ютуб\p{L}*)(?![\p{L}\d])/iu.test(
        combined
      )
    ) {
      niche = 'personal_brand';
    }
  }

  let builtUrl;
  try {
    const urlObj = new URL(localePath, cleanBase);
    if (niche !== 'all') {
      urlObj.searchParams.set('niche', niche);
    }
    if (format === 'vertical') {
      urlObj.searchParams.set('format', 'vertical');
    }
    urlObj.hash = 'work';
    builtUrl = urlObj.toString();
  } catch {
    builtUrl = `${cleanBase}${localePath}#work`;
  }

  const categoryKey = format === 'vertical' && niche === 'all' ? 'vertical' : niche;
  const meta = LABELS_BY_KEY[categoryKey] || LABELS_BY_KEY.all;
  const sampleUrl = SAMPLE_BY_CATEGORY[categoryKey] || SAMPLE_BY_CATEGORY.all;

  return {
    url: builtUrl,
    categoryKey,
    niche,
    format,
    localePath,
    labelRu: format === 'vertical' && niche !== 'all' ? `${meta.labelRu} · 9:16` : meta.labelRu,
    labelEn: format === 'vertical' && niche !== 'all' ? `${meta.labelEn} · 9:16` : meta.labelEn,
    sampleUrl,
  };
}
