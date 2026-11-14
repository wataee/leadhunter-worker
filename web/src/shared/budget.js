/**
 * Shared budget parser for LeadHunter
 * Parses salary / rate mentions in Russian and English freelance job posts.
 */

/**
 * @typedef {'RUB' | 'USD' | 'EUR' | 'KZT' | 'UAH' | 'NEGOTIABLE'} Currency
 * @typedef {'per_video' | 'per_month' | 'per_hour' | 'per_minute' | 'project'} BudgetUnit
 * @typedef {{ min: number | null; max: number | null; currency: Currency; unit?: BudgetUnit }} BudgetResult
 */

const CURRENCY_SYMBOLS = [
  { regex: /[$]|usd|доллар|дол|бакс|bucks/iu, currency: 'USD' },
  { regex: /[€]|eur|евро/iu, currency: 'EUR' },
  { regex: /[₸]|kzt|тенге|тг/iu, currency: 'KZT' },
  { regex: /[₴]|uah|грн|гривн/iu, currency: 'UAH' },
  { regex: /(?:[₽]|руб|rub|росс|(?<![\p{L}\d])р(?![\p{L}\d])|(?<=\d)\s*р(?![а-яёa-z]))/iu, currency: 'RUB' },
];

const NEGOTIABLE_REGEX =
  /(?:по\s+договор[её]нности|договорная|договорной|договоримся|обсуждаем|negotiable|по\s+итогам\s+собеседования|в\s+зависимости\s+от\s+опыта)/i;

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
  const cleaned = numStr.replace(/\s+/g, '').replace(',', '.');
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
  // Если рядом есть множитель (к, тыс) и контекст зарплаты/ставки
  if (hasMultiplier && /(?:ставка|зп|зарплата|оплата|бюджет|гонорар|salary|rate)/i.test(combined)) {
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
  if (/(?:за\s+(?:ролик|видео|шортс|рилс|shorts|reels|выпуск|видеоролик)|\/\s*(?:ролик|видео|рилс|shorts|reels|video)|per\s+(?:video|clip|episode|reel|short))/i.test(text)) {
    return 'per_video';
  }
  if (/(?:в\s+(?:месяц|мес)|\/\s*(?:месяц|мес|month)|month|monthly|оклад|ежемесячно|salary|в\s+мес|per\s+month)/i.test(text)) {
    return 'per_month';
  }
  if (/(?:в\s+час|\/\s*час|почасовая|ставка\s+в\s+час|hour|hourly|per\s+hour)/i.test(text)) {
    return 'per_hour';
  }
  if (/(?:за\s+минуту|\/\s*минута|поминутно|per\s+minute)/i.test(text)) {
    return 'per_minute';
  }
  if (/(?:за\s+проект|на\s+проект|фикс\s+за\s+проект|project|per\s+project)/i.test(text)) {
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

  // 2. Pattern: range with currency adjacent (e.g. "$1500 - $2000", "50 000 - 80 000 ₽", "от 50к до 80к руб", "5-10 тыс руб")
  const rangeRegex =
    /(?:(?:бюджет|оплата|ставка|зп|зарплата|цена|стоимость|rate|salary)\s*[:=~-]?\s*)?(?:от\s*)?([$€₽₸₴])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*(?:-|—|–|до)\s*([$€₽₸₴])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€₸₴]|руб|rub|usd|eur|kzt|uah|тенге|гривн|р(?![а-яёa-z]))?/giu;

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

    // Контекст вокруг совпадения (15 символов)
    const beforeCtx = text.slice(Math.max(0, match.index - 15), match.index);
    const afterCtx = text.slice(match.index + match[0].length, match.index + match[0].length + 15);
    const hasMultiplier = Boolean(multMin || multMax);

    const currency =
      detectAdjacentCurrency(signBefore1, signBefore2, hasMultiplier, match[0]) ||
      detectAdjacentCurrency('', signAfter, hasMultiplier, match[0]) ||
      detectAdjacentCurrency(beforeCtx, afterCtx, hasMultiplier, match[0]);

    // Валюта ОБЯЗАТЕЛЬНО должна быть рядом с числом!
    if (!currency) {
      continue;
    }

    if (!multMin && multMax) {
      multMin = multMax;
    }

    const min = parseNumberWithMultiplier(rawMin, multMin);
    const max = parseNumberWithMultiplier(rawMax, multMax);

    if (min !== null || max !== null) {
      // Исключаем нереалистичные или слишком мелкие числа если это не почасовая
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

  // 3. Pattern: "от X" / "до X" с прилегающей валютой
  const directionalRegex =
    /(?:(?:бюджет|оплата|ставка|зп|зарплата|цена|стоимость|rate|salary)\s*[:=~-]?\s*)?(от|до|ставка\s*от|бюджет\s*от|зп\s*от|бюджет\s*до)\s*([$€₽₸₴])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€₸₴]|руб|rub|usd|eur|kzt|uah|тенге|гривн|\bр\b)?/gi;

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

    if (direction.includes('до')) {
      return { min: null, max: val, currency, ...(unit ? { unit } : {}) };
    } else {
      return { min: val, max: null, currency, ...(unit ? { unit } : {}) };
    }
  }

  // 4. Pattern: одиночная сумма с валютой рядом ("5000 руб", "$500", "150 000 ₽", "1000 грн")
  const singleRegex =
    /(?:(?:бюджет|оплата|ставка|зп|зарплата|цена|стоимость|гонорар|rate|salary|фикс)\s*[:=~-]?\s*)?(?:([$€₽₸₴])\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?|(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€₸₴]|руб|rub|usd|eur|kzt|uah|тенге|грн|гривн|р(?![а-яёa-z])))/giu;

  while ((match = singleRegex.exec(text)) !== null) {
    if (isFalsePositive(text, match.index, match[0].length)) {
      continue;
    }

    let rawNum, mult, currency;
    if (match[1]) {
      // Префиксный знак ($500)
      currency = detectAdjacentCurrency(match[1], '');
      rawNum = match[2];
      mult = match[3];
    } else {
      // Постфиксная валюта (5000 руб)
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
