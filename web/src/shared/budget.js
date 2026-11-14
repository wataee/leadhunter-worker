/**
 * Shared budget parser for LeadHunter
 * Parses salary / rate mentions in Russian and English freelance job posts.
 */

/**
 * @typedef {'RUB' | 'USD' | 'EUR' | 'KZT' | 'NEGOTIABLE'} Currency
 * @typedef {{ min: number | null; max: number | null; currency: Currency }} BudgetResult
 */

const CURRENCY_MAP = [
  { regex: /[$]|usd|доллар|дол|бакс|bucks/i, currency: 'USD' },
  { regex: /[€]|eur|евро/i, currency: 'EUR' },
  { regex: /[₸]|kzt|тенге|тг/i, currency: 'KZT' },
  { regex: /[₽]|руб|р\b|rub|росс/i, currency: 'RUB' },
];

const NEGOTIABLE_REGEX = /(?:по\s+договор[её]нности|договорная|договорной|обсуждаем|negotiable|по\s+итогам\s+собеседования)/i;

/**
 * Cleans number string and applies multipliers ('к', 'k', 'тыс', 'млн')
 * @param {string} numStr 
 * @param {string} [multiplierStr] 
 * @returns {number | null}
 */
function parseNumberWithMultiplier(numStr, multiplierStr = '') {
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
 * Detect currency from any string or symbol
 * @param {string} str 
 * @returns {Currency | null}
 */
function detectCurrencyFromSign(str) {
  if (!str) return null;
  for (const { regex, currency } of CURRENCY_MAP) {
    if (regex.test(str)) {
      return currency;
    }
  }
  return null;
}

/**
 * Parse budget from message text
 * @param {string} text 
 * @returns {BudgetResult | null}
 */
export function parseBudget(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Check for negotiable
  if (NEGOTIABLE_REGEX.test(text)) {
    return { min: null, max: null, currency: 'NEGOTIABLE' };
  }

  // Detect general currency in the text
  let detectedCurrency = null;
  for (const { regex, currency } of CURRENCY_MAP) {
    if (regex.test(text)) {
      detectedCurrency = currency;
      break;
    }
  }

  // 2. Pattern: range (e.g. "$1500 - $2000", "50 000 - 80 000 ₽", "5-10 тыс руб", "от 50к до 80к")
  const rangeRegex = /(?:от\s*)?([$€₽₸])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*(?:-|—|–|до)\s*([$€₽₸])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€₸]|руб|rub|usd|eur|kzt|тенге|р\b)?/i;
  const rangeMatch = text.match(rangeRegex);

  if (rangeMatch) {
    const signBefore1 = rangeMatch[1];
    const rawMin = rangeMatch[2];
    let multMin = rangeMatch[3];
    const signBefore2 = rangeMatch[4];
    const rawMax = rangeMatch[5];
    const multMax = rangeMatch[6];
    const signAfter = rangeMatch[7];

    if (!multMin && multMax) {
      multMin = multMax;
    }

    const min = parseNumberWithMultiplier(rawMin, multMin);
    const max = parseNumberWithMultiplier(rawMax, multMax);

    if (min !== null || max !== null) {
      let currency =
        detectCurrencyFromSign(signBefore1) ||
        detectCurrencyFromSign(signBefore2) ||
        detectCurrencyFromSign(signAfter) ||
        detectedCurrency ||
        'RUB';

      if ((min && min > 10000000) || (max && max > 10000000)) return null;

      return { min, max, currency };
    }
  }

  // 3. Pattern: "от X"
  const fromRegex = /(?:от|ставка\s*от|бюджет\s*от|зп\s*от)\s*([$€₽₸])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€₸]|руб|rub|usd|eur|kzt|тенге|р\b)?/i;
  const fromMatch = text.match(fromRegex);
  if (fromMatch) {
    const min = parseNumberWithMultiplier(fromMatch[2], fromMatch[3]);
    if (min !== null && min >= 100 && min <= 10000000) {
      let currency =
        detectCurrencyFromSign(fromMatch[1]) ||
        detectCurrencyFromSign(fromMatch[4]) ||
        detectedCurrency ||
        'RUB';
      return { min, max: null, currency };
    }
  }

  // 4. Pattern: "до X"
  const toRegex = /(?:до|бюджет\s*до|оплата\s*до)\s*([$€₽₸])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€₸]|руб|rub|usd|eur|kzt|тенге|р\b)?/i;
  const toMatch = text.match(toRegex);
  if (toMatch) {
    const max = parseNumberWithMultiplier(toMatch[2], toMatch[3]);
    if (max !== null && max >= 100 && max <= 10000000) {
      let currency =
        detectCurrencyFromSign(toMatch[1]) ||
        detectCurrencyFromSign(toMatch[4]) ||
        detectedCurrency ||
        'RUB';
      return { min: null, max, currency };
    }
  }

  // 5. Pattern: single explicit amount e.g. "5000₽", "100 000 руб", "$500", "2000 usd"
  const singleRegex = /(?:бюджет|оплата|ставка|фикс|цена|стоимость|rate|salary)?\s*[:=~]?\s*([$€₽₸])?\s*(\d[\d\s,.]*)\s*(к|k|тыс|тысяч|млн)?\s*([₽$€₸]|руб|rub|usd|eur|kzt|тенге|р\b)/i;
  const singleMatch = text.match(singleRegex);
  if (singleMatch) {
    const amount = parseNumberWithMultiplier(singleMatch[2], singleMatch[3]);
    if (amount !== null && amount >= 100 && amount <= 10000000) {
      let currency =
        detectCurrencyFromSign(singleMatch[1]) ||
        detectCurrencyFromSign(singleMatch[4]) ||
        detectedCurrency ||
        'RUB';
      return { min: amount, max: amount, currency };
    }
  }

  return null;
}
