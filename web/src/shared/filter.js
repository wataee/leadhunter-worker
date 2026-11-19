import { KEYWORDS } from './keywords.js';
import { FILTER_CONFIG } from './filter.config.js';
import { parseBudget } from './budget.js';

export { FILTER_CONFIG };

/**
 * Escapes regex special characters
 * @param {string} str
 * @returns {string}
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a regex with Unicode word boundaries for Cyrillic (with inflection endings) and Latin
 * @param {string} phrase
 * @returns {RegExp}
 */
export function buildWordBoundaryRegex(phrase) {
  let escaped = escapeRegex(phrase.trim());
  // Normalize e/yo in pattern
  escaped = escaped.replace(/[её]/gi, '[её]');

  // Split into words by spaces
  const words = escaped.split(/\\\s+|\s+/);
  const transformedWords = words.map((w) => {
    // If word is very short (like 'тк', 'cv', 'pr', 'ae', 'рф', 'рк'), match exact boundaries
    if (w.length <= 3) {
      return w;
    }
    // If Cyrillic word ends with a vowel or soft sign, match stem with inflection endings
    if (/[аяоеиыуюьәғқңөұүһі]$/i.test(w)) {
      const stem = w.slice(0, -1);
      return `${stem}[а-яёәғқңөұүһі]{1,4}`;
    }
    // If Cyrillic word ends with a consonant, allow case endings
    if (/[бвгджзйклмнпрстфхцчшщ]$/i.test(w)) {
      return `${w}[а-яёәғқңөұүһі]{0,4}`;
    }
    // For English words, allow standard plural/verb forms
    if (/[a-z]$/i.test(w)) {
      return `${w}(?:s|ed|ing|er|ers)?`;
    }
    return w;
  });

  const pattern = transformedWords.join('\\s+');
  return new RegExp(`(?<![\\p{L}\\d])${pattern}(?![\\p{L}\\d])`, 'iu');
}

/**
 * Normalizes text: lowercase, collapses whitespace, strips URLs and handles
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w_]+/g, ' ')
    .replace(/[^\p{L}\d]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple fast 32-bit FNV-1a hash for deterministic 24-hour deduplication
 * @param {string} str
 * @returns {string}
 */
export function computeTextHash(str) {
  const norm = normalizeText(str);
  let hval = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    hval ^= norm.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return (hval >>> 0).toString(16).padStart(8, '0');
}

/**
 * Cleans Telegram chat ID by removing the '-100' supergroup prefix
 * @param {string | number} chatId
 * @returns {string}
 */
export function cleanChatId(chatId) {
  if (!chatId) return '';
  const s = String(chatId).trim();
  return s.replace(/^-100/, '').replace(/^-/, '');
}

/**
 * Builds a stable lead ID
 * @param {string | number} chatId
 * @param {string | number} messageId
 * @returns {string}
 */
export function buildLeadId(chatId, messageId) {
  return `tg_${cleanChatId(chatId)}_${messageId}`;
}

/**
 * Builds standard Telegram post URL
 * @param {{ username?: string | null; id?: string | number; chatId?: string | number } | string} chat
 * @param {string | number} messageId
 * @returns {string}
 */
export function buildPostUrl(chat, messageId) {
  const msgId = String(messageId || '').trim();

  if (typeof chat === 'string') {
    const clean = chat.replace(/^@/, '').trim();
    if (/^\d+$/.test(clean) || clean.startsWith('-')) {
      return `https://t.me/c/${cleanChatId(clean)}/${msgId}`;
    }
    return `https://t.me/${clean}/${msgId}`;
  }

  if (chat && typeof chat === 'object') {
    const username = (chat.username || '').replace(/^@/, '').trim();
    if (username) {
      return `https://t.me/${username}/${msgId}`;
    }
    const cId = chat.id || chat.chatId;
    if (cId) {
      return `https://t.me/c/${cleanChatId(cId)}/${msgId}`;
    }
  }

  return `https://t.me/${msgId}`;
}

// =========================================================================
// ПРЕКОМПИЛЯЦИЯ РЕГУЛЯРНЫХ ВЫРАЖЕНИЙ ДЛЯ ТРЁХУРОВНЕВОГО ФИЛЬТРА
// =========================================================================

function compileRegexList(list) {
  return (list || []).map((phrase) => ({
    phrase,
    regex: buildWordBoundaryRegex(phrase),
  }));
}

// 1. Уровень 1: Жёсткие стопы (Hard Stops)
const HARD_STOP_CATEGORIES = [
  { name: 'fulltime', label: 'fulltime', reason: 'Штат / офис / оклад / 5-2 / ТК / соцпакет', list: compileRegexList(FILTER_CONFIG.hardStops.fulltime) },
  { name: 'seller', label: 'seller', reason: 'Предложение услуг от соискателя/монтажера', list: compileRegexList(FILTER_CONFIG.hardStops.seller) },
  { name: 'course', label: 'course', reason: 'Реклама курсов / обучения / вебинаров', list: compileRegexList(FILTER_CONFIG.hardStops.course) },
  { name: 'otherProfession', label: 'other_profession', reason: 'Смежная профессия (монтаж упомянут вскользь)', list: compileRegexList(FILTER_CONFIG.hardStops.otherProfession) },
  { name: 'constructionMontage', label: 'spam', reason: 'Строительный/бытовой монтаж (окна/кондиционеры)', list: compileRegexList(FILTER_CONFIG.hardStops.constructionMontage) },
];

// Дополнительные жесткие шаблоны регулярных выражений
const EXTRA_HARD_STOP_PATTERNS = [
  {
    regex: /(?:нужен\s+монтажер|ищете\s+монтажера|хочешь\s+стать\s+монтажером|освой\s+профессию)\s*[\?!\.]/iu,
    label: 'course',
    reason: 'Лид-магнит курса с вопросом о поиске монтажера',
  },
  {
    regex: /(?:salary|rate):\s*\$\s*\d{3,5}\s*(?:\/|\s+per\s+)(?:month|mo|year|yr|annual)\b/iu,
    label: 'fulltime',
    reason: 'Фиксированная месячная/годовая зарплата (штат)',
  },
  {
    regex: /(?:видеомонтаж|монтаж|видеомонтажер|монтажер)\s+не\s+требуется/iu,
    label: 'spam',
    reason: 'Псевдо-вакансия: монтаж явно не требуется',
  },
  {
    regex: /(?:^|[\r\n]|\.)\s*(?:обо\s+мне|о\s+себе)\s*:/iu,
    label: 'seller',
    reason: 'Блок резюме соискателя («О себе:» / «Обо мне:»)',
  },
  {
    regex: /(?:оклад|зп|зарплата)\s*(?::|от|до|\s)\s*\d+[\s\d]*\s*(?:руб|тг|тенге|kzt|₽)\s*(?:\/|\s*в\s*)(?:мес|месяц)\b/iu,
    label: 'fulltime',
    reason: 'Месячный оклад (штатная позиция)',
  },
];

// 2. Уровень 2: Маркеры ролей, действий и сигналов найма
const ROLE_ACTION_REGEXES = compileRegexList(FILTER_CONFIG.rolesAndActions);
const HIRING_SIGNAL_REGEXES = compileRegexList(FILTER_CONFIG.hiringSignals);

const EXPLICIT_VACANCY_HEADER =
  /(?:^|[\r\n])\s*(?:#вакансия|#работа|#жұмыс|#job|#hiring|#wanted|#videoeditor|вакансия\s*[:!-]|ищем\s+в\s+команду|работа\s*[:!-]|hiring\s*[:!-]|looking\s+for\s*[:!-]|проектная\s+работа\s*[:!-]|разовый\s+заказ\s*[:!-]|разовый\s+проект\s*[:!-]|жобалық\s+жұмыс\s*[:!-]|заказ\s+на\s*[:!-]|\bзаказ\s*[:!-]|(?:one-time|freelance|project)\s*(?:gig|project|task|work)?\s*[:!-])/iu;

// Индикаторы разовости и сдельной оплаты
const ONE_OFF_REGEX = /(?:разов(?:о|ый|ая|ое)|на\s+проект|проектн(?:ый|ая|ое)|один\s+(?:ролик|клип|выпуск|подкаст|видос|видео)|1\s+(?:ролик|клип|выпуск|видео)|пачк(?:а|у|е)|batch|one[\s-]time|one[\s-]off|single\s+project|flat\s+fee|flat\s+rate|fixed[\s-]price|project[\s-]based|бір\s+реттік|жобалық|на\s+1\s+(?:ролик|видео)|1\s+съемочный\s+день)/iu;
const PER_UNIT_REGEX = /(?:за|per|әр|бір)\s+(?:[\p{L}\d-]+\s+){0,3}(?:ролик|видео|выпуск|рилс|reels|shorts|шортс|штуку|проект|клип|video|reel|short|episode|clip|project)(?![\p{L}\d])/iu;

const GIG_INDICATORS = {
  oneOff: compileRegexList(FILTER_CONFIG.scoringWeights.gigIndicators.oneOffWords),
  perUnit: compileRegexList(FILTER_CONFIG.scoringWeights.gigIndicators.perUnitPricing),
  formats: compileRegexList(FILTER_CONFIG.scoringWeights.gigIndicators.formats),
  tools: compileRegexList(FILTER_CONFIG.scoringWeights.gigIndicators.tools),
  deadlines: compileRegexList(FILTER_CONFIG.scoringWeights.gigIndicators.deadlines),
  briefLinks: compileRegexList(FILTER_CONFIG.scoringWeights.gigIndicators.briefLinks),
  directContacts: compileRegexList(FILTER_CONFIG.scoringWeights.gigIndicators.directContacts),
};

const PAID_TEST_REGEX = /(?:оплачиваемое\s+тестовое|тестовое\s+оплачиваем|тестовый\s+ролик\s+оплачиваем|(?<![\p{L}\d])paid\s+test|(?<![\p{L}\d])paid\s+sample)/iu;
const UNPAID_TEST_REGEX = /(?:бесплатное\s+тестовое|тестовое\s+без\s+оплаты|unpaid\s+test|unpaid\s+test\s+edit|free\s+test)/iu;
const CLIENT_ENTITY_REGEXES = compileRegexList(['медиа агентство', 'агентство', 'продакшн', 'студия', 'онлайн-школа', 'блог', 'экспертный блог', 'канал', 'каналов', 'agency', 'production', 'studio', 'channel']);

/**
 * LeadHunter 3-Level Lead Filter
 * Validates whether incoming text is a genuine freelance / project-based gig order.
 * 
 * Level 1: Hard Stops (fulltime/office/5-2/salary/courses/sellers/construction).
 * Level 2: Weighted 0-100 Scoring with configurable weights table.
 * Level 3: Borderline hook & structured reason breakdown.
 *
 * @param {string} text
 * @param {{ isWorkerLead?: boolean; minScore?: number; budget?: any }} [options]
 * @returns {{ isMatch: boolean; score: number; label: string; reasons: string[]; matched: string[]; reason: string }}
 */
export function matchesVacancy(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return {
      isMatch: false,
      score: 0,
      label: 'empty',
      reasons: ['Пустой текст сообщения'],
      matched: [],
      reason: 'empty_text',
    };
  }

  const minScore = options.minScore ?? FILTER_CONFIG.thresholds.passMinScore;

  // =========================================================================
  // УРОВЕНЬ 1: ЖЁСТКИЕ СТОПЫ (HARD STOPS)
  // =========================================================================

  for (const pattern of EXTRA_HARD_STOP_PATTERNS) {
    if (pattern.regex.test(text)) {
      return {
        isMatch: false,
        score: 0,
        label: pattern.label,
        reasons: [pattern.reason],
        matched: [],
        reason: `hard_stop: ${pattern.reason}`,
      };
    }
  }

  for (const cat of HARD_STOP_CATEGORIES) {
    for (const { phrase, regex } of cat.list) {
      if (regex.test(text)) {
        if (cat.name === 'fulltime') {
          // Если маркер штата отрицается ("no full-time", "не в штат", "без офиса"), это утверждение фриланса
          const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const negationRegex = new RegExp(`(?:no|not|without|без|не|не\\s+в)\\s+(?:[\\p{L}\\d-]+\\s+){0,2}${escapedPhrase}`, 'iu');
          if (negationRegex.test(text)) {
            continue;
          }
        }
        return {
          isMatch: false,
          score: 0,
          label: cat.label,
          reasons: [`${cat.reason} («${phrase}»)`],
          matched: [],
          reason: `hard_stop_${cat.name}: ${phrase}`,
        };
      }
    }
  }

  // =========================================================================
  // УРОВЕНЬ 2: ВЗВЕШЕННЫЙ СКОРИНГ (WEIGHTED SCORING 0-100)
  // =========================================================================

  // 1. Поиск роли или действия видеомонтажа
  const matchedRoles = [];
  for (const { phrase, regex } of ROLE_ACTION_REGEXES) {
    const match = regex.exec(text);
    if (match) {
      matchedRoles.push({ phrase, index: match.index, length: match[0].length });
    }
  }

  if (matchedRoles.length === 0) {
    return {
      isMatch: false,
      score: 0,
      label: 'no_editing_role',
      reasons: ['Не найдены ключевые маркеры видеомонтажа'],
      matched: [],
      reason: 'no_core_role',
    };
  }

  // 2. Поиск намерений найма (сигналы, заголовки, близость)
  const matchedSignals = [];
  for (const { phrase, regex } of HIRING_SIGNAL_REGEXES) {
    const globalRegex = new RegExp(regex.source, 'giu');
    let match;
    while ((match = globalRegex.exec(text)) !== null) {
      matchedSignals.push({ phrase, index: match.index, length: match[0].length });
    }
  }

  const hasExplicitHeader = EXPLICIT_VACANCY_HEADER.test(text);
  let hasProximityMatch = false;
  const matchedPairs = [];

  for (const r of matchedRoles) {
    for (const s of matchedSignals) {
      const distance =
        s.index > r.index
          ? s.index - (r.index + r.length)
          : r.index - (s.index + s.length);

      if (distance <= 60) {
        hasProximityMatch = true;
        matchedPairs.push(`${s.phrase} + ${r.phrase}`);
        break;
      }
    }
    if (matchedPairs.length > 0) break;
  }

  const hasHiringIntent = hasExplicitHeader || hasProximityMatch || (options.isWorkerLead && matchedSignals.length > 0);

  if (!hasHiringIntent && matchedSignals.length === 0) {
    return {
      isMatch: false,
      score: 15,
      label: 'no_hiring_intent',
      reasons: ['Отсутствует сигнал найма / заказа со стороны клиента'],
      matched: [],
      reason: 'no_hiring_intent_within_proximity',
    };
  }

  // 3. Расчёт очков и сбор доказательств (Reasons)
  const weights = FILTER_CONFIG.scoringWeights.points;
  let score = weights.baseHiringIntent; // 35
  const reasons = [];
  const matchedKeywords = matchedPairs.length > 0 ? matchedPairs : matchedRoles.map((r) => r.phrase);

  reasons.push(hasExplicitHeader ? 'Прямой заголовок вакансии' : 'Найдено намерение найма монтажера');
  if (hasExplicitHeader) {
    score += 10;
  }

  // Бонус: Разовый / проектный формат (+25)
  let foundOneOff = false;
  if (ONE_OFF_REGEX.test(text)) {
    foundOneOff = true;
    score += weights.oneOffBonus;
    reasons.push('Разовый / проектный формат заказа');
  } else {
    for (const { phrase, regex } of GIG_INDICATORS.oneOff) {
      if (regex.test(text)) {
        foundOneOff = true;
        score += weights.oneOffBonus;
        reasons.push(`Разовый / проектный формат («${phrase}»)`);
        break;
      }
    }
  }

  // Бонус: Оплата за штуку / ролик (+25)
  let foundPerUnit = false;
  if (PER_UNIT_REGEX.test(text)) {
    foundPerUnit = true;
    score += weights.perUnitBonus;
    reasons.push('Сдельная оплата за единицу (ролик / выпуск / проект)');
  } else {
    for (const { phrase, regex } of GIG_INDICATORS.perUnit) {
      if (regex.test(text)) {
        foundPerUnit = true;
        score += weights.perUnitBonus;
        reasons.push(`Сдельная оплата за единицу («${phrase}»)`);
        break;
      }
    }
  }

  // Бонус: Чёткий видео-формат (+15)
  const matchedFormats = [];
  for (const { phrase, regex } of GIG_INDICATORS.formats) {
    if (regex.test(text)) {
      matchedFormats.push(phrase);
    }
  }
  for (const r of matchedRoles) {
    if (/рилс|reels/i.test(r.phrase) && !matchedFormats.includes('reels')) matchedFormats.push('reels');
    if (/shorts|шортс/i.test(r.phrase) && !matchedFormats.includes('shorts')) matchedFormats.push('shorts');
    if (/podcast|подкаст/i.test(r.phrase) && !matchedFormats.includes('podcast')) matchedFormats.push('podcast');
    if (/youtube|ютуб/i.test(r.phrase) && !matchedFormats.includes('youtube')) matchedFormats.push('youtube');
    if (/tiktok|тикток/i.test(r.phrase) && !matchedFormats.includes('tiktok')) matchedFormats.push('tiktok');
  }
  if (matchedFormats.length > 0) {
    score += weights.formatBonus;
    reasons.push(`Формат: ${matchedFormats.slice(0, 3).join(', ')}`);
  }

  // Бонус: Указан софт / инструменты (+10)
  const matchedTools = [];
  for (const { phrase, regex } of GIG_INDICATORS.tools) {
    if (regex.test(text)) {
      matchedTools.push(phrase);
    }
  }
  if (matchedTools.length > 0) {
    score += weights.toolBonus;
    reasons.push(`Софт: ${matchedTools.slice(0, 2).join(', ')}`);
  }

  // Бонус: Дедлайн / срочность (+10)
  for (const { phrase, regex } of GIG_INDICATORS.deadlines) {
    if (regex.test(text)) {
      score += weights.deadlineBonus;
      reasons.push(`Указан дедлайн («${phrase}»)`);
      break;
    }
  }

  // Бонус: Ссылка на ТЗ / референсы (+10)
  const matchedBriefLinks = [];
  for (const { phrase, regex } of GIG_INDICATORS.briefLinks) {
    if (regex.test(text)) {
      matchedBriefLinks.push(phrase);
    }
  }
  if (matchedBriefLinks.length > 0) {
    score += weights.briefBonus;
    reasons.push(`Есть ссылка на ТЗ или референсы («${matchedBriefLinks[0]}»)`);
  }

  // Бонус: Прямой контакт в ЛС (+10)
  for (const { phrase, regex } of GIG_INDICATORS.directContacts) {
    if (regex.test(text)) {
      score += weights.contactBonus;
      reasons.push('Указан прямой контакт для связи в ЛС');
      break;
    }
  }

  // Бонус: Заказчик / продакшн / агентство (+10)
  let foundEntity = false;
  for (const { phrase, regex } of CLIENT_ENTITY_REGEXES) {
    if (regex.test(text)) {
      foundEntity = true;
      score += 10;
      reasons.push(`Указан заказчик / продакшн («${phrase}»)`);
      break;
    }
  }

  // Бонус: Наличие конкретного бюджета (+15 или +20 если сдельный)
  const budget = options.budget || parseBudget(text);
  if (budget && budget.currency !== 'NEGOTIABLE') {
    if (budget.unit === 'per_video' || foundPerUnit) {
      score += 20;
      reasons.push(`Бюджет с оплатой за ролик (${budget.min || budget.max || ''} ${budget.currency})`);
    } else if (budget.unit !== 'per_month') {
      score += 15;
      reasons.push(`Указан бюджет (${budget.min || budget.max || ''} ${budget.currency})`);
    }
  }

  // Бонус: Оплачиваемое тестовое (+15)
  if (PAID_TEST_REGEX.test(text)) {
    score += weights.paidTestBonus;
    reasons.push('Оплачиваемое тестовое задание');
  }

  // Предупреждение / штраф: Бесплатное тестовое (-10)
  if (UNPAID_TEST_REGEX.test(text)) {
    score -= 10;
    reasons.push('Предупреждение: требование бесплатного теста');
  }

  // Штраф: Размытое объявление без конкретики
  if (!foundOneOff && !foundPerUnit && matchedFormats.length === 0 && matchedTools.length === 0 && matchedBriefLinks.length === 0 && !foundEntity && !budget) {
    score += weights.vaguePenalty;
    reasons.push('Штраф: размытое описание без деталей формата и оплаты');
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const isMatch = finalScore >= minScore;
  const label = isMatch ? 'gig' : 'low_score_gig';

  return {
    isMatch,
    score: finalScore,
    label,
    reasons,
    matched: matchedKeywords,
    reason: reasons[0] || (isMatch ? 'gig_accepted' : 'score_below_threshold'),
  };
}

/**
 * 5.4 Risk Detector: identifies shady vacancies based on explicit warning rules
 * @param {string} text
 * @param {object|null} budget
 * @param {{ isDuplicateAccount?: boolean }} [options]
 * @returns {{ isRisky: boolean, reasons: string[] }}
 */
export function detectVacancyRisks(text, budget = null, options = {}) {
  const reasons = [];
  if (!text || typeof text !== 'string') {
    return { isRisky: false, reasons };
  }

  // 1. "За опыт" / без оплаты (RU + EN)
  if (/(?:за\s+опыт|ради\s+опыта|в\s+портфолио|для\s+кейса|бесплатно|без\s+оплаты|на\s+энтузиазме|for\s+free|unpaid\s+(?:role|work|position|edit)|for\s+exposure|for\s+portfolio\s+only)/iu.test(text)) {
    reasons.push('Работа без оплаты («за опыт / unpaid / for exposure»)');
  }

  // 2. Процент вместо фиксированной оплаты (RU + EN)
  if (/(?:процент\s+от\s+(?:прибыли|дохода|монетизации|продаж)|%?\s*от\s+монетизации|за\s+долю\s+в\s+проекте|доля\s+от\s+прибыли|rev(?:enue)?\s*share|profit\s*share|commission\s+only)/iu.test(text)) {
    reasons.push('Процент от будущей монетизации/прибыли вместо оплаты (rev-share)');
  }

  // 3. Бесплатное тестовое на целый ролик (RU + EN)
  if (/(?:тестов(?:ое|ый)?\s*(?:на\s+полный|полный|целый|целиком|весь)\s*(?:ролик|видео)|бесплатн(?:ое|ый)\s+тестов(?:ое|ый)|тестов(?:ое|ый)\s+без\s+оплаты|unpaid\s+test|free\s+test\s*(?:edit|video|task))/iu.test(text)) {
    reasons.push('Требование сделать бесплатное тестовое задание (unpaid test)');
  }

  // 4. Подозрение на скам (страховой взнос, покупка софта/курса)
  if (/(?:взнос\s+за\s+материалы|страховой\s+депозит|купить\s+обучение|оплатите\s+доступ|предоплата\s+с\s+вашей\s+стороны|application\s+fee|training\s+fee|buy\s+software)/iu.test(text)) {
    reasons.push('Подозрение на скам: требование взноса или покупки');
  }

  // 5. Символический / отсутствующий бюджет
  if (/(?:бюджет(?:а)?\s*(?:нет|минимальн|скромн|чисто\s+символическ)|оплата\s+символическая|very\s+low\s+budget)/iu.test(text)) {
    reasons.push('Отсутствующий или символический бюджет');
  } else if (budget && budget.max !== null && budget.max > 0) {
    if (budget.currency === 'RUB' && budget.max < 500) {
      reasons.push(`Крайне низкая ставка (${budget.max} ₽)`);
    } else if (budget.currency === 'KZT' && budget.max < 5000) {
      reasons.push(`Крайне низкая ставка (${budget.max} ₸)`);
    } else if (budget.currency === 'USD' && budget.unit !== 'per_hour' && budget.max < 15) {
      reasons.push(`Крайне низкая ставка ($${budget.max})`);
    } else if (budget.currency === 'EUR' && budget.unit !== 'per_hour' && budget.max < 15) {
      reasons.push(`Крайне низкая ставка (€${budget.max})`);
    } else if (budget.currency === 'GBP' && budget.unit !== 'per_hour' && budget.max < 12) {
      reasons.push(`Крайне низкая ставка (£${budget.max})`);
    }
  }

  // 6. Одинаковый текст от разных аккаунтов / спам
  if (options.isDuplicateAccount) {
    reasons.push('Одинаковый текст рассылается с разных аккаунтов (спам-сетка)');
  }

  return {
    isRisky: reasons.length > 0,
    reasons,
  };
}
