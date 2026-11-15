import { create } from 'zustand';
import rawCatalog from '../shared/sources.catalog.json';
import { SourceItem, SourceCategory, SourceLanguage, SourceType } from './catalogTypes';
import { useVacanciesStore } from '../store/vacanciesStore';

const STORAGE_KEY = 'leadhunter_active_sources';
const CUSTOM_SOURCES_KEY = 'leadhunter_custom_sources';

const typedCatalog = rawCatalog as unknown as SourceItem[];

function getInitialActiveSources(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length >= 50) {
        return parsed.map((x) => String(x).toLowerCase());
      }
    }
  } catch {
    // ignore json error
  }
  // Default: all recommended items (full 152 catalog sources)
  return typedCatalog.filter((s) => s.recommended).map((s) => s.id);
}

function getInitialCustomSources(): SourceItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(CUSTOM_SOURCES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function syncToVacanciesStore(activeIds: string[]) {
  try {
    const vStore = useVacanciesStore.getState();
    const existing = new Set(vStore.sources.map((s) => s.username.toLowerCase()));

    // Update enabled state or add missing
    const updated = [...vStore.sources];
    const activeSet = new Set(activeIds.map((x) => x.toLowerCase()));

    // Enable/disable existing
    for (let i = 0; i < updated.length; i++) {
      const uname = updated[i].username.toLowerCase();
      updated[i] = {
        ...updated[i],
        enabled: activeSet.has(uname),
      };
    }

    // Add new ones
    for (const id of activeIds) {
      if (!existing.has(id.toLowerCase())) {
        updated.push({
          username: id.toLowerCase(),
          enabled: true,
          addedAt: new Date().toISOString(),
        });
      }
    }

    useVacanciesStore.setState({ sources: updated });
  } catch {
    // ignore
  }
}

export type SortOption = 'quality' | 'subscribers' | 'activity' | 'alphabet';

interface CatalogState {
  catalog: SourceItem[];
  customSources: SourceItem[];
  activeSources: Set<string>;
  selectedIds: Set<string>;

  // Filters
  searchQuery: string;
  selectedCategory: SourceCategory | 'all';
  selectedLanguage: SourceLanguage | 'all';
  selectedType: SourceType | 'all';
  selectedStatus: 'all' | 'active_only';
  selectedTag: string | null;
  sortBy: SortOption;

  // Actions
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (cat: SourceCategory | 'all') => void;
  setSelectedLanguage: (lang: SourceLanguage | 'all') => void;
  setSelectedType: (type: SourceType | 'all') => void;
  setSelectedStatus: (status: 'all' | 'active_only') => void;
  setSelectedTag: (tag: string | null) => void;
  setSortBy: (sort: SortOption) => void;

  toggleActive: (id: string) => void;
  enableAllSources: () => void;
  disableAllSources: () => void;
  enableRecommended: () => void;
  addActiveBatch: (ids: string[]) => void;
  removeActiveBatch: (ids: string[]) => void;

  toggleSelected: (id: string) => void;
  setSelectedBatch: (ids: string[], selected: boolean) => void;
  clearSelection: () => void;

  addCustomSource: (source: SourceItem) => void;
  importSources: (usernames: string[]) => { added: number; errors: string[] };
  exportSources: (format: 'json' | 'txt', ids?: string[]) => string;
}

export const useCatalogStore = create<CatalogState>((set, get) => {
  const initialActive = getInitialActiveSources();
  const initialCustom = getInitialCustomSources();

  // Initialize vacancies store on first load
  syncToVacanciesStore(initialActive);

  return {
    catalog: typedCatalog,
    customSources: initialCustom,
    activeSources: new Set(initialActive),
    selectedIds: new Set<string>(),

    searchQuery: '',
    selectedCategory: 'all',
    selectedLanguage: 'all',
    selectedType: 'all',
    selectedStatus: 'all',
    selectedTag: null,
    sortBy: 'quality',

    setSearchQuery: (q) => set({ searchQuery: q }),
    setSelectedCategory: (cat) => set({ selectedCategory: cat }),
    setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
    setSelectedType: (type) => set({ selectedType: type }),
    setSelectedStatus: (status) => set({ selectedStatus: status }),
    setSelectedTag: (tag) => set({ selectedTag: tag }),
    setSortBy: (sort) => set({ sortBy: sort }),

    toggleActive: (id) => {
      const lower = id.toLowerCase();
      const current = new Set(get().activeSources);
      if (current.has(lower)) {
        current.delete(lower);
      } else {
        current.add(lower);
      }
      const arr = Array.from(current);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      }
      syncToVacanciesStore(arr);
      set({ activeSources: current });
    },

    enableAllSources: () => {
      const allIds = get().catalog.map((s) => s.id.toLowerCase());
      const next = new Set(allIds);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      }
      syncToVacanciesStore(Array.from(next));
      set({ activeSources: next });
    },

    disableAllSources: () => {
      const next = new Set<string>();
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      }
      syncToVacanciesStore([]);
      set({ activeSources: next });
    },

    enableRecommended: () => {
      const recommended = get().catalog.filter((s) => s.recommended).map((s) => s.id.toLowerCase());
      const current = new Set(get().activeSources);
      recommended.forEach((id) => current.add(id));
      const arr = Array.from(current);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      }
      syncToVacanciesStore(arr);
      set({ activeSources: current });
    },

    addActiveBatch: (ids) => {
      const current = new Set(get().activeSources);
      ids.forEach((id) => current.add(id.toLowerCase()));
      const arr = Array.from(current);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      }
      syncToVacanciesStore(arr);
      set({ activeSources: current });
    },

    removeActiveBatch: (ids) => {
      const current = new Set(get().activeSources);
      ids.forEach((id) => current.delete(id.toLowerCase()));
      const arr = Array.from(current);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      }
      syncToVacanciesStore(arr);
      set({ activeSources: current });
    },

    toggleSelected: (id) => {
      const current = new Set(get().selectedIds);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      set({ selectedIds: current });
    },

    setSelectedBatch: (ids, selected) => {
      const current = new Set(get().selectedIds);
      ids.forEach((id) => {
        if (selected) current.add(id);
        else current.delete(id);
      });
      set({ selectedIds: current });
    },

    clearSelection: () => set({ selectedIds: new Set<string>() }),

    addCustomSource: (source) => {
      const lower = source.id.toLowerCase();
      const custom = [...get().customSources.filter((s) => s.id.toLowerCase() !== lower), source];
      if (typeof window !== 'undefined') {
        localStorage.setItem(CUSTOM_SOURCES_KEY, JSON.stringify(custom));
      }
      // Also automatically mark active
      const active = new Set(get().activeSources);
      active.add(lower);
      const arr = Array.from(active);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      }
      syncToVacanciesStore(arr);
      set({ customSources: custom, activeSources: active });
    },

    importSources: (usernames) => {
      const errors: string[] = [];
      let added = 0;
      const active = new Set(get().activeSources);

      for (let raw of usernames) {
        raw = raw.replace(/^@/, '').trim().toLowerCase();
        if (!raw) continue;
        if (!/^[a-z0-9_]{5,32}$/.test(raw)) {
          errors.push(`@${raw}: невалидный формат`);
          continue;
        }
        active.add(raw);
        added++;
      }

      const arr = Array.from(active);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      }
      syncToVacanciesStore(arr);
      set({ activeSources: active });
      return { added, errors };
    },

    exportSources: (format, ids) => {
      const targetIds = ids && ids.length > 0 ? ids : Array.from(get().activeSources);
      const allItems = [...get().catalog, ...get().customSources];
      const itemsMap = new Map(allItems.map((s) => [s.id.toLowerCase(), s]));

      if (format === 'txt') {
        return targetIds.map((id) => `@${id}`).join('\n');
      }

      const exportedItems = targetIds.map((id) => {
        const found = itemsMap.get(id.toLowerCase());
        if (found) return found;
        return {
          id,
          username: id,
          url: `https://t.me/${id}`,
          status: 'ok',
        };
      });
      return JSON.stringify(exportedItems, null, 2);
    },
  };
});
