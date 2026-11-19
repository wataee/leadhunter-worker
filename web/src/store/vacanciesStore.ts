import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Vacancy } from '../types';
import { useLeadsStore } from './leadsStore';
import KEYWORDS from '../shared/keywords.js';
import { parseBudget, BudgetResult } from '../shared/budget.js';
import { matchesVacancy, detectVacancyRisks, buildWordBoundaryRegex } from '../shared/filter.js';
import { detectVacancyRegion, RegionCode } from '../shared/regions.js';
import { syncDisabledSourcesToApi } from '../lib/api';
import rawCatalog from '../shared/sources.catalog.json';

function notifyDisabledSync(sources: TelegramSource[]) {
  if (typeof window === 'undefined') return;
  const disabled = sources.filter((s) => !s.enabled).map((s) => s.username);
  syncDisabledSourcesToApi(disabled).catch(() => {});
}

export interface TelegramSource {
  username: string;
  enabled: boolean;
  addedAt: string;
  title?: string;
  type?: 'channel' | 'group';
  region?: RegionCode | 'RU';
  recommended?: boolean;
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
  enableRegionsOnly: (regions: RegionCode[]) => void;
  disableAllSources: () => void;
  syncWithCatalog: () => void;

  setVacancies: (vacancies: Vacancy[]) => void;
  mergeNewVacancies: (incoming: Vacancy[]) => { newCount: number; hotCount: number };
  markSeen: (id: string) => void;
  markUnseen: (id: string) => void;
  markAllSeen: () => void;
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

interface RawCatalogItem {
  id?: string;
  username?: string;
  title?: string;
  type?: 'channel' | 'group';
  region?: RegionCode | 'RU';
  recommended?: boolean;
}

const catalogData = (rawCatalog as unknown as RawCatalogItem[]).filter(
  (c) => c.region !== 'RU'
);

export const DEFAULT_SOURCES: TelegramSource[] = catalogData.map((c) => ({
  username: (c.username || c.id || '').toLowerCase().replace(/^@/, ''),
  title: c.title,
  type: c.type || 'channel',
  region: (c.region as RegionCode) || 'US',
  enabled: true,
  addedAt: new Date().toISOString(),
}));

export function computeVacancyRelevance(
  text: string,
  includeKeywords: string[],
  excludeKeywords: string[],
  isWorkerLead = false,
  postedAt?: string,
  channel?: string
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
  region: RegionCode | 'RU';
} {
  const lower = text.toLowerCase();
  const budget = parseBudget(text);
  const detectedRegion = detectVacancyRegion(text, channel);

  // Exclude check: user custom exclude keywords
  const isCustomExcluded =
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

  if (isCustomExcluded) {
    return {
      relevance: 0,
      matchedKeywords: [],
      skills: [],
      isExcluded: true,
      formatTag: 'both',
      qualityTier: 'shady',
      statusBadge: 'shady',
      budget: null,
      region: detectedRegion,
      risks: ['Текст содержит исключённые стоп-слова'],
    };
  }

  // Exclude Russian-domestic / Ruble market posts
  if (detectedRegion === 'RU' || budget?.currency === 'RUB') {
    return {
      relevance: 0,
      matchedKeywords: [],
      skills: [],
      isExcluded: true,
      formatTag: 'both',
      qualityTier: 'fair',
      budget,
      region: 'RU',
      risks: ['Исключён российский рынок / рубли'],
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
        region: detectedRegion,
      };
    }
    matchedKeywords = ['video editor'];
  }

  // Format detection
  const hasShort = /(reels|shorts|tiktok|short[- ]form|рилс|шортс|вертикальн|сторис|capcut)/i.test(lower);
  const hasLong = /(youtube|ютуб|подкаст|podcast|documentary|talking\s+head|long[- ]form|горизонтальн|выпуск|фильм|шоу)/i.test(lower);
  const formatTag: 'short' | 'long' | 'both' = hasShort && hasLong ? 'both' : hasShort ? 'short' : 'long';

  // Skills / Software detection
  const skills: string[] = [];
  if (/(premiere|премьер|premiere pro)/i.test(lower)) skills.push('Premiere Pro');
  if (/(davinci|resolve|давинчи)/i.test(lower)) skills.push('DaVinci Resolve');
  if (/(after effects|афтер|\bae\b)/i.test(lower)) skills.push('After Effects');
  if (/capcut/i.test(lower)) skills.push('CapCut');
  if (/(photoshop|фотошоп|\bps\b)/i.test(lower)) skills.push('Photoshop');
  if (/(звук|sound design|саунд|audio\s*mix|аудио)/i.test(lower)) skills.push('Sound Design');
  if (/(моушн|motion|анимаци)/i.test(lower)) skills.push('Motion');
  if (/(цветокор|грейдинг|color)/i.test(lower)) skills.push('Color Grading');

  // Quality tier detection (tuned for EU/US/KZ currencies)
  const riskCheck = detectVacancyRisks(text, budget);
  const maxVal = budget?.max ?? budget?.min ?? 0;
  const isGreatCurrency =
    Boolean(
      budget &&
        ((['USD', 'EUR', 'GBP'].includes(budget.currency) && maxVal >= 400) ||
          (budget.currency === 'KZT' && maxVal >= 200000))
    ) ||
    /(\$\s*[5-9]\d{2}|\$\s*\d[\s,.]?\d{3}|€\s*[5-9]\d{2}|£\s*[4-9]\d{2}|\b[2-9]\d{2}[\s,.]?000\s*(?:₸|тенге|kzt))/i.test(
      lower
    );

  const isShadyText =
    /(бесплатно|за опыт|без оплаты|на энтузиазме|for\s+free|unpaid|for\s+exposure|rev\s*share)/i.test(
      lower
    );

  let qualityTier: 'great' | 'fair' | 'shady' = 'fair';
  if (riskCheck.isRisky || isShadyText) {
    qualityTier = 'shady';
  } else if (isGreatCurrency) {
    qualityTier = 'great';
  }

  // Синхронизированный скоринг на основе единого фильтра
  let score = matchCheck.score || (isWorkerLead ? 60 : 40);
  if (includeKeywords.length > 0) {
    const hasCustomInclude = includeKeywords.some((kw) => {
      const clean = kw.trim();
      if (!clean) return false;
      try {
        return buildWordBoundaryRegex(clean).test(text);
      } catch {
        return lower.includes(clean.toLowerCase());
      }
    });
    if (hasCustomInclude) score += 10;
  }

  if (qualityTier === 'great') score += 15;
  if (qualityTier === 'shady') score -= 30;

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

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
    region: detectedRegion,
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

function isRuVacancy(v: any): boolean {
  if (!v) return true;
  if (v.region === 'RU' || v.budget?.currency === 'RUB') return true;
  if (!v.region && v.text) {
    return detectVacancyRegion(v.text, v.channel) === 'RU';
  }
  return false;
}

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
                region: 'US',
                addedAt: new Date().toISOString(),
              },
            ],
          };
        });
      },

      removeSource: (username) =>
        set((state) => {
          const nextSources = state.sources.filter((s) => s.username !== username);
          notifyDisabledSync(nextSources);
          return { sources: nextSources };
        }),

      toggleSource: (username) =>
        set((state) => {
          const nextSources = state.sources.map((s) =>
            s.username === username ? { ...s, enabled: !s.enabled } : s
          );
          notifyDisabledSync(nextSources);
          return { sources: nextSources };
        }),

      enableAllSources: () =>
        set((state) => {
          const nextSources = state.sources.map((s) => ({ ...s, enabled: true }));
          notifyDisabledSync(nextSources);
          return { sources: nextSources };
        }),

      enableChannelsOnly: () => {
        const channelUsernames = new Set(
          catalogData
            .filter((c) => c.type === 'channel')
            .map((c) => (c.username || c.id || '').toLowerCase().replace(/^@/, ''))
        );
        set((state) => {
          const nextSources = state.sources.map((s) => ({
            ...s,
            enabled: channelUsernames.has(s.username.toLowerCase()),
          }));
          notifyDisabledSync(nextSources);
          return { sources: nextSources };
        });
      },

      enableRecommendedOnly: () => {
        const recUsernames = new Set(
          catalogData
            .filter((c) => c.recommended)
            .map((c) => (c.username || c.id || '').toLowerCase().replace(/^@/, ''))
        );
        set((state) => {
          const nextSources = state.sources.map((s) => ({
            ...s,
            enabled: recUsernames.has(s.username.toLowerCase()),
          }));
          notifyDisabledSync(nextSources);
          return { sources: nextSources };
        });
      },

      enableRegionsOnly: (regions) => {
        const allowed = new Set(regions);
        const targetUsernames = new Set(
          catalogData
            .filter((c) => c.region && allowed.has(c.region as RegionCode))
            .map((c) => (c.username || c.id || '').toLowerCase().replace(/^@/, ''))
        );
        set((state) => {
          const nextSources = state.sources.map((s) => ({
            ...s,
            enabled: targetUsernames.has(s.username.toLowerCase()),
          }));
          notifyDisabledSync(nextSources);
          return { sources: nextSources };
        });
      },

      disableAllSources: () =>
        set((state) => {
          const nextSources = state.sources.map((s) => ({ ...s, enabled: false }));
          notifyDisabledSync(nextSources);
          return { sources: nextSources };
        }),

      syncWithCatalog: () => {
        const currentSources = get().sources || [];
        const existingMap = new Map(
          currentSources.map((s) => [s.username.toLowerCase(), s.enabled])
        );
        const synced: TelegramSource[] = catalogData.map((c) => {
          const uname = (c.username || c.id || '').toLowerCase().replace(/^@/, '');
          const isEnabled = existingMap.has(uname) ? existingMap.get(uname)! : true;
          return {
            username: uname,
            title: c.title,
            type: c.type || 'channel',
            region: (c.region as RegionCode) || 'US',
            enabled: isEnabled,
            addedAt: new Date().toISOString(),
          };
        });
        set({ sources: synced });
      },

      setVacancies: (vacancies) =>
        set({
          vacancies: vacancies
            .filter(
              (v) =>
                !isRuVacancy(v) &&
                Date.now() - new Date(v.postedAt).getTime() <= FOURTEEN_DAYS_MS
            )
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
          if (isRuVacancy(item)) continue;
          const itemTime = new Date(item.postedAt).getTime();
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
            .filter(
              (v) =>
                !isRuVacancy(v) &&
                now - new Date(v.postedAt).getTime() <= FOURTEEN_DAYS_MS
            )
            .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
            .slice(0, 500);
          set({ vacancies: merged });
        }

        return { newCount: newOnes.length, hotCount };
      },

      markSeen: (id) =>
        set((state) => ({
          vacancies: state.vacancies.map((v) => (v.id === id ? { ...v, seen: true } : v)),
        })),

      markUnseen: (id) =>
        set((state) => ({
          vacancies: state.vacancies.map((v) => (v.id === id ? { ...v, seen: false } : v)),
        })),

      markAllSeen: () =>
        set((state) => ({
          vacancies: state.vacancies.map((v) => ({ ...v, seen: true })),
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
      version: 8,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persistedState: any, version: number) => {
        if (persistedState) {
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
              .filter((v: any) => v && typeof v === 'object' && !v.id?.startsWith('demo_') && (version < 8 ? !isRuVacancy(v) : true))
              .map((v: any) => {
                const { isFavorite: _fav, ...rest } = v;
                return rest;
              })
              .slice(0, 300);
          }
          delete persistedState.savedPresets;
          delete persistedState.filterFavoritesOnly;

          // Version 8+: strip legacy RU sources and sync with EU/US/KZ catalog
          if (version < 8 || !Array.isArray(persistedState.sources) || persistedState.sources.length === 0) {
            const existingMap = new Map(
              (persistedState.sources || []).map((s: any) => [s.username?.toLowerCase(), s.enabled])
            );
            persistedState.sources = catalogData.map((c) => {
              const uname = (c.username || c.id || '').toLowerCase().replace(/^@/, '');
              const isEnabled = existingMap.has(uname) ? existingMap.get(uname) : true;
              return {
                username: uname,
                title: c.title,
                type: c.type || 'channel',
                region: (c.region as RegionCode) || 'US',
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
                  !isRuVacancy(v) &&
                  now - new Date(v.postedAt).getTime() <= FOURTEEN_DAYS_MS
              )
              .slice(0, 300);
          }
          const hasLegacyRu = (state.sources || []).some((s) => s.region === 'RU');
          if (!state.sources || state.sources.length === 0 || hasLegacyRu) {
            setTimeout(() => {
              useVacanciesStore.getState().syncWithCatalog();
            }, 0);
          }
        }
      },
    }
  )
);
