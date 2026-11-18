import { RawSourceItem, NormalizedSourceResult } from './types';
import { Vacancy } from '../types';
import { matchesVacancy, detectVacancyRisks, computeTextHash } from '../shared/filter.js';
import { parseBudget } from '../shared/budget.js';
import { detectVacancyRegion } from '../shared/regions.js';

export * from './types';
export * from './TelegramSource';
export * from './RedditSource';

/**
 * 5.10 Unified Normalizer & Deduplicator for all EU / US / KZ lead sources
 */
export function normalizeAndFilterItems(
  items: RawSourceItem[],
  options: {
    includeKeywords?: string[];
    excludeKeywords?: string[];
  } = {}
): NormalizedSourceResult {
  const seenHashes = new Set<string>();
  const vacancies: Vacancy[] = [];
  let filteredCount = 0;
  let duplicateCount = 0;

  const excludeWords = options.excludeKeywords || [];

  for (const item of items) {
    const text = item.text || '';
    const lower = text.toLowerCase();

    // 1. Exclude check
    const isExcluded = excludeWords.some((w) => lower.includes(w.toLowerCase()));
    if (isExcluded) {
      filteredCount++;
      continue;
    }

    // 2. Core hiring intent match
    const match = matchesVacancy(text);
    const allowPreScreenedReddit =
      item.source === 'reddit' &&
      !match.isMatch &&
      match.reason === 'no_hiring_intent_within_proximity';

    if (!match.isMatch && !allowPreScreenedReddit) {
      filteredCount++;
      continue;
    }

    const matchedTags = allowPreScreenedReddit ? ['[Hiring]', 'Reddit'] : match.matched;

    // 3. Budget & region exclusion (skip RU domestic / RUB posts)
    const budget = parseBudget(text);
    const region = detectVacancyRegion(text, item.channelOrAuthor);
    if (region === 'RU' || budget?.currency === 'RUB') {
      filteredCount++;
      continue;
    }

    // 4. Deduplication via FNV-1a text hash
    const hash = computeTextHash(text);
    if (seenHashes.has(hash)) {
      duplicateCount++;
      continue;
    }
    seenHashes.add(hash);

    // 5. Risks detection
    const risks = detectVacancyRisks(text, budget);

    const hasShort = /(reels|shorts|tiktok|рилс|шортс|вертикальн)/i.test(lower);
    const hasLong = /(youtube|ютуб|подкаст|выпуск|горизонтальн)/i.test(lower);
    const formatTag: 'short' | 'long' | 'both' = hasShort && hasLong ? 'both' : hasShort ? 'short' : 'long';

    const maxAmount = budget?.max ?? budget?.min ?? 0;
    const isGreatBudget = Boolean(
      budget &&
        ((['USD', 'EUR', 'GBP'].includes(budget.currency) && maxAmount >= 150) ||
          (budget.currency === 'KZT' && maxAmount >= 80000))
    );

    const qualityTier: 'great' | 'fair' | 'shady' = risks.isRisky
      ? 'shady'
      : isGreatBudget
      ? 'great'
      : 'fair';

    const sourcePlatform: 'telegram' | 'reddit' | 'upwork' =
      item.source === 'reddit'
        ? 'reddit'
        : item.source === 'upwork'
        ? 'upwork'
        : 'telegram';

    vacancies.push({
      id: item.id,
      channel: item.channelOrAuthor,
      text: item.text,
      url: item.url,
      postedAt: item.publishedAt,
      views: item.views || '',
      matchedKeywords: matchedTags,
      relevance: qualityTier === 'great' ? 85 : qualityTier === 'shady' ? 35 : 65,
      formatTag,
      qualityTier,
      statusBadge: risks.isRisky ? 'shady' : 'new',
      region,
      sourcePlatform,
      budget,
      risks: risks.reasons,
      seen: false,
      hidden: false,
    });
  }

  return {
    vacancies,
    totalRaw: items.length,
    filteredCount,
    duplicateCount,
  };
}
