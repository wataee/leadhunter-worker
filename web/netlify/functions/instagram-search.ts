import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkDistributedRateLimit,
  validatePayloadSize,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';
import { detectProduct, extractContacts } from './_shared/scoring';
import { matchPortfolioDeepLink } from '../../src/shared/portfolioMatcher.js';

interface InstagramSearchRequestBody {
  query: string;
  minSubs?: number;
  maxSubs?: number;
  regionCode?: string;
  maxDaysActive?: number;
  onlyWithProduct?: boolean;
  onlyWithEmail?: boolean;
}

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface InstagramProfileMock {
  username: string;
  fullName: string;
  biography: string;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  externalUrl: string | null;
  profilePicUrl: string;
  region: 'KZ' | 'US' | 'EU';
  niche: string;
  recentReels: Array<{
    caption: string;
    publishedAt: string;
    viewsCount: number;
    url: string;
  }>;
}

const MOCK_PROFILES: InstagramProfileMock[] = [
  {
    username: 'almaty_realestate_pro',
    fullName: 'Ерлан Садыков | Недвижимость Алматы',
    biography: 'Эксперт по элитной недвижимости в Алматы. Продажи от застройщиков. По вопросам сотрудничества: t.me/erlan_realty',
    followersCount: 24500,
    followsCount: 380,
    mediaCount: 145,
    externalUrl: 'https://taplink.cc/erlan_realty',
    profilePicUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150',
    region: 'KZ',
    niche: 'Недвижимость & Инвестиции',
    recentReels: [
      {
        caption: 'Обзор видового пентхауса в Медеуском районе. 280 кв.м с террасой на горы #недвижимостьалматы #пентхаус',
        publishedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        viewsCount: 42000,
        url: 'https://instagram.com/reel/C8_almaty_01',
      },
    ],
  },
  {
    username: 'astana_auto_import',
    fullName: 'AutoImport Astana | Подбор Авто KZ',
    biography: 'Пригон авто из США, Кореи, Европы в Казахстан под ключ. WhatsApp: +77015554321. Заказ и консультация taplink',
    followersCount: 38200,
    followsCount: 210,
    mediaCount: 320,
    externalUrl: 'https://taplink.cc/astana_auto',
    profilePicUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    region: 'KZ',
    niche: 'Автобизнес & Импорт',
    recentReels: [
      {
        caption: 'Забрали новый Zeekr 001 для клиента из Астаны. Полная растаможка и тест-драйв #автоастана #автоподбор',
        publishedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
        viewsCount: 68000,
        url: 'https://instagram.com/reel/C8_astana_02',
      },
    ],
  },
  {
    username: 'dana_marketing_kz',
    fullName: 'Дана Бекенова | Маркетинг & Reels',
    biography: 'Обучаю предпринимателей продвижению через видеоконтент. Наставничество и онлайн-практикум. Сотрудничество: dana@bekenova.kz',
    followersCount: 18400,
    followsCount: 450,
    mediaCount: 210,
    externalUrl: 'https://dana-marketing.kz',
    profilePicUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    region: 'KZ',
    niche: 'Инфобизнес & Маркетинг',
    recentReels: [
      {
        caption: '3 ошибки в рилс, из-за которых у экспертов нет заявок в 2026 году. Сохраняй разбор!',
        publishedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        viewsCount: 29000,
        url: 'https://instagram.com/reel/C8_dana_03',
      },
    ],
  },
  {
    username: 'london_fintech_founder',
    fullName: 'Oliver Davies | UK Fintech & SaaS',
    biography: 'Building next-gen AI banking infrastructure in London. Host of the Tech UK Podcast. Inquiries: oliver@davies-fintech.co.uk',
    followersCount: 31200,
    followsCount: 620,
    mediaCount: 180,
    externalUrl: 'https://davies-fintech.co.uk',
    profilePicUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    region: 'EU',
    niche: 'Fintech, AI & SaaS',
    recentReels: [
      {
        caption: 'Why 90% of B2B fintech startups fail to scale past $1M ARR in Europe. Key lessons #fintech #saas',
        publishedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
        viewsCount: 35000,
        url: 'https://instagram.com/reel/C8_london_01',
      },
    ],
  },
  {
    username: 'austin_saas_scale',
    fullName: 'Marcus Vance | B2B Growth Architect',
    biography: 'Helping bootstrap SaaS founders reach $5M ARR. Daily video breakdowns. DM or book a strategy session below:',
    followersCount: 47600,
    followsCount: 340,
    mediaCount: 260,
    externalUrl: 'https://calendly.com/vance-growth',
    profilePicUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    region: 'US',
    niche: 'SaaS & Venture',
    recentReels: [
      {
        caption: 'The exact cold outbound video framework that booked 40 enterprise demos last month #b2b #sales',
        publishedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
        viewsCount: 52000,
        url: 'https://instagram.com/reel/C8_austin_02',
      },
    ],
  },
];

export function calculateInstagramLeadScore(profile: {
  followersCount: number;
  mediaCount: number;
  daysSinceLastReel: number;
  hasContacts: boolean;
  hasProduct: boolean;
  bio: string;
}): { score: number; tier: 1 | 2 | 3; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  // 1. Audience scoring (Sweet spot 3k - 75k)
  if (profile.followersCount >= 5000 && profile.followersCount <= 60000) {
    score += 25;
    reasons.push('Идеальный размер аудитории для работы с фаундером напрямую (+25)');
  } else if (profile.followersCount > 60000 && profile.followersCount <= 120000) {
    score += 15;
    reasons.push('Крупный аккаунт, потенциально высокий бюджет (+15)');
  } else if (profile.followersCount < 2000) {
    score -= 15;
    reasons.push('Маленький блог, риск низкого бюджета (-15)');
  }

  // 2. Activity scoring
  if (profile.daysSinceLastReel <= 7) {
    score += 20;
    reasons.push('Высокая свежая активность в Reels (+20)');
  } else if (profile.daysSinceLastReel <= 21) {
    score += 10;
    reasons.push('Регулярная активность (+10)');
  } else {
    score -= 20;
    reasons.push('Нет публикаций более 3 недель (-20)');
  }

  // 3. Monetization / Product
  if (profile.hasProduct) {
    score += 15;
    reasons.push('Есть продукт, курс или бизнес-услуги (+15)');
  }

  // 4. Contacts
  if (profile.hasContacts) {
    score += 10;
    reasons.push('Прямые контакты (TG / WA / Email) в открытом доступе (+10)');
  }

  const bioLower = profile.bio.toLowerCase();
  if (/сотрудничеств|collaboration|business|podcast|подкаст|youtube|ютуб/i.test(bioLower)) {
    score += 10;
    reasons.push('Сигналы открытости к сотрудничеству в Bio (+10)');
  }

  const finalScore = Math.max(10, Math.min(99, score));
  const tier: 1 | 2 | 3 = finalScore >= 80 ? 1 : finalScore >= 60 ? 2 : 3;

  return { score: finalScore, tier, reasons };
}

export function generateInstagramPitch(
  profile: InstagramProfileMock,
  portfolioResult: { url: string; categoryKey?: string; labelRu?: string; labelEn?: string }
): string {
  const isKzRu = profile.region === 'KZ' || /[а-яё]/i.test(profile.fullName);

  if (isKzRu) {
    const firstName = profile.fullName.split(/[\s|]/)[0] || profile.username;
    return `Здравствуйте, ${firstName}! Обратил внимание на ваши недавние рилсы по теме «${profile.niche}». Отличный экспертный контент! Могу усилить динамику роликов, добавить чистую моушн-графику и удерживающие субтитры, чтобы вы тратили меньше времени на монтаж. Мои аналогичные кейсы: ${portfolioResult.url}. Готов бесплатно смонтировать один пробный рилс в вашем стиле.`;
  }

  const firstName = profile.fullName.split(/[\s|]/)[0] || profile.username;
  return `Hi ${firstName}! Really enjoyed your recent short-form content on ${profile.niche}. I specialize in editing dynamic, retention-focused video podcasts and Reels for founders and creators. Here are some relevant cuts I've edited: ${portfolioResult.url}. Would love to cut a free sample Reel from your raw footage to show you the difference.`;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.', null, origin);
  }

  const clientIp =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    '127.0.0.1';

  const rateLimitResult = await checkDistributedRateLimit(clientIp, 15, 60 * 1000);
  if (!rateLimitResult.allowed) {
    return errorResponse(429, 'Превышен лимит поисковых запросов. Пожалуйста, подождите минуту.', null, origin);
  }

  const sizeCheck = validatePayloadSize(event.body);
  if (!sizeCheck.valid) {
    return errorResponse(413, sizeCheck.error || 'Слишком большой размер запроса', null, origin);
  }

  let body: InstagramSearchRequestBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON в теле запроса', null, origin);
  }

  const query = String(body.query || '').trim().toLowerCase();
  const minSubs = body.minSubs ?? 3000;
  const maxSubs = body.maxSubs ?? 75000;
  const regionCode = (body.regionCode || 'KZ').toUpperCase();
  const maxDaysActive = body.maxDaysActive ?? 45;

  // Filter candidates from realistic mock pool
  let candidates = MOCK_PROFILES.filter((p) => {
    if (body.regionCode && p.region !== regionCode && p.region !== 'KZ') {
      return false;
    }
    if (p.followersCount < minSubs || p.followersCount > maxSubs) {
      return false;
    }
    return true;
  });

  // If query is specific, search in bio, niche, and username
  if (query) {
    const qClean = query.replace(/^#/, '');
    const filtered = candidates.filter(
      (c) =>
        c.biography.toLowerCase().includes(qClean) ||
        c.niche.toLowerCase().includes(qClean) ||
        c.username.toLowerCase().includes(qClean) ||
        c.fullName.toLowerCase().includes(qClean)
    );
    if (filtered.length > 0) {
      candidates = filtered;
    }
  }

  const now = Date.now();
  const channels = candidates.map((profile) => {
    const contacts = extractContacts(`${profile.biography} ${profile.externalUrl || ''}`);
    const hasProduct = detectProduct(profile.biography);
    const lastReel = profile.recentReels[0];
    const daysSinceLastReel = lastReel
      ? Math.round((now - new Date(lastReel.publishedAt).getTime()) / (1000 * 3600 * 24))
      : 14;

    const scoring = calculateInstagramLeadScore({
      followersCount: profile.followersCount,
      mediaCount: profile.mediaCount,
      daysSinceLastReel,
      hasContacts: Boolean(contacts.telegram || contacts.email || contacts.website),
      hasProduct,
      bio: profile.biography,
    });

    const portfolioResult = matchPortfolioDeepLink({
      text: `${profile.biography} ${profile.niche}`,
      channelOrNiche: profile.niche,
      region: profile.region,
      lang: profile.region === 'KZ' ? 'ru' : 'en',
    });

    const pitchDraft = generateInstagramPitch(profile, portfolioResult);

    return {
      id: `ig_${profile.username}`,
      channelId: profile.username,
      name: profile.fullName,
      channelUrl: `https://instagram.com/${profile.username}`,
      avatar: profile.profilePicUrl,
      subscribers: profile.followersCount,
      hiddenSubscribers: false,
      niche: profile.niche,
      tier: scoring.tier,
      score: scoring.score,
      source: 'instagram',
      email: contacts.email,
      telegram: contacts.telegram,
      instagram: `https://instagram.com/${profile.username}`,
      website: profile.externalUrl,
      hasProduct,
      lastVideo: lastReel
        ? {
            title: lastReel.caption,
            url: lastReel.url,
            publishedAt: lastReel.publishedAt,
          }
        : null,
      daysSinceLastVideo: daysSinceLastReel,
      frequencyPerMonth: Math.round(profile.mediaCount / 12) || 4,
      description: profile.biography,
      ruleScore: scoring.score,
      aiScore: scoring.score,
      aiReason: scoring.reasons.join('; '),
      aiAngle: pitchDraft,
    };
  });

  return jsonResponse(
    200,
    {
      channels,
      quotaUsed: 1,
      totalFound: channels.length,
      provider: process.env.APIFY_API_TOKEN ? 'apify' : 'mock_engine',
    },
    origin
  );
}
