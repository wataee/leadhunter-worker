import { describe, it, expect } from 'vitest';
import { HabrFreelanceSourceAdapter } from '../sources/HabrFreelanceSource';
import { normalizeAndFilterItems, RawSourceItem } from '../sources';

describe('5.10 Sources Adapter Architecture', () => {
  it('HabrFreelanceSource parses RSS XML into unified RawSourceItems', () => {
    const adapter = new HabrFreelanceSourceAdapter();
    const mockRss = `
      <rss version="2.0">
        <channel>
          <title>Заказы на Хабр Фриланс</title>
          <item>
            <title><![CDATA[Требуется монтажер для YouTube канала]]></title>
            <link>https://freelance.habr.com/tasks/12345</link>
            <description><![CDATA[Ищем монтажера видео в команду, ролики по 15 минут.]]></description>
            <pubDate>Mon, 14 Nov 2026 12:00:00 GMT</pubDate>
            <guid>habr_12345</guid>
          </item>
        </channel>
      </rss>
    `;

    const items = adapter.parseRssXml(mockRss);
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('habr_12345');
    expect(items[0].source).toBe('habr_freelance');
    expect(items[0].text).toContain('монтажер');
  });

  it('normalizes, deduplicates and filters multi-source raw items', () => {
    const rawItems: RawSourceItem[] = [
      {
        id: '1',
        source: 'telegram',
        channelOrAuthor: 'jobs_edit',
        text: 'Ищем монтажера для Reels. Оплата 5000р за видео.',
        url: 'https://t.me/jobs/1',
        publishedAt: new Date().toISOString(),
      },
      // Duplicate of 1
      {
        id: '2',
        source: 'telegram',
        channelOrAuthor: 'other_channel',
        text: 'Ищем монтажера для Reels. Оплата 5000р за видео.',
        url: 'https://t.me/jobs/2',
        publishedAt: new Date().toISOString(),
      },
      // Irrelevant (not a vacancy)
      {
        id: '3',
        source: 'habr_freelance',
        channelOrAuthor: 'habr',
        text: 'Привет, я монтажер с опытом 5 лет, ищу заказчиков.',
        url: 'https://freelance.habr.com/tasks/3',
        publishedAt: new Date().toISOString(),
      },
      // Shady vacancy (unpaid test task on full video)
      {
        id: '4',
        source: 'telegram',
        channelOrAuthor: 'scam_channel',
        text: 'Требуется монтажер. Сделайте бесплатное тестовое задание на весь ролик.',
        url: 'https://t.me/jobs/4',
        publishedAt: new Date().toISOString(),
      },
    ];

    const result = normalizeAndFilterItems(rawItems);
    expect(result.totalRaw).toBe(4);
    expect(result.duplicateCount).toBe(1);
    expect(result.filteredCount).toBe(1); // Item 3 rejected by matchesVacancy (seller post)
    expect(result.vacancies.length).toBe(2); // Item 1 and Item 4

    const shadyVac = result.vacancies.find((v) => v.id === '4');
    expect(shadyVac?.qualityTier).toBe('shady');
    expect(shadyVac?.risks?.length).toBeGreaterThan(0);
  });
});
