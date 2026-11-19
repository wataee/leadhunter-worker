import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  handler as crmSyncHandler,
  resetMemoryCrmStateForTests,
} from '../../netlify/functions/crm-sync';
import {
  handler as upworkIngestHandler,
  resetMemoryUpworkJobsForTests,
} from '../../netlify/functions/upwork-ingest';
import {
  handler as redditFeedHandler,
  resetRedditFeedCacheForTests,
} from '../../netlify/functions/reddit-feed';
import { signSessionToken } from '../../netlify/functions/_shared/auth';
import { RedditSource } from '../sources/RedditSource';

const WEBHOOK_SECRET = 'test_webhook_secret_at_least_32_chars_long';
const TEST_APP_PASSWORD = 'test_admin_password_123';
const TEST_SESSION_SECRET = 'test_session_secret_at_least_32_chars_long';

describe('Cloud CRM Sync, Upwork Ingest, Reddit Feed & Chrome Extension Suite', () => {
  const prevSecret = process.env.WEBHOOK_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAppPassword = process.env.APP_PASSWORD;
  const prevSessionSecret = process.env.APP_SESSION_SECRET;
  const originalFetch = globalThis.fetch;
  let authCookie = '';

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.APP_PASSWORD = TEST_APP_PASSWORD;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;
    authCookie = `lh_session=${encodeURIComponent(signSessionToken().token)}`;
    resetMemoryCrmStateForTests();
    resetMemoryUpworkJobsForTests();
    resetRedditFeedCacheForTests();
  });

  afterEach(() => {
    process.env.WEBHOOK_SECRET = prevSecret;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.APP_PASSWORD = prevAppPassword;
    process.env.APP_SESSION_SECRET = prevSessionSecret;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('crm-sync enforces auth and merges desktop & mobile leads by newest updatedAt', async () => {
    const unauthRes = await crmSyncHandler({
      httpMethod: 'GET',
      headers: { host: 'localhost:8888' },
      body: null,
    });
    expect(unauthRes.statusCode).toBe(401);

    // Device 1 pushes lead A and lead B
    const res1 = await crmSyncHandler({
      httpMethod: 'POST',
      headers: { host: 'localhost:8888', cookie: authCookie },
      body: JSON.stringify({
        leads: [
          {
            id: 'lead_1',
            name: 'Client A',
            channelUrl: 'https://t.me/client_a',
            status: 'new',
            updatedAt: '2026-11-18T01:00:00.000Z',
            touches: [],
            findings: [],
          },
          {
            id: 'lead_2',
            name: 'Client B',
            channelUrl: 'https://t.me/client_b',
            status: 'new',
            updatedAt: '2026-11-18T01:00:00.000Z',
            touches: [],
            findings: [],
          },
        ],
        hiddenChannels: ['@spam_chan'],
        deletedLeadIds: [],
      }),
    });
    expect(res1.statusCode).toBe(200);
    const data1 = JSON.parse(res1.body);
    expect(data1.state.leads).toHaveLength(2);
    expect(data1.state.hiddenChannels).toContain('spam_chan');

    // Device 2 updates lead_1 on mobile and deletes lead_2
    const res2 = await crmSyncHandler({
      httpMethod: 'POST',
      headers: { host: 'localhost:8888', cookie: authCookie },
      body: JSON.stringify({
        leads: [
          {
            id: 'lead_1',
            name: 'Client A',
            channelUrl: 'https://t.me/client_a',
            status: 'replied',
            updatedAt: '2026-11-18T03:00:00.000Z',
            touches: [{ id: 't1', at: '2026-11-18T03:00:00.000Z', channel: 'Telegram', note: 'DM sent' }],
            findings: [],
          },
        ],
        deletedLeadIds: ['lead_2'],
      }),
    });
    const data2 = JSON.parse(res2.body);
    expect(data2.state.leads).toHaveLength(1);
    expect(data2.state.leads[0].status).toBe('replied');
    expect(data2.state.leads[0].touches).toHaveLength(1);

    // GET retrieves synced cloud snapshot
    const res3 = await crmSyncHandler({
      httpMethod: 'GET',
      headers: { host: 'localhost:8888', cookie: authCookie },
      body: null,
    });
    const data3 = JSON.parse(res3.body);
    expect(data3.state.leads).toHaveLength(1);
    expect(data3.state.leads[0].id).toBe('lead_1');
  });

  it('upwork-ingest scores job, builds 200-char hook proposal, and persists into Upwork feed', async () => {
    const postRes = await upworkIngestHandler({
      httpMethod: 'POST',
      headers: {
        origin: 'chrome-extension://abcdefghijklmnop',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        title: 'AI Podcast YouTube Editor',
        description: 'Need a weekly YouTube podcast & Shorts editor in Premiere Pro. $500 per episode.',
        url: 'https://www.upwork.com/jobs/~01upworkdemo',
        connectsRequired: 12,
        clientPaymentVerified: true,
        clientHireRate: 75,
        clientTotalSpent: 8000,
        proposalsCount: 6,
        questions: ['Share 2 podcast editing samples.'],
        skipTranslation: true,
      }),
    });

    expect(postRes.statusCode).toBe(200);
    expect(postRes.headers['Access-Control-Allow-Origin']).toBe('chrome-extension://abcdefghijklmnop');
    const parsed = JSON.parse(postRes.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.roi.roiScore).toBeGreaterThanOrEqual(75);
    expect(parsed.proposal.previewAnalysis.hasLinkInPreview).toBe(true);
    expect(parsed.proposal.screeningAnswers).toHaveLength(1);
    expect(parsed.vacancy.sourcePlatform).toBe('upwork');

    const getRes = await upworkIngestHandler({
      httpMethod: 'GET',
      headers: { host: 'localhost:8888', cookie: authCookie },
      body: null,
    });
    const listData = JSON.parse(getRes.body);
    expect(listData.items).toHaveLength(1);
    expect(listData.items[0].upworkMeta.roiScore).toBe(parsed.roi.roiScore);
  });

  it('reddit-feed & RedditSource fetch and filter [Hiring] jobs cleanly without real network', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              children: [
                {
                  data: {
                    id: 'r99',
                    subreddit: 'forhire',
                    author: 'uk_agency',
                    title: '[Hiring] Reels & Shorts Video Editor (€1200/month)',
                    selftext: 'Looking for experienced Premiere Pro editor for vertical reels.',
                    permalink: '/r/forhire/comments/r99/hiring_reels_editor/',
                    created_utc: Math.floor(Date.now() / 1000) - 3600,
                    score: 8,
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const adapter = new RedditSource();
    const raw = await adapter.fetchItems();
    expect(raw).toHaveLength(1);
    expect(raw[0].source).toBe('reddit');

    const feedRes = await redditFeedHandler({
      httpMethod: 'GET',
      headers: { host: 'localhost:8888', cookie: authCookie },
    });
    expect(feedRes.statusCode).toBe(200);
    const data = JSON.parse(feedRes.body);
    expect(data.ok).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].sourcePlatform).toBe('reddit');
    expect(data.items[0].formatTag).toBe('short');
  });

  it('chrome-extension Manifest V3 files exist and follow safety constraints', () => {
    const extDir = path.resolve(process.cwd(), '..', 'chrome-extension');
    const manifestPath = path.join(extDir, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain('tabs');
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.icons).toBeUndefined();
    expect(fs.existsSync(path.join(extDir, manifest.background.service_worker))).toBe(true);
    expect(fs.existsSync(path.join(extDir, manifest.action.default_popup))).toBe(true);
    expect(fs.existsSync(path.join(extDir, manifest.content_scripts[0].js[0]))).toBe(true);
  });
});
