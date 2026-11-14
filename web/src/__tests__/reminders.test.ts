import { describe, it, expect } from 'vitest';
import { getDueFollowUps } from '../lib/reminders';
import { Lead } from '../types';

describe('5.7 getDueFollowUps', () => {
  it('correctly filters leads requiring follow-up', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const leads: Lead[] = [
      {
        id: '1',
        name: 'Overdue Client',
        channelUrl: 'https://youtube.com/1',
        subscribers: 1000,
        niche: 'Vlog',
        tier: 1,
        score: 80,
        source: 'manual',
        email: null,
        telegram: '@overdue',
        instagram: null,
        website: null,
        hasProduct: false,
        findings: [],
        status: 'messaged',
        nextTouchAt: yesterday.toISOString(),
        touches: [],
        dealValue: 0,
        currency: 'RUB',
        tags: [],
        notes: '',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        name: 'Future Client',
        channelUrl: 'https://youtube.com/2',
        subscribers: 5000,
        niche: 'Gaming',
        tier: 2,
        score: 70,
        source: 'manual',
        email: null,
        telegram: '@future',
        instagram: null,
        website: null,
        hasProduct: false,
        findings: [],
        status: 'messaged',
        nextTouchAt: nextWeek.toISOString(),
        touches: [],
        dealValue: 0,
        currency: 'RUB',
        tags: [],
        notes: '',
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        name: 'Closed Client',
        channelUrl: 'https://youtube.com/3',
        subscribers: 10000,
        niche: 'Tech',
        tier: 1,
        score: 90,
        source: 'manual',
        email: null,
        telegram: '@closed',
        instagram: null,
        website: null,
        hasProduct: true,
        findings: [],
        status: 'closed',
        nextTouchAt: yesterday.toISOString(),
        touches: [],
        dealValue: 15000,
        currency: 'RUB',
        tags: [],
        notes: '',
        createdAt: new Date().toISOString(),
      },
    ];

    const due = getDueFollowUps(leads);
    expect(due.length).toBe(1);
    expect(due[0].id).toBe('1');
  });
});
