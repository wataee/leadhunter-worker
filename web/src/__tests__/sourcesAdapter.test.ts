import { describe, it, expect } from 'vitest';
import { normalizeAndFilterItems, RawSourceItem } from '../sources';

describe('5.10 Sources Adapter Architecture (EU / US / KZ)', () => {
  it('normalizes, deduplicates, classifies regions, and excludes RU/seller posts', () => {
    const rawItems: RawSourceItem[] = [
      {
        id: '1',
        source: 'telegram',
        channelOrAuthor: 'videojobs_global',
        text: 'Hiring a YouTube video editor for weekly episodes. Budget $200 per video. Remote worldwide.',
        url: 'https://t.me/videojobs_global/1',
        publishedAt: new Date().toISOString(),
      },
      // Duplicate of 1
      {
        id: '2',
        source: 'telegram',
        channelOrAuthor: 'creators_jobs',
        text: 'Hiring a YouTube video editor for weekly episodes. Budget $200 per video. Remote worldwide.',
        url: 'https://t.me/creators_jobs/2',
        publishedAt: new Date().toISOString(),
      },
      // Self-promo [For Hire] rejected by filter
      {
        id: '3',
        source: 'telegram',
        channelOrAuthor: 'editors_chat',
        text: '[For Hire] Video editor available for work, DM me for editing services.',
        url: 'https://t.me/editors_chat/3',
        publishedAt: new Date().toISOString(),
      },
      // Shady unpaid test task
      {
        id: '4',
        source: 'telegram',
        channelOrAuthor: 'london_jobs',
        text: 'Looking for video editor in London (£300). Must complete unpaid test edit first.',
        url: 'https://t.me/london_jobs/4',
        publishedAt: new Date().toISOString(),
      },
      // Ruble / Moscow cross-post excluded automatically
      {
        id: '5',
        source: 'telegram',
        channelOrAuthor: 'vakankz',
        text: 'Ищем видеомонтажера в Москве, оплата 60 000 ₽ в месяц.',
        url: 'https://t.me/vakankz/5',
        publishedAt: new Date().toISOString(),
      },
    ];

    const result = normalizeAndFilterItems(rawItems);
    expect(result.totalRaw).toBe(5);
    expect(result.duplicateCount).toBe(1);
    expect(result.filteredCount).toBe(2); // Item 3 ([For Hire]) + Item 5 (Moscow / RUB)
    expect(result.vacancies.length).toBe(2); // Item 1 and Item 4

    const usVac = result.vacancies.find((v) => v.id === '1');
    expect(usVac?.region).toBe('US');
    expect(usVac?.qualityTier).toBe('great');
    expect(usVac?.budget?.currency).toBe('USD');

    const shadyVac = result.vacancies.find((v) => v.id === '4');
    expect(shadyVac?.region).toBe('EU');
    expect(shadyVac?.qualityTier).toBe('shady');
    expect(shadyVac?.risks?.length).toBeGreaterThan(0);
    expect(shadyVac?.budget?.currency).toBe('GBP');
  });
});
