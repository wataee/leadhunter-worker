import { RawSourceItem, NormalizedSourceResult } from './types';
import { Vacancy } from '../types';
import { matchesVacancy, detectVacancyRisks, computeTextHash } from '../shared/filter.js';
import { parseBudget } from '../shared/budget.js';

export * from './types';
export * from './TelegramSource';
export * from './HabrFreelanceSource';

/**
 * 5.10 Unified Normalizer & Deduplicator for all lead sources
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
    if (!match.isMatch) {
      filteredCount++;
      continue;
    }

    // 3. Deduplication via FNV-1a text hash
    const hash = computeTextHash(text);
    if (seenHashes.has(hash)) {
      duplicateCount++;
      continue;
    }
    seenHashes.add(hash);

    // 4. Budget & Risks detection
    const budget = parseBudget(text);
    const risks = detectVacancyRisks(text, budget);

    const hasShort = /(reels|shorts|tiktok|рилс|шортс|вертикальн)/i.test(lower);
    const hasLong = /(youtube|ютуб|подкаст|выпуск|горизонтальн)/i.test(lower);
    const formatTag: 'short' | 'long' | 'both' = hasShort && hasLong ? 'both' : hasShort ? 'short' : 'long';

    const qualityTier: 'great' | 'fair' | 'shady' = risks.isRisky
      ? 'shady'
      : (budget && budget.max && budget.max >= 10000 ? 'great' : 'fair');

    vacancies.push({
      id: item.id,
      channel: item.channelOrAuthor,
      text: item.text,
      url: item.url,
      postedAt: item.publishedAt,
      views: item.views || '',
      matchedKeywords: match.matched,
      relevance: qualityTier === 'great' ? 85 : (qualityTier === 'shady' ? 35 : 65),
      formatTag,
      qualityTier,
      statusBadge: risks.isRisky ? 'shady' : 'new',
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
