/**
 * Speed-to-Lead helpers for instant Telegram alerts:
 * - extracts direct client contact handles
 * - selects the matching .fleur portfolio deep-link
 * - drafts a ready-to-send outreach reply & one-tap t.me deep-link
 */

import { detectVacancyRegion } from './regions.js';
import { detectTextLanguage } from './translate.js';
import { matchPortfolioDeepLink } from './portfolioMatcher.js';

/**
 * Extracts a client's personal Telegram handle from a vacancy post,
 * ignoring bots and the broadcast channel's own handle.
 * @param {string} text
 * @param {string} [channelName]
 * @returns {string | null}
 */
export function extractDirectTelegramHandle(text, channelName = '') {
  if (!text || typeof text !== 'string') return null;
  const selfClean = String(channelName || '').toLowerCase().replace(/^@/, '').trim();

  const matches = [];
  const mentionRegex = /(?:^|[\s(,:])@([a-zA-Z][a-zA-Z0-9_]{3,31})\b/g;
  let m;
  while ((m = mentionRegex.exec(text)) !== null) {
    matches.push(m[1]);
  }

  const tmeRegex = /(?:https?:\/\/)?t\.me\/([a-zA-Z][a-zA-Z0-9_]{3,31})(?:[/?#\s]|$)/gi;
  while ((m = tmeRegex.exec(text)) !== null) {
    const candidate = m[1];
    if (!['s', 'c', 'joinchat', 'share'].includes(candidate.toLowerCase())) {
      matches.push(candidate);
    }
  }

  for (const raw of matches) {
    const lower = raw.toLowerCase();
    if (lower === selfClean) continue;
    if (lower.endsWith('bot')) continue;
    return raw;
  }

  return null;
}

/**
 * Builds a ready-to-send outreach draft and one-tap write link for Telegram notifications.
 * @param {object} params
 */
export function buildReadyTelegramPitch({
  text = '',
  channel = '',
  region,
  basePortfolioUrl = 'https://fleur-editor.netlify.app',
} = {}) {
  const detectedRegion = region || detectVacancyRegion(text, channel);
  const effectiveRegion = detectedRegion === 'RU' ? 'US' : detectedRegion;
  const lang = detectTextLanguage(text);
  const directHandle = extractDirectTelegramHandle(text, channel);

  const portfolio = matchPortfolioDeepLink({
    text,
    channelOrNiche: channel,
    region: effectiveRegion,
    lang,
    basePortfolioUrl,
  });

  const isForeign =
    effectiveRegion === 'EU' ||
    effectiveRegion === 'US' ||
    (lang !== 'ru' && lang !== 'kk');

  const formatLabelEn =
    portfolio.format === 'vertical'
      ? 'short-form Reels/Shorts editing'
      : portfolio.niche === 'finance'
      ? 'YouTube explainer & motion editing'
      : portfolio.niche === 'real_estate'
      ? 'commercial & promo editing'
      : 'YouTube & podcast editing';

  const formatLabelRu =
    portfolio.format === 'vertical'
      ? 'монтаже Reels / Shorts'
      : portfolio.niche === 'finance'
      ? 'монтаже экспертного YouTube и моушн-графики'
      : portfolio.niche === 'real_estate'
      ? 'коммерческом монтаже и промо-роликах'
      : 'динамичном монтаже YouTube и подкастов';

  const greetingName = directHandle ? `@${directHandle}` : isForeign ? 'there' : 'коллега';
  const cleanChannel = channel ? (channel.startsWith('@') ? channel : `@${channel}`) : 'Telegram';

  let pitchText;
  if (isForeign) {
    pitchText = [
      `Hey ${greetingName} — saw your video editor post (${cleanChannel}).`,
      `I focus on retention-driven ${formatLabelEn} in Premiere Pro, After Effects & DaVinci.`,
      `Relevant cases: ${portfolio.url}`,
      `Happy to cut a quick 30-sec sample from your footage today — are you still hiring?`,
    ].join('\n');
  } else {
    pitchText = [
      `Привет! Увидел ваш запрос на монтаж (${cleanChannel}).`,
      `Специализируюсь на ${formatLabelRu} (Premiere Pro / After Effects / DaVinci Resolve).`,
      `Примеры похожих работ: ${portfolio.url}`,
      `Готов бесплатно смонтировать тестовый 30-сек фрагмент из вашего материала — ещё актуально?`,
    ].join('\n');
  }

  const directWriteUrl = directHandle
    ? `https://t.me/${directHandle}?text=${encodeURIComponent(pitchText)}`
    : null;

  return {
    pitchText,
    portfolioUrl: portfolio.url,
    portfolioCategoryLabel: isForeign ? portfolio.labelEn : portfolio.labelRu,
    directHandle,
    directWriteUrl,
    lang,
    region: effectiveRegion,
    formatLabel: isForeign ? formatLabelEn : formatLabelRu,
  };
}
