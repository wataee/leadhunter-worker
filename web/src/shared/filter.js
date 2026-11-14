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
const STOP_REGEXES = KEYWORDS.stopPhrases.map((phrase) => ({
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

  // 1. Проверка стоп-фраз (соискатели, резюме, строительный монтаж, курсы, спам)
  for (const { phrase, regex } of STOP_REGEXES) {
    if (regex.test(text)) {
      return { isMatch: false, matched: [], reason: `stop_phrase: ${phrase}` };
    }
  }

  // 2. Прямые составные фразы найма (например "ищем видеомонтажера", "looking for video editor")
  for (const { phrase, regex } of HIRING_PHRASE_REGEXES) {
    if (regex.test(text)) {
      return { isMatch: true, matched: [phrase] };
    }
  }

  // 3. Поиск первичных маркеров (роли видеомонтажа)
  const foundRoles = [];
  for (const { role, regex } of CORE_ROLE_REGEXES) {
    const match = regex.exec(text);
    if (match) {
      foundRoles.push({ role, index: match.index, length: match[0].length });
    }
  }

  // Первичный маркер обязателен! Без него это не вакансия монтажера.
  if (foundRoles.length === 0) {
    return { isMatch: false, matched: [], reason: 'no_core_role' };
  }

  // 4. Проверка явного заголовка вакансии в начале поста или строки
  if (EXPLICIT_VACANCY_HEADER.test(text)) {
    return {
      isMatch: true,
      matched: foundRoles.map((r) => r.role),
    };
  }

  // 5. Проверка близости вторичного маркера найма (в пределах 40 символов от первичного)
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
      // Расстояние между границами слов
      const distance =
        s.index > r.index
          ? s.index - (r.index + r.length)
          : r.index - (s.index + s.length);

      if (distance <= 40) {
        return {
          isMatch: true,
          matched: [`${s.signal} + ${r.role}`],
        };
      }
    }
  }

  return {
    isMatch: false,
    matched: [],
    reason: 'no_hiring_intent_within_proximity',
  };
}
