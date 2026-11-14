export interface ExtractedContacts {
  email: string | null;
  telegram: string | null;
  instagram: string | null;
  website: string | null;
}

const PRODUCT_KEYWORDS = [
  'курс', 'обучение', 'наставничество', 'коучинг', 'консультация',
  'менторство', 'записаться', 'купить', 'программа', 'воронка',
  'школа', 'клуб', 'подписка', 'мастермайнд', 'интенсив',
  'mentorship', 'coaching', 'course', 'mastermind', 'book a call',
  'agency', 'saas', 'consulting', 'community', 'join', 'masterclass',
];

export function detectProduct(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PRODUCT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function extractContacts(text: string): ExtractedContacts {
  if (!text) {
    return { email: null, telegram: null, instagram: null, website: null };
  }

  // Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  // Telegram
  let telegram: string | null = null;
  const tgMatch = text.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{3,})/i);
  if (tgMatch && tgMatch[1]) {
    const raw = tgMatch[1].replace(/^@/, '');
    if (!['joinchat', 'share', 'addstickers'].includes(raw.toLowerCase())) {
      telegram = `@${raw}`;
    }
  }

  // Instagram
  let instagram: string | null = null;
  const igMatch = text.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{3,})/i);
  if (igMatch && igMatch[1]) {
    instagram = igMatch[1].replace(/\/$/, '');
  }

  // Website (taplink, linktr.ee, tilda, getcourse, boosty, custom domain)
  let website: string | null = null;
  const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/gi);
  if (urlMatches) {
    for (const url of urlMatches) {
      const lower = url.toLowerCase();
      // Skip youtube or google links
      if (
        lower.includes('youtube.com') ||
        lower.includes('youtu.be') ||
        lower.includes('google.com') ||
        lower.includes('t.me') ||
        lower.includes('telegram.me') ||
        lower.includes('instagram.com')
      ) {
        continue;
      }
      website = url;
      break;
    }
  }

  return { email, telegram, instagram, website };
}

export interface ScoreParams {
  subscribers: number;
  hiddenSubscribers: boolean;
  hasProduct: boolean;
  hasEmail: boolean;
  hasTelegramOrInstagram: boolean;
  daysSinceLastVideo: number | null;
  frequencyPerMonth: number; // e.g. 2 means 2 videos a month
}

export function calculateLeadScore(params: ScoreParams): { score: number; tier: 1 | 2 | 3 } {
  let score = 0;

  // +30 если есть продукт
  if (params.hasProduct) score += 30;

  // +20 если активность в последние 30 дней
  if (params.daysSinceLastVideo !== null && params.daysSinceLastVideo <= 30) {
    score += 20;
  }

  // +15 если подписчики 5k-30k (+8 если 30k-50k)
  if (!params.hiddenSubscribers) {
    if (params.subscribers >= 5000 && params.subscribers <= 30000) {
      score += 15;
    } else if (params.subscribers > 30000 && params.subscribers <= 50000) {
      score += 8;
    }
  } else {
    // Hidden subscribers: neutral bump
    score += 10;
  }

  // +10 если есть email
  if (params.hasEmail) score += 10;

  // +10 если есть ссылка на Telegram или Instagram
  if (params.hasTelegramOrInstagram) score += 10;

  // +10 если выход видео не реже 1-2 раз в месяц
  if (params.frequencyPerMonth >= 1.5) {
    score += 10;
  }

  // -20 если последнее видео старше 90 дней
  if (params.daysSinceLastVideo !== null && params.daysSinceLastVideo > 90) {
    score -= 20;
  }

  // -15 если подписчиков < 1000
  if (!params.hiddenSubscribers && params.subscribers < 1000) {
    score -= 15;
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier: 1 | 2 | 3 = 3;
  if (score >= 70) {
    tier = 1;
  } else if (score >= 45) {
    tier = 2;
  } else {
    tier = 3;
  }

  return { score, tier };
}
