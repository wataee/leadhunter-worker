import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Vacancy } from '../types';

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

const DEFAULT_INCLUDE_KEYWORDS = [
  'ищу монтажер',
  'ищу монтажёр',
  'нужен монтажер',
  'нужен монтажёр',
  'требуется монтажер',
  'ищем монтажер',
  'вакансия монтажер',
  'видеомонтажер',
  'видеомонтажёр',
  'editor needed',
  'looking for editor',
  'video editor',
  'монтаж видео',
  'монтаж ролик',
  'монтаж подкаст',
];

const DEFAULT_EXCLUDE_KEYWORDS = [
  'ищу заказы',
  'ищу работу',
  'предлагаю услуги',
  'мои услуги',
  'резюме',
  'портфолио:',
  'возьму заказ',
  'делаю монтаж',
  'открыт к заказам',
];

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
  excludeKeywords: string[]
): {
  relevance: number;
  matchedKeywords: string[];
  isExcluded: boolean;
  formatTag: 'short' | 'long' | 'both';
  qualityTier: 'great' | 'fair' | 'shady';
} {
  const lower = text.toLowerCase();

  // Exclude check
  const isExcluded = excludeKeywords.some((kw) => lower.includes(kw.toLowerCase()));
  if (isExcluded) {
    return {
      relevance: 0,
      matchedKeywords: [],
      isExcluded: true,
      formatTag: 'both',
      qualityTier: 'shady',
    };
  }

  const matchedKeywords = includeKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
  if (matchedKeywords.length === 0) {
    return {
      relevance: 0,
      matchedKeywords: [],
      isExcluded: false,
      formatTag: 'both',
      qualityTier: 'fair',
    };
  }

  // Format detection
  const hasShort = /(reels|shorts|tiktok|рилс|шортс|вертикальн|сторис|capcut)/i.test(lower);
  const hasLong = /(youtube|ютуб|подкаст|горизонтальн|хронометраж|выпуск|фильм|шоу)/i.test(lower);
  const formatTag: 'short' | 'long' | 'both' = hasShort && hasLong ? 'both' : hasShort ? 'short' : 'long';

  // Quality tier detection (как в @jobforeditors_bot)
  let qualityTier: 'great' | 'fair' | 'shady' = 'fair';
  const isGreat =
    /(\$\s*1[\s,.]?000|\$\s*1[\s,.]?200|\$\s*1[\s,.]?500|\$\s*2[\s,.]?000|80\s*000|100\s*000|120\s*000|150\s*000|6\s*000\s*aed|международн|долларах)/i.test(
      lower
    );
  const isShady =
    /(бесплатно|за опыт|стажировка|без оплаты|на энтузиазме|до 8\s*000|до 5\s*000|150\s*₽|символическ)/i.test(
      lower
    );

  if (isGreat) {
    qualityTier = 'great';
  } else if (isShady) {
    qualityTier = 'shady';
  }

  let score = 50 + matchedKeywords.length * 10;
  if (qualityTier === 'great') score += 25;
  if (qualityTier === 'shady') score -= 35;

  // Budget / price mentions
  const budgetKeywords = ['бюджет', 'оплата', '$', '₽', 'руб', '₸', 'usd', 'ставка', 'фикс', 'оклад'];
  if (budgetKeywords.some((b) => lower.includes(b))) score += 15;

  return {
    relevance: Math.max(0, Math.min(100, score)),
    matchedKeywords,
    isExcluded: false,
    formatTag,
    qualityTier,
  };
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

      setVacancies: (vacancies) => set({ vacancies }),

      mergeNewVacancies: (incoming) => {
        const current = get().vacancies;
        const currentIds = new Set(current.map((v) => v.id));
        const newOnes: Vacancy[] = [];
        let hotCount = 0;
        const twentyMinsAgo = Date.now() - 20 * 60 * 1000;

        for (const item of incoming) {
          if (!currentIds.has(item.id)) {
            newOnes.push(item);
            const postedTime = new Date(item.postedAt).getTime();
            if (postedTime >= twentyMinsAgo) {
              hotCount++;
            }
          }
        }

        if (newOnes.length > 0) {
          const merged = [...newOnes, ...current].sort(
            (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
          );
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
      // Automatically purge any old demo vacancies from localStorage
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.vacancies)) {
          state.vacancies = state.vacancies.filter((v) => !v.id?.startsWith('demo_'));
        }
      },
    }
  )
);
