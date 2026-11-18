/* global fetch, AbortSignal */
/**
 * Free bilingual & multilingual neural translation utilities for LeadHunter.
 * Primary server endpoint tries free LLM keys (Gemini / Groq / OpenRouter) first
 * and falls back seamlessly to zero-key public neural MT (Google GTX + MyMemory).
 */

const KAZAKH_CHARS_REGEX = /[әғқңөұүһӘҒҚҢӨҰҮҺ]/;
const GERMAN_HINT_REGEX = /(?:[äöüß]|(?<!\p{L})(?:gesucht|suche|mit|und|für|oder|wir\s+suchen|videoeditor|schnitt|erfahrung)(?!\p{L}))/iu;
const FRENCH_HINT_REGEX = /(?:[àâçèéêëîïôùûü]|(?<!\p{L})(?:recherchons|recherche|monteur|vidéo|pour|avec|nous|freelance\s+france)(?!\p{L}))/iu;
const SPANISH_HINT_REGEX = /(?:[ñ¡¿áíóú]|(?<!\p{L})(?:buscamos|busco|edición|vídeo|para|con\s+experiencia|trabajo)(?!\p{L}))/iu;
const POLISH_HINT_REGEX = /(?:[ąćęłńóśźż]|(?<!\p{L})(?:szukamy|szukam|montażysta|montaż|praca\s+zdalna|wideo)(?!\p{L}))/iu;
const ITALIAN_HINT_REGEX = /(?<!\p{L})(?:cercasi|cerchiamo|montaggio|lavoro|videomaker|per\s+canale)(?!\p{L})/iu;
const KAZAKH_WORD_REGEX = /(?<!\p{L})(?:іздейміз|іздеуде|қажет|керек|жұмыс|бейнемонтажер|теңге|жалақы|тәжірибе)(?!\p{L})/iu;

export const LANG_LABELS = {
  ru: 'Русский',
  en: 'English',
  kk: 'Қазақша',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  pl: 'Polski',
  it: 'Italiano',
  other: 'Foreign',
};

/**
 * Strips URLs, @handles and punctuation so language detection inspects real prose.
 * @param {string} text
 * @returns {string}
 */
function stripNoiseForLangDetect(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@[\w_]+/g, ' ')
    .replace(/[#*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lightweight heuristic language detector.
 * @param {string} text
 * @returns {'ru' | 'en' | 'kk' | 'de' | 'fr' | 'es' | 'pl' | 'it' | 'other'}
 */
export function detectTextLanguage(text) {
  const clean = stripNoiseForLangDetect(text);
  if (!clean) return 'other';

  const cyrillicMatches = clean.match(/[а-яА-ЯёЁәғқңөұүһіӘҒҚҢӨҰҮҺІ]/g) || [];
  const latinMatches = clean.match(/[a-zA-Zäöüßàâçèéêëîïôùûüñąćęłńóśźżáíóú]/gi) || [];

  const cyrCount = cyrillicMatches.length;
  const latCount = latinMatches.length;

  if (cyrCount < 4 && latCount < 4) return 'other';

  if (KAZAKH_CHARS_REGEX.test(clean) || KAZAKH_WORD_REGEX.test(clean)) {
    return 'kk';
  }

  if (cyrCount >= latCount && cyrCount >= 6) {
    return 'ru';
  }

  if (latCount > cyrCount) {
    if (POLISH_HINT_REGEX.test(clean)) return 'pl';
    if (GERMAN_HINT_REGEX.test(clean)) return 'de';
    if (FRENCH_HINT_REGEX.test(clean)) return 'fr';
    if (SPANISH_HINT_REGEX.test(clean)) return 'es';
    if (ITALIAN_HINT_REGEX.test(clean)) return 'it';
    return 'en';
  }

  return 'other';
}

/**
 * Returns true if the text is written predominantly in a non-Russian language.
 * @param {string} text
 * @returns {boolean}
 */
export function needsRussianTranslation(text) {
  const lang = detectTextLanguage(text);
  return lang !== 'ru' && lang !== 'other';
}

/**
 * Splits long text into paragraph-preserving chunks for GET translation APIs.
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitTextChunks(text, maxLen = 1350) {
  const str = String(text || '').trim();
  if (str.length <= maxLen) return [str];

  const chunks = [];
  const lines = str.split('\n');
  let current = '';

  for (const line of lines) {
    if (line.length > maxLen) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

async function translateChunkGoogleGtx(chunk, targetLang, sourceLang = 'auto') {
  const sl = sourceLang === 'other' ? 'auto' : sourceLang || 'auto';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    sl
  )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(chunk)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LeadHunterBot/1.0)',
    },
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    throw new Error(`Google GTX HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data?.[0])) {
    throw new Error('Google GTX unexpected payload');
  }

  const translatedText = data[0]
    .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
    .join('');

  const detected = typeof data[2] === 'string' ? data[2] : sl;
  return { translatedText, detectedSourceLang: detected };
}

async function translateChunkMyMemory(chunk, targetLang, sourceLang = 'auto') {
  let sl = sourceLang;
  if (!sl || sl === 'auto' || sl === 'other') {
    const guessed = detectTextLanguage(chunk);
    sl = guessed === 'other' ? 'en' : guessed;
  }
  if (sl === targetLang) {
    return { translatedText: chunk, detectedSourceLang: sl };
  }

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(
    `${sl}|${targetLang}`
  )}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }

  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (
    data?.responseStatus !== 200 ||
    typeof translated !== 'string' ||
    !translated.trim() ||
    /MYMEMORY WARNING|PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(translated)
  ) {
    throw new Error(`MyMemory error status ${data?.responseStatus || 'unknown'}`);
  }

  return { translatedText: translated, detectedSourceLang: sl };
}

/**
 * Zero-key neural translation (Google GTX primary, MyMemory automatic fallback).
 * @param {string} text
 * @param {'ru' | 'en' | 'kk'} [targetLang]
 * @param {string} [sourceLang]
 * @returns {Promise<{ translatedText: string; provider: string; detectedSourceLang: string }>}
 */
export async function translateFreeNeural(text, targetLang = 'ru', sourceLang = 'auto') {
  const input = String(text || '').trim();
  if (!input) {
    return { translatedText: '', provider: 'none', detectedSourceLang: 'other' };
  }

  const detected = sourceLang === 'auto' ? detectTextLanguage(input) : sourceLang;
  if (detected === targetLang) {
    return { translatedText: input, provider: 'native', detectedSourceLang: detected };
  }

  const chunks = splitTextChunks(input, 1350);
  const translatedChunks = [];
  let usedProvider = 'google-gtx';
  let detectedFromApi = detected;

  for (const chunk of chunks) {
    try {
      const res = await translateChunkGoogleGtx(chunk, targetLang, sourceLang);
      translatedChunks.push(res.translatedText);
      if (res.detectedSourceLang && res.detectedSourceLang !== 'auto') {
        detectedFromApi = res.detectedSourceLang;
      }
    } catch {
      const fallback = await translateChunkMyMemory(chunk, targetLang, detected);
      usedProvider = 'mymemory-free';
      translatedChunks.push(fallback.translatedText);
      detectedFromApi = fallback.detectedSourceLang || detected;
    }
  }

  return {
    translatedText: translatedChunks.join('\n').trim(),
    provider: usedProvider,
    detectedSourceLang: detectedFromApi,
  };
}

export default {
  LANG_LABELS,
  detectTextLanguage,
  needsRussianTranslation,
  splitTextChunks,
  translateFreeNeural,
};
