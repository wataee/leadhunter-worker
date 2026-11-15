import { describe, it, expect } from 'vitest';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useLeadsStore } from '../store/leadsStore';

describe('Zustand Persist Migration v6', () => {
  it('correctly migrates legacy state with favorites and removes deleted fields', () => {
    const legacyState = {
      vacancies: [
        {
          id: 'v_fav_1',
          channel: 'channel_editor',
          url: 'https://t.me/channel_editor/10',
          text: 'Нужен монтажер для Reels',
          isFavorite: true,
          postedAt: new Date().toISOString(),
          seen: true,
          hidden: false,
        },
        {
          id: 'v_norm_2',
          channel: 'channel_norm',
          url: 'https://t.me/channel_norm/20',
          text: 'Монтаж YouTube',
          isFavorite: false,
          postedAt: new Date().toISOString(),
          seen: false,
          hidden: false,
        },
      ],
      savedPresets: [
        { id: 'preset_1', name: 'Рилсы', filterHotOnly: true },
      ],
      filterFavoritesOnly: true,
      sources: [],
    };

    // Extract the migrate function from vacanciesStore persist options
    const persistOptions = (useVacanciesStore as any).persist?.getOptions?.();
    const migrateFn = persistOptions?.migrate;

    expect(typeof migrateFn).toBe('function');

    const migrated = migrateFn(legacyState, 5);

    // Old fields must be deleted
    expect(migrated.savedPresets).toBeUndefined();
    expect(migrated.filterFavoritesOnly).toBeUndefined();

    // isFavorite must be removed from vacancies
    expect(migrated.vacancies.length).toBe(2);
    expect(migrated.vacancies[0].isFavorite).toBeUndefined();

    // The favorite vacancy must be migrated to leadsStore
    const leads = useLeadsStore.getState().leads;
    const migratedLead = leads.find((l) => l.channelUrl === 'https://t.me/channel_editor/10');
    expect(migratedLead).toBeDefined();
    expect(migratedLead?.name).toBe('@channel_editor');
  });
});
