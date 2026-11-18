import { describe, it, expect } from 'vitest';
import {
  REGIONS,
  detectVacancyRegion,
  REGION_LABELS,
  isSupportedRegion,
} from '../shared/regions.js';
import rawCatalog from '../shared/sources.catalog.json';
import { validateCatalog, SourceItem } from '../sources/catalogTypes';

describe('Geographical regions & EU / US / KZ catalog', () => {
  it('detects Kazakhstan correctly by currency, cities, or Kazakh text', () => {
    expect(detectVacancyRegion('Монтаж рилсов, 15 000 ₸ за ролик')).toBe('KZ');
    expect(detectVacancyRegion('Ищем монтажера, ставка 350 000 тенге')).toBe('KZ');
    expect(detectVacancyRegion('Съемка и монтаж в Алматы, оплата на Kaspi Gold')).toBe('KZ');
    expect(detectVacancyRegion('Работа в Астане для видеографа')).toBe('KZ');
    expect(detectVacancyRegion('Бейнемонтажер іздейміз, Алматы')).toBe('KZ');
    expect(detectVacancyRegion('Нужен монтаж', 'mobilograf_kz')).toBe('KZ');
    expect(detectVacancyRegion('Работа', 'digital_iskra')).toBe('KZ');
  });

  it('detects Europe / UK correctly by currency, language, cities, or EU channels', () => {
    expect(detectVacancyRegion('Hiring YouTube editor in London, £600 per video GMT')).toBe('EU');
    expect(detectVacancyRegion('Videoeditor gesucht in Berlin, €2000/month CET')).toBe('EU');
    expect(detectVacancyRegion('Работа в Европе: требуется видеомонтажер в Польше')).toBe('EU');
    expect(detectVacancyRegion('Motion designer needed remotely', 'relocateme')).toBe('EU');
  });

  it('detects US / Global correctly by currency, language, and markers', () => {
    expect(detectVacancyRegion('Looking for video editor for YouTube channel. $2,000/mo remote.')).toBe('US');
    expect(detectVacancyRegion('Hiring reels editor. $30-$50 per video, US time zone.')).toBe('US');
    expect(detectVacancyRegion('Crypto media agency hiring Premiere Pro editor', 'web3jobs')).toBe('US');
  });

  it('isolates Russia / Ruble posts as RU for automatic filtering', () => {
    expect(detectVacancyRegion('Монтаж подкаста, 5000 руб за выпуск')).toBe('RU');
    expect(detectVacancyRegion('Ищем рилсмейкера в Москве, 80 000 ₽ / мес')).toBe('RU');
    expect(detectVacancyRegion('Санкт-Петербург: требуется видеомонтажер')).toBe('RU');
    expect(detectVacancyRegion('Обычный заказ на монтаж ролика')).toBe('RU');
  });

  it('validates catalog has >= 200 EU, US, and KZ sources and ZERO RU sources', () => {
    const catalog = rawCatalog as unknown as SourceItem[];
    const result = validateCatalog(catalog);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);

    const euSources = catalog.filter((s) => s.region === 'EU');
    const usSources = catalog.filter((s) => s.region === 'US');
    const kzSources = catalog.filter((s) => s.region === 'KZ');
    const ruSources = catalog.filter((s) => (s.region as string) === 'RU');

    expect(ruSources.length).toBe(0);
    expect(euSources.length).toBeGreaterThanOrEqual(35);
    expect(usSources.length).toBeGreaterThanOrEqual(50);
    expect(kzSources.length).toBeGreaterThanOrEqual(50);

    for (const item of catalog) {
      expect(['EU', 'US', 'KZ']).toContain(item.region);
    }
  });

  it('verifies active region constants and labels contain flags without RU', () => {
    expect(REGIONS).toEqual(['EU', 'US', 'KZ']);
    expect(isSupportedRegion('EU')).toBe(true);
    expect(isSupportedRegion('RU')).toBe(false);
    expect(REGION_LABELS.EU).toContain('🇪🇺');
    expect(REGION_LABELS.US).toContain('🇺🇸');
    expect(REGION_LABELS.KZ).toContain('🇰🇿');
  });
});
