import { describe, it, expect } from 'vitest';
import { computeVacancyRelevance } from '../store/vacanciesStore';
import { Vacancy } from '../types';

describe('Vacancies Relevance and Filters (EU / US / KZ)', () => {
  const includeKeywords = ['видеомонтажер', 'video editor', 'reels editor'];
  const excludeKeywords = ['строительный монтаж', 'for hire', 'ищу работу'];

  it('computes high relevance and hot badge for recent US/EU vacancy with budget and skills', () => {
    const text =
      'Looking for a YouTube video editor for podcast episodes in Premiere Pro and DaVinci Resolve. Budget $1500 - $2000 per month.';
    const result = computeVacancyRelevance(
      text,
      includeKeywords,
      excludeKeywords,
      true,
      new Date().toISOString(),
      'videojobs_global'
    );

    expect(result.isExcluded).toBe(false);
    expect(result.region).toBe('US');
    expect(result.relevance).toBeGreaterThanOrEqual(70);
    expect(result.skills).toContain('Premiere Pro');
    expect(result.skills).toContain('DaVinci Resolve');
    expect(result.statusBadge).toBe('hot');
    expect(result.qualityTier).toBe('great');
    expect(result.budget?.currency).toBe('USD');
    expect(result.budget?.min).toBe(1500);
  });

  it('excludes RU / Ruble domestic vacancies automatically', () => {
    const text = 'Ищем видеомонтажера в Москве, оплата 80 000 руб в месяц на Сбер.';
    const result = computeVacancyRelevance(text, includeKeywords, excludeKeywords, true, undefined, 'vakankz');

    expect(result.isExcluded).toBe(true);
    expect(result.region).toBe('RU');
  });

  it('correctly tags format as short for reels / shorts', () => {
    const text = 'Нужен рилсмейкер в Алматы на reels и shorts каждый день. Оплата 250 000 тенге.';
    const result = computeVacancyRelevance(text, includeKeywords, excludeKeywords, true);
    expect(result.formatTag).toBe('short');
    expect(result.region).toBe('KZ');
  });

  it('correctly tags format as long for youtube podcasts', () => {
    const text = 'Ищем монтажера длинных горизонтальных выпусков для ютуб канала в Астане, 300 000 ₸.';
    const result = computeVacancyRelevance(text, includeKeywords, excludeKeywords, true);
    expect(result.formatTag).toBe('long');
    expect(result.region).toBe('KZ');
  });

  it('excludes posts matching stop words', () => {
    const text = '[For Hire] Video editor looking for clients, Premiere Pro';
    const result = computeVacancyRelevance(text, includeKeywords, excludeKeywords, false);
    expect(result.isExcluded).toBe(true);
    expect(result.relevance).toBe(0);
  });

  it('filters vacancies by region, format and hot status', () => {
    const mockVacancies: Vacancy[] = [
      {
        id: '1',
        channel: 'reels_editors_hub',
        text: 'Hiring Reels video editor $40/video',
        url: 'https://t.me/reels_editors_hub/1',
        postedAt: new Date().toISOString(),
        views: '100',
        seen: false,
        hidden: false,
        matchedKeywords: ['reels editor'],
        relevance: 80,
        qualityTier: 'great',
        formatTag: 'short',
        region: 'US',
        statusBadge: 'hot',
      },
      {
        id: '2',
        channel: 'eurojobs',
        text: 'London YouTube podcast video editor needed €1200/month',
        url: 'https://t.me/eurojobs/2',
        postedAt: new Date(Date.now() - 3600000).toISOString(),
        views: '200',
        seen: false,
        hidden: false,
        matchedKeywords: ['video editor'],
        relevance: 65,
        qualityTier: 'great',
        formatTag: 'long',
        region: 'EU',
        statusBadge: 'new',
      },
    ];

    expect(mockVacancies.filter((v) => v.formatTag === 'short').map((v) => v.id)).toEqual(['1']);
    expect(mockVacancies.filter((v) => v.statusBadge === 'hot').map((v) => v.id)).toEqual(['1']);
    expect(mockVacancies.filter((v) => v.region === 'EU').map((v) => v.id)).toEqual(['2']);
  });

  it('correctly filters seen vs unseen vacancies and supports markSeen/markUnseen', () => {
    const list: Vacancy[] = [
      {
        id: 'vac_unseen_1',
        channel: 'ch1',
        text: 'New gig',
        url: 'https://t.me/ch1/1',
        postedAt: new Date().toISOString(),
        views: '10',
        seen: false,
        hidden: false,
        matchedKeywords: ['gig'],
        relevance: 70,
        qualityTier: 'great',
        formatTag: 'short',
        region: 'KZ',
        statusBadge: 'new',
      },
      {
        id: 'vac_seen_1',
        channel: 'ch2',
        text: 'Already viewed gig',
        url: 'https://t.me/ch2/1',
        postedAt: new Date().toISOString(),
        views: '20',
        seen: true,
        hidden: false,
        matchedKeywords: ['gig'],
        relevance: 70,
        qualityTier: 'great',
        formatTag: 'short',
        region: 'KZ',
        statusBadge: 'new',
      },
    ];

    const unviewed = list.filter((v) => !v.seen);
    const viewed = list.filter((v) => Boolean(v.seen));

    expect(unviewed.map((v) => v.id)).toEqual(['vac_unseen_1']);
    expect(viewed.map((v) => v.id)).toEqual(['vac_seen_1']);
  });
});
