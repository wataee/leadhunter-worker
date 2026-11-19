import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateInstagramLeadScore,
  generateInstagramPitch,
  handler as instagramSearchHandler,
} from '../../netlify/functions/instagram-search';
import { matchPortfolioDeepLink } from '../shared/portfolioMatcher';

describe('Task 4: Instagram Client Prospecting & Outreach Suite', () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = 'TestPassword123!';
    process.env.APP_SESSION_SECRET = 'TestSessionSecret1234567890123456';
  });

  describe('1. Instagram Lead Scoring Model', () => {
    it('scores high-value active expert with product & contacts as Tier 1', () => {
      const scoring = calculateInstagramLeadScore({
        followersCount: 28000,
        mediaCount: 150,
        daysSinceLastReel: 3,
        hasContacts: true,
        hasProduct: true,
        bio: 'Эксперт по недвижимости. Обучение и консалтинг. Сотрудничество: t.me/pro_realty',
      });

      expect(scoring.score).toBeGreaterThanOrEqual(80);
      expect(scoring.tier).toBe(1);
      expect(scoring.reasons.some((r) => r.includes('Идеальный размер аудитории'))).toBe(true);
      expect(scoring.reasons.some((r) => r.includes('Высокая свежая активность'))).toBe(true);
    });

    it('penalizes inactive profiles with no reels in last 3 weeks', () => {
      const scoring = calculateInstagramLeadScore({
        followersCount: 1500,
        mediaCount: 10,
        daysSinceLastReel: 35,
        hasContacts: false,
        hasProduct: false,
        bio: 'Just personal blog',
      });

      expect(scoring.score).toBeLessThanOrEqual(40);
      expect(scoring.tier).toBe(3);
      expect(scoring.reasons.some((r) => r.includes('Нет публикаций более 3 недель'))).toBe(true);
    });
  });

  describe('2. Personalized Pitch Generator', () => {
    it('generates tailored pitch with portfolio deep-link for Kazakhstan leads', () => {
      const mockProfile = {
        username: 'almaty_realestate',
        fullName: 'Даулет Мусин | Недвижимость Алматы',
        biography: 'Элитная недвижимость Алматы',
        followersCount: 22000,
        followsCount: 200,
        mediaCount: 120,
        externalUrl: 'https://taplink.cc/musin',
        profilePicUrl: 'https://example.com/pic.jpg',
        region: 'KZ' as const,
        niche: 'Недвижимость & Инвестиции',
        recentReels: [
          {
            caption: 'Обзор виллы в Алматы',
            publishedAt: new Date().toISOString(),
            viewsCount: 25000,
            url: 'https://instagram.com/reel/123',
          },
        ],
      };

      const portfolio = matchPortfolioDeepLink({
        text: 'Недвижимость Алматы элитные виллы',
        channelOrNiche: 'Недвижимость & Инвестиции',
        region: 'KZ',
        lang: 'ru',
      });

      const pitch = generateInstagramPitch(mockProfile, portfolio);

      expect(pitch).toContain('Даулет');
      expect(pitch).toContain('Недвижимость & Инвестиции');
      expect(pitch).toContain(portfolio.url);
      expect(pitch).toContain('пробный рилс');
    });

    it('generates professional English pitch for US/EU B2B founders', () => {
      const mockProfile = {
        username: 'london_ai_saas',
        fullName: 'Alexander Wright | SaaS Founder',
        biography: 'Building B2B AI tooling in London',
        followersCount: 35000,
        followsCount: 300,
        mediaCount: 110,
        externalUrl: 'https://wright.ai',
        profilePicUrl: 'https://example.com/pic.jpg',
        region: 'EU' as const,
        niche: 'Fintech, AI & SaaS',
        recentReels: [
          {
            caption: 'Scaling B2B AI models',
            publishedAt: new Date().toISOString(),
            viewsCount: 40000,
            url: 'https://instagram.com/reel/456',
          },
        ],
      };

      const portfolio = matchPortfolioDeepLink({
        text: 'AI fintech saas startup video podcast',
        channelOrNiche: 'Fintech, AI & SaaS',
        region: 'EU',
        lang: 'en',
      });

      const pitch = generateInstagramPitch(mockProfile, portfolio);

      expect(pitch).toContain('Alexander');
      expect(pitch).toContain('Fintech, AI & SaaS');
      expect(pitch).toContain(portfolio.url);
      expect(pitch).toContain('free sample Reel');
    });
  });

  describe('3. Instagram Search Netlify Function', () => {
    it('rejects unauthorized requests with 401', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ query: 'недвижимость' }),
      };

      const res = await instagramSearchHandler(event);
      expect(res.statusCode).toBe(401);
    });

    it('returns structured leads adhering to Finder pipeline for valid search', async () => {
      // Mock cookie authorization
      const { signSessionToken } = await import('../../netlify/functions/_shared/auth');
      const { token } = signSessionToken();

      const event = {
        httpMethod: 'POST',
        headers: {
          cookie: `lh_session=${token}`,
        },
        body: JSON.stringify({
          query: 'недвижимость алматы',
          regionCode: 'KZ',
          minSubs: 5000,
          maxSubs: 50000,
        }),
      };

      const res = await instagramSearchHandler(event);
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(data.channels).toBeDefined();
      expect(data.channels.length).toBeGreaterThan(0);

      const first = data.channels[0];
      expect(first.source).toBe('instagram');
      expect(first.tier).toBeDefined();
      expect(first.score).toBeGreaterThan(50);
      expect(first.channelUrl).toContain('instagram.com');
      expect(first.aiAngle).toBeDefined(); // ready personal pitch
    });
  });
});
