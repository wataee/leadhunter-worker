import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handler as ingestHandler, resetMemoryUpworkJobsForTests, type HandlerEvent } from '../../netlify/functions/upwork-ingest';
import { resetMemoryUpworkEmailJobsForTests } from '../../netlify/functions/upwork-email';
import { calculateConnectsRoi } from '../shared/upwork.js';

describe('Task 2: Reliable Upwork Ingest & Telegram Delivery Suite', () => {
  const originalEnv = { ...process.env };
  const VALID_SECRET = 'secret_webhook_super_secure_key_12345';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_PASSWORD = 'test_app_password_1234567890';
    process.env.APP_SESSION_SECRET = 'test_session_secret_32_characters_long_123456';
    process.env.WEBHOOK_SECRET = VALID_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    process.env.TELEGRAM_CHAT_ID = '987654321';
    resetMemoryUpworkJobsForTests();
    resetMemoryUpworkEmailJobsForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Security: isSecretAuthorized checks', () => {
    it('rejects requests with secret shorter than 16 chars', async () => {
      process.env.WEBHOOK_SECRET = 'short';
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: { 'x-webhook-secret': 'short' },
        body: JSON.stringify({
          title: 'Looking for a video editor',
          description: 'Need an editor to cut video',
          skipTranslation: true,
        }),
      };
      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(401);
    });

    it('rejects secret passed in query parameter (forbidden for security)', async () => {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: {},
        queryStringParameters: { secret: VALID_SECRET },
        body: JSON.stringify({
          title: 'Looking for a video editor',
          description: 'Need an editor to cut video',
          skipTranslation: true,
        }),
      };
      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(401);
    });

    it('accepts valid secret via X-Webhook-Secret header', async () => {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: { 'x-webhook-secret': VALID_SECRET },
        body: JSON.stringify({
          title: 'Looking for YouTube video editor for weekly episodes',
          description: 'Need a video editor to edit weekly 10-minute videos. $150 per video.',
          saveToFeed: false,
          notifyTelegram: false,
          skipTranslation: true,
        }),
      };
      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
    });
  });

  describe('2. English filter on incoming Upwork jobs', () => {
    it('filters out full-time staff jobs with monthly salary', async () => {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: { 'x-webhook-secret': VALID_SECRET },
        body: JSON.stringify({
          title: 'Hiring full-time video editor in-house',
          description: 'Looking for a dedicated full-time editor, 40 hours per week, monthly salary $1500/month.',
          saveToFeed: false,
          notifyTelegram: false,
          skipTranslation: true,
        }),
      };
      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.filtered).toBe(true);
      expect(data.reason).toMatch(/hard_stop_fulltime|Штат/i);
    });

    it('accepts genuine project-based gig jobs', async () => {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: { 'x-webhook-secret': VALID_SECRET },
        body: JSON.stringify({
          title: 'One-time gig: looking for a video editor to cut event recap',
          description: 'Looking for a video editor to cut a 3-minute event recap. Budget: $200. Send portfolio.',
          saveToFeed: false,
          notifyTelegram: false,
          skipTranslation: true,
        }),
      };
      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
      expect(data.filtered).toBeUndefined();
      expect(data.vacancy?.id).toBeDefined();
    });
  });

  describe('3. Honest ROI for new clients with incomplete data', () => {
    it('flags new clients with spent=$0 and hires=0 as incomplete data rather than high ROI', () => {
      const newClientRoi = calculateConnectsRoi({
        title: 'Looking for video editor for 5 YouTube shorts',
        description: 'Edit 5 vertical videos.',
        clientPaymentVerified: false,
        clientTotalSpent: 0,
        clientHireRate: 0,
        proposalsCount: 4,
        connectsRequired: 6,
      });

      expect(newClientRoi.badgeTextRu).toContain('Новый клиент (неполные данные)');
      expect(newClientRoi.recommendation).toBe('caution');
      expect(newClientRoi.roiScore).toBeLessThanOrEqual(45);
      expect(newClientRoi.redFlags.some((f: string) => f.includes('Новый клиент'))).toBe(true);
    });
  });

  describe('4. Telegram notifications & Error Handling', () => {
    it('warns and gracefully returns if Telegram credentials are not set', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;

      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: { 'x-webhook-secret': VALID_SECRET },
        body: JSON.stringify({
          title: 'Looking for YouTube video editor for podcast',
          description: 'Need an editor to edit weekly episodes for our podcast. $100 per video.',
          saveToFeed: false,
          notifyTelegram: true,
          skipTranslation: true,
        }),
      };

      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.telegram.sent).toBe(false);
      expect(data.telegram.reason).toBe('missing_credentials');
    });
  });
});
