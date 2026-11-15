import { KEYWORDS } from './keywords.js';

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
    // If the word ends with a Cyrillic letter, allow Russian case endings (0 to 4 letters)
    if (/[а-яё]$/i.test(w)) {
      return `${w}[а-яё]{0,4}`;
    }
    // For English words, allow standard plural/verb forms
    if (/[a-z]$/i.test(w)) {
      return `${w}(?:s|ed|ing)?`;
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
 * Public: https://t.me/<username>/<id>
 * Private supergroup: https://t.me/c/<cleanChatId>/<id>
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

// Pre-compiled regex caches for performance
const HARD_STOP_REGEXES = (KEYWORDS.hardStopPhrases || KEYWORDS.stopPhrases).map((phrase) => ({
  phrase,
  regex: buildWordBoundaryRegex(phrase),
}));

const SOFT_APPLICANT_REGEXES = (KEYWORDS.softApplicantPhrases || []).map((phrase) => ({
  phrase,
  regex: buildWordBoundaryRegex(phrase),
}));

const CORE_ROLE_REGEXES = KEYWORDS.coreRoles.map((role) => ({
  role,
  regex: buildWordBoundaryRegex(role),
}));

const HIRING_PHRASE_REGEXES = KEYWORDS.hiringPhrases.map((phrase) => ({
  phrase,
  regex: buildWordBoundaryRegex(phrase),
}));

const HIRING_SIGNAL_REGEXES = KEYWORDS.hiringSignals.map((signal) => ({
  signal,
  regex: buildWordBoundaryRegex(signal),
}));

const EXPLICIT_VACANCY_HEADER =
  /(?:^|[\r\n])\s*(?:#вакансия|#работа|#job|#hiring|вакансия\s*[:!-]|ищем\s+в\s+команду|работа\s*[:!-])/i;

/**
 * Filters and validates if text is a genuine video editor job lead
 * @param {string} text
 * @returns {{ isMatch: boolean; matched: string[]; reason?: string }}
 */
export function matchesVacancy(text) {
  if (!text || typeof text !== 'string') {
    return { isMatch: false, matched: [], reason: 'empty_text' };
  }

  // 1. Уровень 1: HARD_STOP — безусловный отказ (строительный монтаж, продажа курсов, "я монтажер", "ищу работу")
  for (const { phrase, regex } of HARD_STOP_REGEXES) {
    if (regex.test(text)) {
      return { isMatch: false, matched: [], reason: `hard_stop_phrase: ${phrase}` };
    }
  }

  // 2. Определение наличия сигнала найма (hiringPhrases / EXPLICIT_VACANCY_HEADER / coreRole + proximity hiringSignal)
  let hasHiringIntent = false;
  const matchedHiringPhrases = [];
  for (const { phrase, regex } of HIRING_PHRASE_REGEXES) {
    if (regex.test(text)) {
      hasHiringIntent = true;
      matchedHiringPhrases.push(phrase);
    }
  }

  const hasExplicitHeader = EXPLICIT_VACANCY_HEADER.test(text);
  if (hasExplicitHeader) {
    hasHiringIntent = true;
  }

  // Поиск первичных маркеров (роли видеомонтажа)
  const foundRoles = [];
  for (const { role, regex } of CORE_ROLE_REGEXES) {
    const match = regex.exec(text);
    if (match) {
      foundRoles.push({ role, index: match.index, length: match[0].length });
    }
  }

  const matchedRoleSignals = [];
  if (foundRoles.length > 0) {
    const foundSignals = [];
    for (const { signal, regex } of HIRING_SIGNAL_REGEXES) {
      let match;
      const globalRegex = new RegExp(regex.source, 'giu');
      while ((match = globalRegex.exec(text)) !== null) {
        foundSignals.push({ signal, index: match.index, length: match[0].length });
      }
    }

    for (const r of foundRoles) {
      for (const s of foundSignals) {
        const distance =
          s.index > r.index
            ? s.index - (r.index + r.length)
            : r.index - (s.index + s.length);

        if (distance <= 40) {
          hasHiringIntent = true;
          matchedRoleSignals.push(`${s.signal} + ${r.role}`);
          break;
        }
      }
      if (matchedRoleSignals.length > 0) break;
    }
  }

  // 3. Уровень 2: SOFT-маркеры соискателя (резюме, портфолио, cv, обо мне)
  // Блокируют ТОЛЬКО если в посте НЕТ сигнала найма. Если сигнал найма есть — пост пропускается.
  if (!hasHiringIntent) {
    for (const { phrase, regex } of SOFT_APPLICANT_REGEXES) {
      if (regex.test(text)) {
        return { isMatch: false, matched: [], reason: `soft_stop_phrase: ${phrase}` };
      }
    }
  }

  // Первичный маркер обязателен! Без него это не вакансия монтажера.
  if (foundRoles.length === 0) {
    return { isMatch: false, matched: [], reason: 'no_core_role' };
  }

  if (matchedHiringPhrases.length > 0) {
    return { isMatch: true, matched: matchedHiringPhrases };
  }

  if (hasExplicitHeader) {
    return {
      isMatch: true,
      matched: foundRoles.map((r) => r.role),
    };
  }

  if (matchedRoleSignals.length > 0) {
    return {
      isMatch: true,
      matched: matchedRoleSignals,
    };
  }

  return {
    isMatch: false,
    matched: [],
    reason: 'no_hiring_intent_within_proximity',
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

  // 1. "За опыт" / без оплаты
  if (/(?:за\s+опыт|ради\s+опыта|в\s+портфолио|для\s+кейса|бесплатно|без\s+оплаты|на\s+энтузиазме)/iu.test(text)) {
    reasons.push('Работа без оплаты («за опыт / для кейса / бесплатно»)');
  }

  // 2. Процент вместо фиксированной оплаты
  if (/(?:процент\s+от\s+(?:прибыли|дохода|монетизации|продаж)|%?\s*от\s+монетизации|за\s+долю\s+в\s+проекте|доля\s+от\s+прибыли)/iu.test(text)) {
    reasons.push('Процент от будущей монетизации/прибыли вместо оплаты');
  }

  // 3. Бесплатное тестовое на целый ролик
  if (/(?:тестов(?:ое|ый)?\s*(?:на\s+полный|полный|целый|целиком|весь)\s*(?:ролик|видео)|бесплатн(?:ое|ый)\s+тестов(?:ое|ый)|тестов(?:ое|ый)\s+без\s+оплаты)/iu.test(text)) {
    reasons.push('Требование сделать бесплатное тестовое задание на весь ролик');
  }

  // 4. Подозрение на скам (страховой взнос, покупка софта/курса)
  if (/(?:взнос\s+за\s+материалы|страховой\s+депозит|купить\s+обучение|оплатите\s+доступ|предоплата\s+с\s+вашей\s+стороны)/iu.test(text)) {
    reasons.push('Подозрение на скам: требование взноса или покупки');
  }

  // 5. Символический / отсутствующий бюджет
  if (/(?:бюджет(?:а)?\s*(?:нет|минимальн|скромн|чисто\s+символическ)|оплата\s+символическая)/iu.test(text)) {
    reasons.push('Отсутствующий или символический бюджет');
  } else if (budget && budget.max !== null && budget.max > 0 && budget.max < 500 && budget.currency === 'RUB') {
    reasons.push(`Крайне низкая ставка (${budget.max} ₽)`);
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
