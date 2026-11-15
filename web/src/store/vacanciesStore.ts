import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Vacancy } from '../types';
import { useLeadsStore } from './leadsStore';
import KEYWORDS from '../shared/keywords.js';
import { parseBudget, BudgetResult } from '../shared/budget.js';
import { matchesVacancy, detectVacancyRisks, buildWordBoundaryRegex } from '../shared/filter.js';

export interface TelegramSource {
  username: string;
  enabled: boolean;
  addedAt: string;
  title?: string;
  type?: 'channel' | 'group';
}

interface VacanciesState {
  sources: TelegramSource[];
  vacancies: Vacancy[];
  includeKeywords: string[];
  excludeKeywords: string[];
  lastRefreshedAt: string | null;
  isLoading: boolean;
  lastError: string | null;
  scrapeOffset: number;
  selectedVacancyForPitch: Vacancy | null;
  hiddenChannels: string[];

  // Actions
  setSelectedVacancyForPitch: (vacancy: Vacancy | null) => void;
  addSource: (rawInput: string) => void;
  removeSource: (username: string) => void;
  toggleSource: (username: string) => void;
  enableAllSources: () => void;
  enableChannelsOnly: () => void;
  enableRecommendedOnly: () => void;
  disableAllSources: () => void;
  syncWithCatalog: () => void;

  setVacancies: (vacancies: Vacancy[]) => void;
  mergeNewVacancies: (incoming: Vacancy[]) => { newCount: number; hotCount: number };
  markSeen: (id: string) => void;
  hideVacancy: (id: string) => void;
  hideChannel: (channel: string) => void;
  unhideChannel: (channel: string) => void;

  addIncludeKeyword: (kw: string) => void;
  removeIncludeKeyword: (kw: string) => void;
  addExcludeKeyword: (kw: string) => void;
  removeExcludeKeyword: (kw: string) => void;

  setLoading: (loading: boolean) => void;
  setLastRefreshedAt: (date: string) => void;
  setLastError: (err: string | null) => void;
  setScrapeOffset: (offset: number) => void;

  clearAllVacancies: () => void;
}

export const DEFAULT_INCLUDE_KEYWORDS: string[] = [];
export const DEFAULT_EXCLUDE_KEYWORDS: string[] = [];

import rawCatalog from '../shared/sources.catalog.json';

interface RawCatalogItem {
  id?: string;
  username?: string;
  title?: string;
  type?: 'channel' | 'group';
  recommended?: boolean;
}

const catalogData = rawCatalog as unknown as RawCatalogItem[];

export const DEFAULT_SOURCES: TelegramSource[] = catalogData.map((c) => ({
  username: (c.username || c.id || '').toLowerCase().replace(/^@/, ''),
  title: c.title,
  type: c.type || 'channel',
  enabled: true,
  addedAt: new Date().toISOString(),
}));

export function computeVacancyRelevance(
  text: string,
  includeKeywords: string[],
  excludeKeywords: string[],
  isWorkerLead = false,
  postedAt?: string
): {
  relevance: number;
  matchedKeywords: string[];
  skills: string[];
  isExcluded: boolean;
  formatTag: 'short' | 'long' | 'both';
  qualityTier: 'great' | 'fair' | 'shady';
  statusBadge?: 'new' | 'hot' | 'shady';
  budget?: BudgetResult | null;
  risks?: string[];
} {
  const lower = text.toLowerCase();

  // Exclude check: user custom exclude keywords matching with word boundaries
  const isExcluded =
    excludeKeywords.length > 0 &&
    excludeKeywords.some((kw) => {
      const clean = kw.trim();
      if (!clean) return false;
      try {
        return buildWordBoundaryRegex(clean).test(text);
      } catch {
        return lower.includes(clean.toLowerCase());
      }
    });

  if (isExcluded) {
    return {
      relevance: 0,
      matchedKeywords: [],
      skills: [],
      isExcluded: true,
      formatTag: 'both',
      qualityTier: 'shady',
      statusBadge: 'shady',
      budget: null,
      risks: ['Текст содержит исключённые стоп-слова'],
    };
  }

  const matchCheck = matchesVacancy(text);
  let matchedKeywords = matchCheck.isMatch ? matchCheck.matched : [];

  if (matchedKeywords.length === 0) {
    if (!isWorkerLead) {
      return {
        relevance: 0,
        matchedKeywords: [],
        skills: [],
        isExcluded: false,
        formatTag: 'both',
        qualityTier: 'fair',
        budget: null,
      };
    }
    matchedKeywords = ['видеомонтаж'];
  }

  // Format detection
  const hasShort = /(reels|shorts|tiktok|рилс|шортс|вертикальн|сторис|capcut)/i.test(lower);
  const hasLong = /(youtube|ютуб|подкаст|горизонтальн|хронометраж|выпуск|фильм|шоу)/i.test(lower);
  const formatTag: 'short' | 'long' | 'both' = hasShort && hasLong ? 'both' : hasShort ? 'short' : 'long';

  // Skills / Software detection
  const skills: string[] = [];
  if (/(premiere|премьер|premiere pro)/i.test(lower)) skills.push('Premiere Pro');
  if (/(davinci|resolve|давинчи)/i.test(lower)) skills.push('DaVinci Resolve');
  if (/(after effects|афтер|ae\b)/i.test(lower)) skills.push('After Effects');
  if (/capcut/i.test(lower)) skills.push('CapCut');
  if (/(photoshop|фотошоп|ps\b)/i.test(lower)) skills.push('Photoshop');
  if (/(звук|sound design|саунд|аудио)/i.test(lower)) skills.push('Sound Design');
  if (/(моушн|motion|анимаци)/i.test(lower)) skills.push('Motion');
  if (/(цветокор|грейдинг|color)/i.test(lower)) skills.push('Color Grading');

  // Quality tier detection
  let qualityTier: 'great' | 'fair' | 'shady' = 'fair';
  const isGreat =
    /(\$\s*1[\s,.]?000|\$\s*1[\s,.]?200|\$\s*1[\s,.]?500|\$\s*2[\s,.]?000|80\s*000|100\s*000|120\s*000|150\s*000|6\s*000\s*aed|международн|долларах)/i.test(
      lower
    );
  const isShady =
    /(бесплатно|за опыт|стажировка|без оплаты|на энтузиазме|до 8\s*000|до 5\s*000|150\s*₽|символическ|тестовое без оплаты)/i.test(
      lower
    );

  const budget = parseBudget(text);
  const riskCheck = detectVacancyRisks(text, budget);

  if (isGreat) {
    qualityTier = 'great';
  } else if (isShady || riskCheck.isRisky) {
    qualityTier = 'shady';
  }

  let score = isWorkerLead ? 60 : 40 + matchedKeywords.length * 8;
  score += Math.min(24, skills.length * 8);

  if (budget) {
    if (budget.min && (budget.min >= 5000 || budget.currency === 'USD' || budget.currency === 'EUR')) {
      score += 20;
    } else {
      score += 12;
    }
  }

  if (qualityTier === 'great') score += 20;
  if (qualityTier === 'shady') score -= 35;

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // Status badge
  let statusBadge: 'new' | 'hot' | 'shady' | undefined = undefined;
  if (qualityTier === 'shady') {
    statusBadge = 'shady';
  } else if (postedAt) {
    const isRecent = Date.now() - new Date(postedAt).getTime() < 20 * 60 * 1000;
    if (isRecent) {
      statusBadge = finalScore >= 70 ? 'hot' : 'new';
    }
  }

  return {
    relevance: finalScore,
    matchedKeywords,
    skills,
    isExcluded: false,
    formatTag,
    qualityTier,
    statusBadge,
    budget,
    risks: riskCheck.reasons,
  };
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const safeLocalStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        console.warn('[LocalStorage] QuotaExceededError, сокращаем кэш вакансий...');
        try {
          const parsed = JSON.parse(value);
          if (parsed?.state?.vacancies?.length > 100) {
            parsed.state.vacancies = parsed.state.vacancies.slice(0, 100);
            localStorage.setItem(name, JSON.stringify(parsed));
          }
        } catch {}
      }
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {}
  },
};

export const useVacanciesStore = create<VacanciesState>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      vacancies: [],
      includeKeywords: DEFAULT_INCLUDE_KEYWORDS,
      excludeKeywords: DEFAULT_EXCLUDE_KEYWORDS,
      lastRefreshedAt: null,
      isLoading: false,
      lastError: null,
      scrapeOffset: 0,
      selectedVacancyForPitch: null,
      hiddenChannels: [],

      setSelectedVacancyForPitch: (vacancy) => set({ selectedVacancyForPitch: vacancy }),

      addSource: (rawInput) => {
        const clean = rawInput
          .trim()
          .replace(/^@/, '')
          .replace(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?/, '')
          .replace(/\/$/, '')
          .toLowerCase();

        if (!clean) return;

        set((state) => {
          if (state.sources.some((s) => s.username === clean)) return state;
          return {
            sources: [
              ...state.sources,
              {
                username: clean,
                enabled: true,
                addedAt: new Date().toISOString(),
              },
            ],
          };
        });
      },

      removeSource: (username) =>
        set((state) => ({
          sources: state.sources.filter((s) => s.username !== username),
        })),

      toggleSource: (username) =>
        set((state) => ({
          sources: state.sources.map((s) =>
            s.username === username ? { ...s, enabled: !s.enabled } : s
          ),
        })),

      enableAllSources: () =>
        set((state) => ({
          sources: state.sources.map((s) => ({ ...s, enabled: true })),
        })),

      enableChannelsOnly: () => {
        const channelUsernames = new Set(
          catalogData
            .filter((c) => c.type === 'channel')
            .map((c) => (c.username || c.id || '').toLowerCase().replace(/^@/, ''))
        );
        set((state) => ({
          sources: state.sources.map((s) => ({
            ...s,
            enabled: channelUsernames.has(s.username.toLowerCase()),
          })),
        }));
      },

      enableRecommendedOnly: () => {
        const recUsernames = new Set(
          catalogData
            .filter((c) => c.recommended)
            .map((c) => (c.username || c.id || '').toLowerCase().replace(/^@/, ''))
        );
        set((state) => ({
          sources: state.sources.map((s) => ({
            ...s,
            enabled: recUsernames.has(s.username.toLowerCase()),
          })),
        }));
      },

      disableAllSources: () =>
        set((state) => ({
          sources: state.sources.map((s) => ({ ...s, enabled: false })),
        })),

      syncWithCatalog: () => {
        const currentSources = get().sources || [];
        const existingMap = new Map(
          currentSources.map((s) => [s.username.toLowerCase(), s.enabled])
        );
        const synced = catalogData.map((c) => {
          const uname = (c.username || c.id || '').toLowerCase().replace(/^@/, '');
          const isEnabled = currentSources.length < 150
            ? true
            : (existingMap.has(uname) ? existingMap.get(uname)! : true);
          return {
            username: uname,
            title: c.title,
            type: c.type || 'channel',
            enabled: isEnabled,
            addedAt: new Date().toISOString(),
          };
        });
        set({ sources: synced });
      },

      setVacancies: (vacancies) =>
        set({
          vacancies: vacancies
            .filter((v) => Date.now() - new Date(v.postedAt).getTime() <= FOURTEEN_DAYS_MS)
            .slice(0, 500),
        }),

      mergeNewVacancies: (incoming) => {
        const current = get().vacancies;
        const currentIds = new Set(current.map((v) => v.id));
        const newOnes: Vacancy[] = [];
        let hotCount = 0;
        const now = Date.now();
        const twentyMinsAgo = now - 20 * 60 * 1000;

        for (const item of incoming) {
          const itemTime = new Date(item.postedAt).getTime();
          // TTL 14 дней
          if (now - itemTime > FOURTEEN_DAYS_MS) continue;

          if (!currentIds.has(item.id)) {
            newOnes.push(item);
            if (itemTime >= twentyMinsAgo) {
              hotCount++;
            }
          }
        }

        if (newOnes.length > 0) {
          const merged = [...newOnes, ...current]
            .filter((v) => now - new Date(v.postedAt).getTime() <= FOURTEEN_DAYS_MS)
            .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
            .slice(0, 500); // Лимит не более 500 в кэше
          set({ vacancies: merged });
        }

        return { newCount: newOnes.length, hotCount };
      },

      markSeen: (id) =>
        set((state) => ({
          vacancies: state.vacancies.map((v) => (v.id === id ? { ...v, seen: true } : v)),
        })),

      hideVacancy: (id) =>
        set((state) => ({
          vacancies: state.vacancies.map((v) => (v.id === id ? { ...v, hidden: true } : v)),
        })),

      hideChannel: (channel) => {
        const clean = channel.toLowerCase().replace(/^@/, '').trim();
        if (!clean) return;
        set((state) => ({
          hiddenChannels: Array.from(new Set([...state.hiddenChannels, clean])),
        }));
      },

      unhideChannel: (channel) => {
        const clean = channel.toLowerCase().replace(/^@/, '').trim();
        set((state) => ({
          hiddenChannels: state.hiddenChannels.filter((c) => c !== clean),
        }));
      },

      addIncludeKeyword: (kw) => {
        const clean = kw.trim();
        if (!clean) return;
        set((state) => ({
          includeKeywords: Array.from(new Set([...state.includeKeywords, clean])),
        }));
      },

      removeIncludeKeyword: (kw) =>
        set((state) => ({
          includeKeywords: state.includeKeywords.filter((k) => k !== kw),
        })),

      addExcludeKeyword: (kw) => {
        const clean = kw.trim();
        if (!clean) return;
        set((state) => ({
          excludeKeywords: Array.from(new Set([...state.excludeKeywords, clean])),
        }));
      },

      removeExcludeKeyword: (kw) =>
        set((state) => ({
          excludeKeywords: state.excludeKeywords.filter((k) => k !== kw),
        })),

      setLoading: (isLoading) => set({ isLoading }),
      setLastRefreshedAt: (lastRefreshedAt) => set({ lastRefreshedAt }),
      setLastError: (lastError) => set({ lastError }),
      setScrapeOffset: (scrapeOffset) => set({ scrapeOffset }),

      clearAllVacancies: () => set({ vacancies: [] }),
    }),
    {
      name: 'leadhunter_vacancies',
      version: 7,
      storage: safeLocalStorage as any,
      migrate: (persistedState: any, version: number) => {
        if (persistedState) {
          // A2: Clean legacy stopPhrases from persisted excludeKeywords
          if (version < 7) {
            const legacyStops = new Set([
              ...(KEYWORDS.hardStopPhrases || []),
              ...(KEYWORDS.softApplicantPhrases || []),
              ...(KEYWORDS.stopPhrases || []),
              'строительный монтаж',
              'ищу работу',
              'резюме',
              'cv',
              'портфолио:',
              'продаю',
              'услуги монтажа',
              'монтаж от меня',
            ].map((s) => s.toLowerCase().trim()));

            if (Array.isArray(persistedState.excludeKeywords)) {
              persistedState.excludeKeywords = persistedState.excludeKeywords.filter(
                (kw: any) => typeof kw === 'string' && !legacyStops.has(kw.toLowerCase().trim())
              );
            } else {
              persistedState.excludeKeywords = [];
            }
          }

          // 2.6 Migrate any old favorites directly to leads
          if (Array.isArray(persistedState.vacancies)) {
            const favorites = persistedState.vacancies.filter((v: any) => v && v.isFavorite);
            if (favorites.length > 0) {
              const currentLeads = useLeadsStore.getState().leads;
              const existingUrls = new Set(currentLeads.map((l) => l.channelUrl));
              for (const fav of favorites) {
                if (fav.url && !existingUrls.has(fav.url)) {
                  useLeadsStore.getState().addLead({
                    name: `@${fav.channel?.replace(/^@/, '') || 'telegram'}`,
                    channelUrl: fav.url,
                    notes: fav.text || '',
                    status: 'new',
                  });
                  existingUrls.add(fav.url);
                }
              }
            }
            persistedState.vacancies = persistedState.vacancies
              .filter((v: any) => v && typeof v === 'object' && !v.id?.startsWith('demo_'))
              .map((v: any) => {
                const { isFavorite: _fav, ...rest } = v;
                return rest;
              })
              .slice(0, 300);
          }
          delete persistedState.savedPresets;
          delete persistedState.filterFavoritesOnly;

          if (version < 5 || !persistedState.sources || persistedState.sources.length < 150) {
            const existingMap = new Map(
              (persistedState.sources || []).map((s: any) => [s.username?.toLowerCase(), s.enabled])
            );
            const isSmallLegacyList = (persistedState.sources || []).length <= 15;
            persistedState.sources = catalogData.map((c) => {
              const uname = (c.username || c.id || '').toLowerCase().replace(/^@/, '');
              const isEnabled = isSmallLegacyList
                ? true
                : (existingMap.has(uname) ? existingMap.get(uname) : true);
              return {
                username: uname,
                title: c.title,
                type: c.type || 'channel',
                enabled: isEnabled,
                addedAt: new Date().toISOString(),
              };
            });
          }
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (Array.isArray(state.vacancies)) {
            const now = Date.now();
            state.vacancies = state.vacancies
              .filter(
                (v) =>
                  !v.id?.startsWith('demo_') &&
                  now - new Date(v.postedAt).getTime() <= FOURTEEN_DAYS_MS
              )
              .slice(0, 300);
          }
          const enabledCount = (state.sources || []).filter((s) => s.enabled).length;
          if (!state.sources || state.sources.length < 150 || enabledCount < 50) {
            setTimeout(() => {
              useVacanciesStore.getState().enableAllSources();
              useVacanciesStore.getState().syncWithCatalog();
            }, 0);
          }
        }
      },
    }
  )
);
