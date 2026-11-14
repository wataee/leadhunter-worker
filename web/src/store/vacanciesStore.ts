import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Vacancy } from '../types';
import KEYWORDS from '../shared/keywords.js';
import { parseBudget, BudgetResult } from '../shared/budget.js';

export interface TelegramSource {
  username: string;
  enabled: boolean;
  addedAt: string;
}

interface VacanciesState {
  sources: TelegramSource[];
  vacancies: Vacancy[];
  includeKeywords: string[];
  excludeKeywords: string[];
  lastRefreshedAt: string | null;
  isLoading: boolean;
  selectedVacancyForPitch: Vacancy | null;

  // Actions
  setSelectedVacancyForPitch: (vacancy: Vacancy | null) => void;
  addSource: (rawInput: string) => void;
  removeSource: (username: string) => void;
  toggleSource: (username: string) => void;

  setVacancies: (vacancies: Vacancy[]) => void;
  mergeNewVacancies: (incoming: Vacancy[]) => { newCount: number; hotCount: number };
  markSeen: (id: string) => void;
  hideVacancy: (id: string) => void;

  addIncludeKeyword: (kw: string) => void;
  removeIncludeKeyword: (kw: string) => void;
  addExcludeKeyword: (kw: string) => void;
  removeExcludeKeyword: (kw: string) => void;

  setLoading: (loading: boolean) => void;
  setLastRefreshedAt: (date: string) => void;

  clearAllVacancies: () => void;
}

export const DEFAULT_INCLUDE_KEYWORDS = KEYWORDS.coreRoles;
export const DEFAULT_EXCLUDE_KEYWORDS = KEYWORDS.stopPhrases;

const DEFAULT_SOURCES: TelegramSource[] = [
  { username: 'work_videoedit', enabled: true, addedAt: new Date().toISOString() },
  { username: 'normrabota', enabled: true, addedAt: new Date().toISOString() },
  { username: 'vdhl_good', enabled: true, addedAt: new Date().toISOString() },
  { username: 'distantsiya', enabled: true, addedAt: new Date().toISOString() },
  { username: 'kinovideojob', enabled: true, addedAt: new Date().toISOString() },
  { username: 'finder_vc', enabled: true, addedAt: new Date().toISOString() },
  { username: 'youtube_jobs', enabled: true, addedAt: new Date().toISOString() },
  { username: 'reels_jobs', enabled: true, addedAt: new Date().toISOString() },
  { username: 'freelancetaverna', enabled: true, addedAt: new Date().toISOString() },
  { username: 'mediajobs', enabled: true, addedAt: new Date().toISOString() },
];

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
} {
  const lower = text.toLowerCase();

  // Exclude check
  const isExcluded = excludeKeywords.some((kw) => lower.includes(kw.toLowerCase()));
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
    };
  }

  let matchedKeywords = includeKeywords.filter((kw) => lower.includes(kw.toLowerCase()));

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
    matchedKeywords = ['монтаж'];
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

  if (isGreat) {
    qualityTier = 'great';
  } else if (isShady) {
    qualityTier = 'shady';
  }

  const budget = parseBudget(text);

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
      selectedVacancyForPitch: null,

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

      clearAllVacancies: () => set({ vacancies: [] }),
    }),
    {
      name: 'leadhunter_vacancies',
      storage: safeLocalStorage as any,
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.vacancies)) {
          const now = Date.now();
          state.vacancies = state.vacancies
            .filter(
              (v) =>
                !v.id?.startsWith('demo_') &&
                now - new Date(v.postedAt).getTime() <= FOURTEEN_DAYS_MS
            )
            .slice(0, 500);
        }
      },
    }
  )
);
