import { create } from 'zustand';
import rawCatalog from '../shared/sources.catalog.json';
import { SourceItem, SourceCategory, SourceLanguage, SourceType, SourceRegion } from './catalogTypes';
import { useVacanciesStore } from '../store/vacanciesStore';
import { syncDisabledSourcesToApi } from '../lib/api';

const STORAGE_KEY = 'leadhunter_active_sources';
const CUSTOM_SOURCES_KEY = 'leadhunter_custom_sources';

const typedCatalog = rawCatalog as unknown as SourceItem[];

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

function getInitialActiveSources(customSources: SourceItem[]): string[] {
  const allCatalogIds = typedCatalog.map((s) => s.id.toLowerCase());
  const validIds = new Set([...allCatalogIds, ...customSources.map((s) => s.id.toLowerCase())]);

  if (typeof window === 'undefined') return allCatalogIds;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map((x) => String(x).toLowerCase())
          .filter((id) => validIds.has(id));
        // If a non-empty legacy RU list was completely purged after migration, re-enable new EU/US/KZ catalog
        if (parsed.length > 0 && cleaned.length === 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(allCatalogIds));
          return allCatalogIds;
        }
        return Array.from(new Set(cleaned));
      }
    }
  } catch {
    // ignore json error
  }
  return allCatalogIds;
}

function syncToVacanciesStore(activeIds: string[], catalogList: SourceItem[], customList: SourceItem[]) {
  try {
    const activeSet = new Set(activeIds.map((x) => x.toLowerCase()));
    const mergedMap = new Map<string, SourceItem>();
    for (const item of [...catalogList, ...customList]) {
      mergedMap.set(item.id.toLowerCase(), item);
    }

    const updated = Array.from(mergedMap.entries()).map(([uname, item]) => ({
      username: uname,
      title: item.title,
      type: item.type,
      region: item.region || 'US',
      enabled: activeSet.has(uname),
      addedAt: new Date().toISOString(),
    }));

    // Keep any manually imported IDs that were active even without metadata
    for (const id of activeIds) {
      const lower = id.toLowerCase();
      if (!mergedMap.has(lower)) {
        updated.push({
          username: lower,
          title: `@${lower}`,
          type: 'channel',
          region: 'US',
          enabled: true,
          addedAt: new Date().toISOString(),
        });
      }
    }

    useVacanciesStore.setState({ sources: updated });

    if (typeof window !== 'undefined') {
      const disabled = updated.filter((s) => !s.enabled).map((s) => s.username);
      syncDisabledSourcesToApi(disabled).catch(() => {});
    }
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
  selectedRegion: SourceRegion | 'all';
  selectedType: SourceType | 'all';
  selectedStatus: 'all' | 'active_only';
  selectedTag: string | null;
  sortBy: SortOption;

  // Actions
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (cat: SourceCategory | 'all') => void;
  setSelectedLanguage: (lang: SourceLanguage | 'all') => void;
  setSelectedRegion: (region: SourceRegion | 'all') => void;
  setSelectedType: (type: SourceType | 'all') => void;
  setSelectedStatus: (status: 'all' | 'active_only') => void;
  setSelectedTag: (tag: string | null) => void;
  setSortBy: (sort: SortOption) => void;

  toggleActive: (id: string) => void;
  enableAllSources: () => void;
  disableAllSources: () => void;
  enableRecommended: () => void;
  enableRegions: (regions: SourceRegion[]) => void;
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
  const initialCustom = getInitialCustomSources();
  const initialActive = getInitialActiveSources(initialCustom);

  const persistAndSync = (arr: string[], customOverride?: SourceItem[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    }
    syncToVacanciesStore(arr, get()?.catalog || typedCatalog, customOverride || get()?.customSources || initialCustom);
  };

  // Initialize vacancies store on first load
  syncToVacanciesStore(initialActive, typedCatalog, initialCustom);

  return {
    catalog: typedCatalog,
    customSources: initialCustom,
    activeSources: new Set(initialActive),
    selectedIds: new Set<string>(),

    searchQuery: '',
    selectedCategory: 'all',
    selectedLanguage: 'all',
    selectedRegion: 'all',
    selectedType: 'all',
    selectedStatus: 'all',
    selectedTag: null,
    sortBy: 'quality',

    setSearchQuery: (q) => set({ searchQuery: q }),
    setSelectedCategory: (cat) => set({ selectedCategory: cat }),
    setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
    setSelectedRegion: (region) => set({ selectedRegion: region }),
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
      persistAndSync(Array.from(current));
      set({ activeSources: current });
    },

    enableAllSources: () => {
      const allIds = [...get().catalog, ...get().customSources].map((s) => s.id.toLowerCase());
      const next = new Set(allIds);
      persistAndSync(Array.from(next));
      set({ activeSources: next });
    },

    disableAllSources: () => {
      const next = new Set<string>();
      persistAndSync([]);
      set({ activeSources: next });
    },

    enableRecommended: () => {
      const recommended = get().catalog.filter((s) => s.recommended).map((s) => s.id.toLowerCase());
      const next = new Set(recommended);
      persistAndSync(Array.from(next));
      set({ activeSources: next });
    },

    enableRegions: (regions) => {
      const regionSet = new Set(regions);
      const targetIds = [...get().catalog, ...get().customSources]
        .filter((s) => s.region && regionSet.has(s.region))
        .map((s) => s.id.toLowerCase());
      const next = new Set(targetIds);
      persistAndSync(Array.from(next));
      set({ activeSources: next });
    },

    addActiveBatch: (ids) => {
      const current = new Set(get().activeSources);
      ids.forEach((id) => current.add(id.toLowerCase()));
      persistAndSync(Array.from(current));
      set({ activeSources: current });
    },

    removeActiveBatch: (ids) => {
      const current = new Set(get().activeSources);
      ids.forEach((id) => current.delete(id.toLowerCase()));
      persistAndSync(Array.from(current));
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
      const active = new Set(get().activeSources);
      active.add(lower);
      persistAndSync(Array.from(active), custom);
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

      persistAndSync(Array.from(active));
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
