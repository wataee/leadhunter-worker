export type SourceCategory =
  | 'jobs_video'
  | 'jobs_remote_freelance'
  | 'editors_community'
  | 'clients_entrepreneurs'
  | 'international_en';

export type SourceType = 'channel' | 'group';

export type SourceLanguage = 'ru' | 'en' | 'mixed';

export type SourceRegion = 'EU' | 'US' | 'KZ';

export type SourceStatus = 'ok' | 'stale' | 'dead' | 'no_preview' | 'group' | 'private';

export interface SourceItem {
  id: string; // username without @ (lowercase)
  title: string; // display name
  username: string; // without @ (lowercase)
  url: string; // https://t.me/<username>
  type: SourceType;
  category: SourceCategory;
  language: SourceLanguage;
  region?: SourceRegion;
  description: string; // short summary
  subscribers?: number;
  postsPerWeek?: number;
  lastPostAt?: string; // ISO 8601
  vacancyRate?: number; // 0..1
  qualityScore: number; // 0..100
  status: SourceStatus;
  tags: string[]; // ['youtube', 'reels', 'motion', 'freelance', ...]
  recommended: boolean; // top sources (qualityScore >= 75)
  discoveredFrom: string; // URL of source/catalog/search
  verifiedAt: string; // ISO 8601
}

export interface CatalogValidationError {
  index: number;
  id?: string;
  field: string;
  message: string;
}

export const USERNAME_REGEX = /^[a-z][a-z0-9_]{4,31}$/;

export const CATEGORY_MINIMUMS: Record<SourceCategory, number> = {
  jobs_video: 30,
  jobs_remote_freelance: 50,
  editors_community: 30,
  clients_entrepreneurs: 40,
  international_en: 45,
};

export function validateSourceItem(item: unknown, index = 0): CatalogValidationError[] {
  const errors: CatalogValidationError[] = [];
  if (!item || typeof item !== 'object') {
    return [{ index, field: 'item', message: 'Item must be an object' }];
  }

  const s = item as Record<string, unknown>;
  const id = typeof s.id === 'string' ? s.id : undefined;

  // id & username
  if (typeof s.id !== 'string' || !USERNAME_REGEX.test(s.id)) {
    errors.push({
      index,
      id,
      field: 'id',
      message: `id must match ${USERNAME_REGEX} (lowercase alphanumeric/underscore 5-32 chars)`,
    });
  }
  if (typeof s.username !== 'string' || s.username !== s.id) {
    errors.push({
      index,
      id,
      field: 'username',
      message: 'username must be identical to id and valid lowercase username',
    });
  }

  // title
  if (typeof s.title !== 'string' || s.title.trim().length === 0) {
    errors.push({ index, id, field: 'title', message: 'title is required' });
  }

  // url
  if (typeof s.url !== 'string' || !s.url.startsWith('https://t.me/')) {
    errors.push({ index, id, field: 'url', message: 'url must start with https://t.me/' });
  }

  // type
  if (s.type !== 'channel' && s.type !== 'group') {
    errors.push({ index, id, field: 'type', message: "type must be 'channel' or 'group'" });
  }

  // category
  const validCategories: SourceCategory[] = [
    'jobs_video',
    'jobs_remote_freelance',
    'editors_community',
    'clients_entrepreneurs',
    'international_en',
  ];
  if (!validCategories.includes(s.category as SourceCategory)) {
    errors.push({
      index,
      id,
      field: 'category',
      message: `category must be one of: ${validCategories.join(', ')}`,
    });
  }

  // language
  const validLanguages: SourceLanguage[] = ['ru', 'en', 'mixed'];
  if (!validLanguages.includes(s.language as SourceLanguage)) {
    errors.push({
      index,
      id,
      field: 'language',
      message: `language must be one of: ${validLanguages.join(', ')}`,
    });
  }

  // region ('EU' | 'US' | 'KZ')
  const validRegions: SourceRegion[] = ['EU', 'US', 'KZ'];
  if (s.region !== undefined && !validRegions.includes(s.region as SourceRegion)) {
    errors.push({
      index,
      id,
      field: 'region',
      message: `region must be one of: ${validRegions.join(', ')}`,
    });
  }

  // description
  if (typeof s.description !== 'string' || s.description.trim().length === 0) {
    errors.push({ index, id, field: 'description', message: 'description is required' });
  }

  // qualityScore
  if (
    typeof s.qualityScore !== 'number' ||
    s.qualityScore < 0 ||
    s.qualityScore > 100 ||
    Number.isNaN(s.qualityScore)
  ) {
    errors.push({
      index,
      id,
      field: 'qualityScore',
      message: 'qualityScore must be a number between 0 and 100',
    });
  }

  // status
  const validStatuses: SourceStatus[] = ['ok', 'stale', 'dead', 'no_preview', 'group', 'private'];
  if (!validStatuses.includes(s.status as SourceStatus)) {
    errors.push({
      index,
      id,
      field: 'status',
      message: `status must be one of: ${validStatuses.join(', ')}`,
    });
  }

  // tags
  if (!Array.isArray(s.tags) || s.tags.length === 0) {
    errors.push({ index, id, field: 'tags', message: 'tags must be a non-empty array of strings' });
  }

  // recommended
  if (typeof s.recommended !== 'boolean') {
    errors.push({ index, id, field: 'recommended', message: 'recommended must be a boolean' });
  }

  // discoveredFrom
  if (typeof s.discoveredFrom !== 'string' || s.discoveredFrom.trim().length === 0) {
    errors.push({
      index,
      id,
      field: 'discoveredFrom',
      message: 'discoveredFrom is required (URL of source)',
    });
  }

  // verifiedAt
  if (typeof s.verifiedAt !== 'string' || Number.isNaN(Date.parse(s.verifiedAt))) {
    errors.push({
      index,
      id,
      field: 'verifiedAt',
      message: 'verifiedAt must be a valid ISO 8601 date string',
    });
  }

  return errors;
}

export function validateCatalog(catalog: unknown[]): {
  valid: boolean;
  errors: CatalogValidationError[];
  stats: {
    total: number;
    okCount: number;
    groupCount: number;
    recommendedCount: number;
    categoryCounts: Record<SourceCategory, number>;
  };
} {
  const errors: CatalogValidationError[] = [];
  const seenIds = new Set<string>();

  const categoryCounts: Record<SourceCategory, number> = {
    jobs_video: 0,
    jobs_remote_freelance: 0,
    editors_community: 0,
    clients_entrepreneurs: 0,
    international_en: 0,
  };

  let okCount = 0;
  let groupCount = 0;
  let recommendedCount = 0;

  catalog.forEach((item, index) => {
    const itemErrors = validateSourceItem(item, index);
    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
      return;
    }

    const s = item as SourceItem;
    if (seenIds.has(s.id)) {
      errors.push({
        index,
        id: s.id,
        field: 'id',
        message: `Duplicate source id/username detected: ${s.id}`,
      });
    }
    seenIds.add(s.id);

    if (s.status === 'ok') okCount++;
    if (s.status === 'group') groupCount++;
    if (s.recommended) recommendedCount++;

    if (categoryCounts[s.category] !== undefined) {
      categoryCounts[s.category]++;
    }
  });

  const validCount = okCount + groupCount;
  if (validCount < 200) {
    errors.push({
      index: -1,
      field: 'catalog',
      message: `Catalog must have at least 200 valid sources with status 'ok' or 'group' (currently ${validCount})`,
    });
  }

  if (recommendedCount < 10 || recommendedCount > 20) {
    errors.push({
      index: -1,
      field: 'recommended',
      message: `Recommended sources count must be between 10 and 20 (currently ${recommendedCount})`,
    });
  }

  for (const [cat, min] of Object.entries(CATEGORY_MINIMUMS)) {
    const current = categoryCounts[cat as SourceCategory] || 0;
    if (current < min) {
      errors.push({
        index: -1,
        field: `category.${cat}`,
        message: `Category '${cat}' requires at least ${min} sources, found ${current}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      total: catalog.length,
      okCount,
      groupCount,
      recommendedCount,
      categoryCounts,
    },
  };
}
