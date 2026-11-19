/**
 * Shared budget parser for LeadHunter
 * Parses salary / rate mentions in English, Kazakh, European, and Russian freelance job posts.
 */

/**
 * @typedef {'RUB' | 'USD' | 'EUR' | 'GBP' | 'KZT' | 'UAH' | 'NEGOTIABLE'} Currency
 * @typedef {'per_video' | 'per_month' | 'per_hour' | 'per_minute' | 'project'} BudgetUnit
 * @typedef {{ min: number | null; max: number | null; currency: Currency; unit?: BudgetUnit }} BudgetResult
 */

const CURRENCY_SYMBOLS = [
  { regex: /[$]|usd|доллар|дол|бакс|bucks/iu, currency: 'USD' },
  { regex: /[€]|eur|евро|euros?/iu, currency: 'EUR' },
  { regex: /[£]|(?<!\p{L})(?:gbp|pounds?|фунт(?:ов|а|ы)?)(?!\p{L})/iu, currency: 'GBP' },
  { regex: /[₸]|(?<!\p{L})(?:kzt|тенге|теңге|тг)(?!\p{L})/iu, currency: 'KZT' },
  { regex: /[₴]|(?<!\p{L})(?:uah|грн|гривн[а-я]*)(?!\p{L})/iu, currency: 'UAH' },
  {
    regex: /(?:[₽]|(?<!\p{L})(?:руб|рубл[ейя]|rub|росс)(?!\p{L})|(?<![\p{L}\d])р(?![\p{L}\d])|(?<=\d)\s*р(?![а-яёa-z]))/iu,
    currency: 'RUB',
  },
];

const NEGOTIABLE_REGEX =
  /(?:по\s+договор[её]нности|договорная|договорной|договоримся|обсуждаем|negotiable|competitive\s+pay|open\s+to\s+discuss|flexible\s+rate|по\s+итогам\s+собеседования|в\s+зависимости\s+от\s+опыта|based\s+on\s+experience)/i;

// Отрицательные контексты (часы работы, графики, даты, опыт, телефон)
const FALSE_POSITIVE_CONTEXTS = [
  /\bс\s+\d{1,2}(?::\d{2})?\s*(?:до|-|—)\s*\d{1,2}(?::\d{2})?\b/i, // с 10 до 19
  /\b\d{1,2}\s*(?:-|—)\s*\d{1,2}\s*(?:часов|часа|ч\b)/i, // 10-18 часов
  /\b(?:график|смена|рабочий день|режим)\s*:?\s*\d+\s*[/\\-]\s*\d+/i, // график 5/2, 2/2
  /\b[12]\d{3}\s*(?:-|—)\s*[12]\d{3}\b/, // даты 2022-2024
  /#\s*\d{3,}/, // номер заказа #12345
  /(?:\+7|8|тел|телефон|phone|tel)[\s(:.-]*\d{3}[\s).-]*\d{3}/i, // телефонные номера
  /\b(?:опыт|стаж)\s*(?:от|до)?\s*\d+\s*(?:лет|года|год|мес)/i, // опыт 3 года
  /\bхронометраж(?:\s*(?:от|до))?\s*\d+\s*(?:-|—)\s*\d+\s*(?:мин|сек)/i, // хронометраж 10-15 мин
];

/**
 * Cleans number string and applies multipliers ('к', 'k', 'тыс', 'млн')
 * @param {string} numStr
 * @param {string} [multiplierStr]
 * @returns {number | null}
 */
export function parseNumberWithMultiplier(numStr, multiplierStr = '') {
  if (!numStr) return null;
  let cleaned = numStr.replace(/\s+/g, '');
  // Treat comma as thousands separator if matching US 1,500 / 12,000 pattern
  if (/^\d{1,3}(?:,\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else {
    cleaned = cleaned.replace(',', '.');
  }
  let num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  const m = (multiplierStr || '').toLowerCase();
  if (m.includes('к') || m.includes('k') || m.includes('тыс')) {
    num *= 1000;
  } else if (m.includes('млн') || m.includes('лям') || m.includes('m')) {
    num *= 1000000;
  }

  return Math.round(num);
}

/**
 * Detects currency strictly adjacent (within 15 chars before or after)
 * @param {string} before 15 chars before
 * @param {string} after 15 chars after
 * @returns {Currency | null}
 */
export function detectAdjacentCurrency(before = '', after = '', hasMultiplier = false, matchedSnippet = '') {
  const combined = `${before} ${matchedSnippet} ${after}`;
  for (const { regex, currency } of CURRENCY_SYMBOLS) {
    if (regex.test(combined)) {
      return currency;
    }
  }
  if (hasMultiplier && /(?:salary|rate|budget)/i.test(combined) && !/[а-яё]/i.test(combined)) {
    return 'USD';
  }
  if (hasMultiplier && /(?:ставка|зп|зарплата|оплата|бюджет|гонорар)/i.test(combined)) {
    return 'RUB';
  }
  return null;
}

/**
 * Detects unit/period of payment (per video, per month, etc.)
 * @param {string} text
 * @returns {BudgetUnit | undefined}
 */
export function detectBudgetUnit(text) {
  if (!text) return undefined;
  if (/(?:за\s+(?:каждый\s+|один\s+|готовый\s+|смонтированный\s+)?(?:ролик|видео|шортс|рилс|shorts|reels|выпуск|видеоролик)|\/\s*(?:ролик|видео|рилс|shorts|reels|video|vid|short|reel)|per\s+(?:video|clip|episode|reel|short|finished\s+episode)|each|әр\s+(?:ролик|видео|бейне)|бір\s+(?:ролик|видео|бейне)\s+үшін|әрқайсыс)/i.test(text)) {
    return 'per_video';
  }
  if (/(?:в\s+(?:месяц|мес)|\/\s*(?:месяц|мес|month|mo\b)|monthly|оклад|ежемесячно|per\s+month|\bmonth\b|\bsalary\b)/i.test(text)) {
    return 'per_month';
  }
  if (/(?:в\s+час|\/\s*(?:час|hr\b|h\b|hour)|почасовая|ставка\s+в\s+час|hourly|per\s+hour)/i.test(text)) {
    return 'per_hour';
  }
  if (/(?:за\s+минуту|\/\s*(?:минута|min\b)|поминутно|per\s+minute|per\s+min\b)/i.test(text)) {
    return 'per_minute';
  }
  if (/(?:за\s+проект|на\s+проект|фикс\s+за\s+проект|per\s+project|\bproject\b)/i.test(text)) {
    return 'project';
  }
  return undefined;
}

/**
 * Checks if match overlaps with false positive patterns
 * @param {string} text
 * @param {number} matchIndex
 * @param {number} matchLength
 * @returns {boolean}
 */
function isFalsePositive(text, matchIndex, matchLength) {
  const windowStart = Math.max(0, matchIndex - 30);
  const windowEnd = Math.min(text.length, matchIndex + matchLength + 30);
  const snippet = text.slice(windowStart, windowEnd);

  for (const regex of FALSE_POSITIVE_CONTEXTS) {
    if (regex.test(snippet)) {
      return true;
    }
  }

  // График 5/2 или 2/2 прямо в числе
  const matchStr = text.slice(matchIndex, matchIndex + matchLength);
  if (/^[1-7]\s*[/\\-]\s*[1-7]$/.test(matchStr.trim())) {
    return true;
  }

  return false;
}

/**
 * Parse budget from message text
 * @param {string} text
 * @returns {BudgetResult | null}
 */
export function parseBudget(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Check negotiable
  if (NEGOTIABLE_REGEX.test(text)) {
    const unit = detectBudgetUnit(text);
    return { min: null, max: null, currency: 'NEGOTIABLE', ...(unit ? { unit } : {}) };
  }

  const unit = detectBudgetUnit(text);

  // 2. Pattern: range with currency adjacent (e.g. "$1500 - $2000", "£500-£800", "150k - 250k тенге")
  const rangeRegex =
    /(?:(?:бюджет|оплата|ставка|зп|зарплата|цена|стоимость|ақысы|төлемі|rate|salary|budget|pay)\s*[:=~-]?\s*)?(?:от|(?<!\p{L})from(?!\p{L})\s*)?([$€£₽₸₴])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*(?:-|—|–|(?<!\p{L})(?:до|to)(?!\p{L}))\s*([$€£₽₸₴])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€£₸₴]|руб|rub|usd|eur|gbp|pounds?|kzt|uah|тенге|теңге|тг|гривн|р(?![а-яёa-z]))?/giu;

  let match;
  while ((match = rangeRegex.exec(text)) !== null) {
    if (isFalsePositive(text, match.index, match[0].length)) {
      continue;
    }

    const signBefore1 = match[1];
    const rawMin = match[2];
    let multMin = match[3];
    const signBefore2 = match[4];
    const rawMax = match[5];
    const multMax = match[6];
    const signAfter = match[7];

    const beforeCtx = text.slice(Math.max(0, match.index - 15), match.index);
    const afterCtx = text.slice(match.index + match[0].length, match.index + match[0].length + 15);
    const hasMultiplier = Boolean(multMin || multMax);

    const currency =
      detectAdjacentCurrency(signBefore1, signBefore2, hasMultiplier, match[0]) ||
      detectAdjacentCurrency('', signAfter, hasMultiplier, match[0]) ||
      detectAdjacentCurrency(beforeCtx, afterCtx, hasMultiplier, match[0]);

    if (!currency) {
      continue;
    }

    if (!multMin && multMax) {
      multMin = multMax;
    }

    const min = parseNumberWithMultiplier(rawMin, multMin);
    const max = parseNumberWithMultiplier(rawMax, multMax);

    if (min !== null || max !== null) {
      if (min !== null && min > 10000000) continue;
      if (max !== null && max > 10000000) continue;
      if (min !== null && max !== null && min > max) continue;

      return {
        min,
        max,
        currency,
        ...(unit ? { unit } : {}),
      };
    }
  }

  // 3. Pattern: "от X" / "до X" / "from X" / "up to X" с прилегающей валютой
  const directionalRegex =
    /(?:(?:бюджет|оплата|ставка|зп|зарплата|цена|стоимость|ақысы|төлемі|rate|salary|budget|pay)\s*[:=~-]?\s*)?(от|до|from|up\s+to|starting\s+at|ставка\s*от|бюджет\s*от|зп\s*от|бюджет\s*до)\s*([$€£₽₸₴])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€£₸₴]|руб|rub|usd|eur|gbp|pounds?|kzt|uah|тенге|теңге|тг|гривн|\bр\b)?/giu;

  while ((match = directionalRegex.exec(text)) !== null) {
    if (isFalsePositive(text, match.index, match[0].length)) {
      continue;
    }

    const direction = match[1].toLowerCase();
    const signBefore = match[2];
    const rawNum = match[3];
    const mult = match[4];
    const signAfter = match[5];

    const beforeCtx = text.slice(Math.max(0, match.index - 15), match.index);
    const afterCtx = text.slice(match.index + match[0].length, match.index + match[0].length + 15);

    const currency =
      detectAdjacentCurrency(signBefore, signAfter, Boolean(mult), match[0]) ||
      detectAdjacentCurrency(beforeCtx, afterCtx, Boolean(mult), match[0]);

    if (!currency) continue;

    const val = parseNumberWithMultiplier(rawNum, mult);
    if (val === null || val < 10 || val > 10000000) continue;

    if (direction.includes('до') || direction.includes('up to')) {
      return { min: null, max: val, currency, ...(unit ? { unit } : {}) };
    } else {
      return { min: val, max: null, currency, ...(unit ? { unit } : {}) };
    }
  }

  // 4. Pattern: одиночная сумма с валютой рядом ("$500", "£300", "400€", "35000 kzt")
  const singleRegex =
    /(?:(?:бюджет|оплата|ставка|зп|зарплата|цена|стоимость|гонорар|ақысы|төлемі|құны|rate|salary|budget|pay|фикс)\s*[:=~-]?\s*)?(?:([$€£₽₸₴])\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?|(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€£₸₴]|руб|rub|usd|eur|gbp|pounds?|kzt|uah|тенге|теңге|тг|грн|гривн|р(?![а-яёa-z])))/giu;

  while ((match = singleRegex.exec(text)) !== null) {
    if (isFalsePositive(text, match.index, match[0].length)) {
      continue;
    }

    let rawNum, mult, currency;
    if (match[1]) {
      currency = detectAdjacentCurrency(match[1], '');
      rawNum = match[2];
      mult = match[3];
    } else {
      rawNum = match[4];
      mult = match[5];
      currency = detectAdjacentCurrency('', match[6]);
    }

    if (!currency) continue;

    const amount = parseNumberWithMultiplier(rawNum, mult);
    if (amount === null || amount < 10 || amount > 10000000) continue;

    return { min: amount, max: amount, currency, ...(unit ? { unit } : {}) };
  }

  return null;
}
