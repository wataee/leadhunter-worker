import { describe, it, expect } from 'vitest';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useLeadsStore } from '../store/leadsStore';

describe('Zustand Persist Migration v6 -> v8', () => {
  it('correctly migrates legacy state with favorites, removes deleted fields, and strips RU sources/vacancies', () => {
    const legacyState = {
      vacancies: [
        {
          id: 'v_fav_1',
          channel: 'mobilograf_kz',
          url: 'https://t.me/mobilograf_kz/10',
          text: 'Нужен монтажер для Reels в Алматы, 150000 тенге',
          region: 'KZ',
          isFavorite: true,
          postedAt: new Date().toISOString(),
          seen: true,
          hidden: false,
        },
        {
          id: 'v_norm_2',
          channel: 'videojobs_global',
          url: 'https://t.me/videojobs_global/20',
          text: 'Hiring YouTube Video Editor, $150/video',
          region: 'US',
          isFavorite: false,
          postedAt: new Date().toISOString(),
          seen: false,
          hidden: false,
        },
        {
          id: 'v_ru_legacy',
          channel: 'moskva_rabota',
          url: 'https://t.me/moskva_rabota/30',
          text: 'Монтаж видео Москва 50000 руб',
          region: 'RU',
          isFavorite: false,
          postedAt: new Date().toISOString(),
          seen: false,
          hidden: false,
        },
      ],
      savedPresets: [{ id: 'preset_1', name: 'Рилсы', filterHotOnly: true }],
      filterFavoritesOnly: true,
      sources: [{ username: 'moskva_rabota', region: 'RU', enabled: true }],
    };

    const persistOptions = useVacanciesStore.persist.getOptions();
    const migrateFn = persistOptions?.migrate;

    expect(typeof migrateFn).toBe('function');
    if (!migrateFn) throw new Error('migrate function not defined');

    const migrated = migrateFn(legacyState, 5) as {
      savedPresets?: unknown;
      filterFavoritesOnly?: unknown;
      vacancies: Array<{ region?: string; isFavorite?: unknown }>;
      sources: Array<{ region?: string }>;
    };

    expect(migrated.savedPresets).toBeUndefined();
    expect(migrated.filterFavoritesOnly).toBeUndefined();

    expect(migrated.vacancies.length).toBe(2);
    expect(migrated.vacancies.some((v) => v.region === 'RU')).toBe(false);
    expect(migrated.vacancies[0].isFavorite).toBeUndefined();

    expect(migrated.sources.some((s) => s.region === 'RU')).toBe(false);
    expect(migrated.sources.length).toBeGreaterThanOrEqual(200);

    // Favorite vacancy migrated to leadsStore
    const leads = useLeadsStore.getState().leads;
    const migratedLead = leads.find((l) => l.channelUrl === 'https://t.me/mobilograf_kz/10');
    expect(migratedLead).toBeDefined();
    expect(migratedLead?.name).toBe('@mobilograf_kz');
  });

  it('correctly migrates v6 state removing legacy stopPhrases from excludeKeywords', () => {
    const legacyV6State = {
      excludeKeywords: [
        'строительный монтаж',
        'ищу работу',
        'резюме',
        'cv',
        'портфолио:',
        'продаю',
        'моя_кастомная_стоп_фраза',
        'крипта',
      ],
      vacancies: [],
      sources: [],
    };

    const persistOptions = useVacanciesStore.persist.getOptions();
    const migrateFn = persistOptions?.migrate;
    if (!migrateFn) throw new Error('migrate function not defined');
    const migrated = migrateFn(legacyV6State, 6) as { excludeKeywords: string[] };

    expect(migrated.excludeKeywords).toEqual(['моя_кастомная_стоп_фраза', 'крипта']);
  });
});
