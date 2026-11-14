import { describe, it, expect } from 'vitest';
import { computeProfileFit } from '../lib/profileFit';
import { Vacancy, UserProfile } from '../types';

describe('computeProfileFit', () => {
  const profile: UserProfile = {
    name: 'Тимур',
    specialization: 'YouTube / Reels',
    formats: ['YouTube', 'Shorts/Reels'],
    skills: ['Premiere Pro', 'After Effects'],
    minRate: 4000,
    minRateCurrency: 'RUB',
    telegram: '@timur',
    portfolioUrl: 'https://portfolio.com',
    email: 'timur@example.com',
    sampleUrl: '',
  };

  it('awards high fit when skills, format and budget align', () => {
    const vacancy: Vacancy = {
      id: '1',
      channel: 'job_channel',
      text: 'Ищем монтажёра для Reels и YouTube. Опыт в Premiere Pro и After Effects обязателен.',
      url: 'https://t.me/1',
      postedAt: new Date().toISOString(),
      views: '100',
      matchedKeywords: ['монтажер'],
      relevance: 80,
      formatTag: 'short',
      budget: { min: 5000, max: 7000, currency: 'RUB', unit: 'per_video' },
      seen: false,
      hidden: false,
    };

    const fit = computeProfileFit(vacancy, profile);
    expect(fit).toBeGreaterThanOrEqual(80);
  });

  it('penalizes when budget is significantly below user minRate', () => {
    const lowBudgetVac: Vacancy = {
      id: '2',
      channel: 'job_channel',
      text: 'Монтаж коротких видео 500р',
      url: 'https://t.me/2',
      postedAt: new Date().toISOString(),
      views: '100',
      matchedKeywords: ['монтаж'],
      relevance: 50,
      formatTag: 'short',
      budget: { min: 500, max: 500, currency: 'RUB', unit: 'per_video' },
      seen: false,
      hidden: false,
    };

    const highBudgetVac: Vacancy = {
      ...lowBudgetVac,
      id: '3',
      budget: { min: 6000, max: 8000, currency: 'RUB', unit: 'per_video' },
    };

    const lowFit = computeProfileFit(lowBudgetVac, profile);
    const highFit = computeProfileFit(highBudgetVac, profile);
    expect(highFit).toBeGreaterThan(lowFit);
  });
});
