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

  // If chat is a string (username or chatId)
  if (typeof chat === 'string') {
    const clean = chat.replace(/^@/, '').trim();
    if (/^\d+$/.test(clean) || clean.startsWith('-')) {
      return `https://t.me/c/${cleanChatId(clean)}/${msgId}`;
    }
    return `https://t.me/${clean}/${msgId}`;
  }

  // If chat is an object
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

const SECONDARY_TERM_REGEXES = KEYWORDS.secondaryTerms.map((term) => ({
  term,
  regex: buildWordBoundaryRegex(term),
}));

const HIRING_SIGNAL_REGEXES = KEYWORDS.hiringSignals.map((signal) => ({
  signal,
  regex: buildWordBoundaryRegex(signal),
}));

/**
 * Filters and validates if text is a genuine video editor job lead
 * @param {string} text 
 * @returns {{ isMatch: boolean; matched: string[]; reason?: string }}
 */
export function matchesVacancy(text) {
  if (!text || typeof text !== 'string') {
    return { isMatch: false, matched: [], reason: 'empty_text' };
  }

  // 1. Check stop-phrases (resumes, freelancers, courses, spam)
  for (const { phrase, regex } of STOP_REGEXES) {
    if (regex.test(text)) {
      return { isMatch: false, matched: [], reason: `stop_phrase: ${phrase}` };
    }
  }

  const matched = [];

  // 2. Check hiring phrases
  for (const { phrase, regex } of HIRING_PHRASE_REGEXES) {
    if (regex.test(text)) {
      matched.push(phrase);
    }
  }

  // 3. Check core roles
  for (const { role, regex } of CORE_ROLE_REGEXES) {
    if (regex.test(text)) {
      matched.push(role);
    }
  }

  // If we matched any explicit hiring phrase OR core role
  if (matched.length > 0) {
    return { isMatch: true, matched: Array.from(new Set(matched)) };
  }

  // 4. Check combination: secondary term (reels, premiere, etc.) + hiring signal
  let matchedSecondary = null;
  for (const { term, regex } of SECONDARY_TERM_REGEXES) {
    if (regex.test(text)) {
      matchedSecondary = term;
      break;
    }
  }

  if (matchedSecondary) {
    let matchedSignal = null;
    for (const { signal, regex } of HIRING_SIGNAL_REGEXES) {
      if (regex.test(text)) {
        matchedSignal = signal;
        break;
      }
    }

    if (matchedSignal) {
      return {
        isMatch: true,
        matched: [`${matchedSecondary} + ${matchedSignal}`],
      };
    }
  }

  return { isMatch: false, matched: [], reason: 'no_keywords' };
}
