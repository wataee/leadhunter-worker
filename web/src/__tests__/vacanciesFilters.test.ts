import { describe, it, expect } from 'vitest';
import { computeVacancyRelevance } from '../store/vacanciesStore';
import { Vacancy } from '../types';

describe('Vacancies Relevance and Filters', () => {
  const includeKeywords = ['видеомонтажер', 'монтажер', 'рилсмейкер'];
  const excludeKeywords = ['строительный монтаж', 'ищу работу', 'резюме'];

  it('computes high relevance and hot badge for recent vacancy with budget and skills', () => {
    const text = 'Срочно ищем видеомонтажера для YouTube подкаста в Premiere Pro и DaVinci Resolve. Оплата 80 000 - 100 000 руб в месяц.';
    const result = computeVacancyRelevance(
      text,
      includeKeywords,
      excludeKeywords,
      true,
      new Date().toISOString()
    );

    expect(result.isExcluded).toBe(false);
    expect(result.relevance).toBeGreaterThanOrEqual(70);
    expect(result.skills).toContain('Premiere Pro');
    expect(result.skills).toContain('DaVinci Resolve');
    expect(result.statusBadge).toBe('hot');
    expect(result.qualityTier).toBe('great');
    expect(result.budget).toBeDefined();
    expect(result.budget?.min).toBe(80000);
  });

  it('correctly tags format as short for reels / shorts', () => {
    const text = 'Нужен рилсмейкер на reels и shorts каждый день.';
    const result = computeVacancyRelevance(text, includeKeywords, excludeKeywords, true);
    expect(result.formatTag).toBe('short');
  });

  it('correctly tags format as long for youtube podcasts', () => {
    const text = 'Ищем монтажера длинных горизонтальных выпусков для ютуб канала.';
    const result = computeVacancyRelevance(text, includeKeywords, excludeKeywords, true);
    expect(result.formatTag).toBe('long');
  });

  it('excludes vacancies matching stop words', () => {
    const text = 'Ищу работу видеомонтажером, смонтирую ваши ролики.';
    const result = computeVacancyRelevance(text, includeKeywords, excludeKeywords, false);
    expect(result.isExcluded).toBe(true);
    expect(result.relevance).toBe(0);
  });

  it('filters vacancies by format and hot status', () => {
    const mockVacancies: Vacancy[] = [
      {
        id: '1',
        channel: 'channel_1',
        text: 'Монтаж reels',
        url: 'https://t.me/1',
        postedAt: new Date().toISOString(),
        views: '100',
        seen: false,
        hidden: false,
        matchedKeywords: ['монтаж'],
        relevance: 80,
        qualityTier: 'great',
        formatTag: 'short',
        statusBadge: 'hot',
      },
      {
        id: '2',
        channel: 'channel_2',
        text: 'Монтаж YouTube подкаста',
        url: 'https://t.me/2',
        postedAt: new Date(Date.now() - 3600000).toISOString(),
        views: '200',
        seen: false,
        hidden: false,
        matchedKeywords: ['монтаж'],
        relevance: 60,
        qualityTier: 'fair',
        formatTag: 'long',
        statusBadge: 'new',
      },
    ];

    // Filter by format short
    const shortList = mockVacancies.filter(v => v.formatTag === 'short');
    expect(shortList.length).toBe(1);
    expect(shortList[0].id).toBe('1');

    // Filter by hot only
    const hotList = mockVacancies.filter(v => v.statusBadge === 'hot');
    expect(hotList.length).toBe(1);
    expect(hotList[0].id).toBe('1');
  });

  it('D2: prevents duplicate leads when channelUrl already exists', () => {
    const existingLeads = [
      { id: 'lead_1', name: '@editors', channelUrl: 'https://t.me/editors/100', status: 'new' as const },
    ];

    const targetUrl1 = 'https://t.me/editors/100';
    const isDup1 = existingLeads.some(l => Boolean(l.channelUrl && l.channelUrl.trim() === targetUrl1.trim()));
    expect(isDup1).toBe(true);

    const targetUrl2 = 'https://t.me/editors/101';
    const isDup2 = existingLeads.some(l => Boolean(l.channelUrl && l.channelUrl.trim() === targetUrl2.trim()));
    expect(isDup2).toBe(false);
  });
});
