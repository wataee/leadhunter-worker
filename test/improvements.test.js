import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchPortfolioDeepLink } from '../web/src/shared/portfolioMatcher.js';
import { extractDirectTelegramHandle, buildReadyTelegramPitch } from '../web/src/shared/telegramAlert.js';
import { isRedditHiringPost, normalizeRedditPost, fetchRedditHiringPosts } from '../web/src/shared/reddit.js';
import {
  calculateConnectsRoi,
  analyzeUpworkPreviewHook,
  generateUpworkProposal,
  parseUpworkPastedText,
} from '../web/src/shared/upwork.js';

describe('Improvement #2: Smart Portfolio Deep-Link Matcher', () => {
  it('routes AI/Crypto/SaaS jobs to finance niche on English portfolio', () => {
    const res = matchPortfolioDeepLink({
      text: 'Looking for a YouTube video editor for our AI SaaS & crypto explainer channel',
      region: 'US',
      lang: 'en',
    });
    assert.equal(res.niche, 'finance');
    assert.match(res.url, /^https:\/\/fleur-editor\.netlify\.app\/\?niche=finance#work$/);
  });

  it('routes Shorts/Reels jobs in Kazakhstan (Russian/Kazakh) to localized deep-links', () => {
    const kzRes = matchPortfolioDeepLink({
      text: 'Алматыда reels пен shorts монтаждайтын мобилограф керек',
      region: 'KZ',
      lang: 'kk',
    });
    assert.equal(kzRes.format, 'vertical');
    assert.match(kzRes.url, /^https:\/\/fleur-editor\.netlify\.app\/kz\/\?format=vertical#work$/);

    const ruKzRes = matchPortfolioDeepLink({
      text: 'Ищем монтажера на подкаст и интервью в Астане',
      region: 'KZ',
      lang: 'ru',
    });
    assert.equal(ruKzRes.niche, 'personal_brand');
    assert.match(ruKzRes.url, /^https:\/\/fleur-editor\.netlify\.app\/ru\/\?niche=personal_brand#work$/);
  });

  it('respects explicit category override', () => {
    const res = matchPortfolioDeepLink({
      text: 'Generic request',
      region: 'EU',
      lang: 'en',
      overrideCategory: 'real_estate',
    });
    assert.equal(res.niche, 'real_estate');
    assert.match(res.url, /niche=real_estate#work$/);
  });
});

describe('Improvement #3: Speed-to-Lead Ready Telegram Pitch', () => {
  it('extracts direct client handle while ignoring bots and self channel', () => {
    const handle = extractDirectTelegramHandle(
      'Join @SomeChannelBot or @broadcast_chan. Send portfolio to @alex_creator for Reels editing.',
      '@broadcast_chan'
    );
    assert.equal(handle, 'alex_creator');
  });

  it('generates ready English pitch with deep-link and t.me prefill URL for US/EU jobs', () => {
    const pitch = buildReadyTelegramPitch({
      text: 'Looking for a Reels & Shorts video editor in Premiere Pro, budget $35/short. DM @kate_founder',
      channel: '@videojobs_global',
      region: 'US',
    });
    assert.equal(pitch.directHandle, 'kate_founder');
    assert.ok(pitch.directWriteUrl?.startsWith('https://t.me/kate_founder?text='));
    assert.ok(pitch.pitchText.includes('format=vertical'));
    assert.match(pitch.pitchText, /fleur-editor\.netlify\.app/);
  });

  it('generates ready Russian pitch for KZ posts', () => {
    const pitch = buildReadyTelegramPitch({
      text: 'Ищем монтажера на подкаст в Алматы, оплата 250 000 тг/мес. Писать @arman_kz',
      channel: '@almaty_rabota',
      region: 'KZ',
    });
    assert.match(pitch.pitchText, /Примеры похожих работ:/);
    assert.ok(pitch.pitchText.includes('/ru/?niche=personal_brand#work'));
  });
});

describe('Improvement #5: Reddit [Hiring] Filter & Adapter Logic', () => {
  it('accepts valid [Hiring] video editing posts and rejects [For Hire] spam', () => {
    assert.equal(
      isRedditHiringPost({
        title: '[Hiring] Need YouTube documentary video editor ($200/video)',
        selftext: 'Must know Premiere Pro and After Effects.',
      }),
      true
    );

    assert.equal(
      isRedditHiringPost({
        title: '[For Hire] Experienced video editor for Reels & YouTube',
        selftext: 'Offering my services at $20/hr.',
      }),
      false
    );

    assert.equal(
      isRedditHiringPost({
        title: '[Hiring] Need Logo Graphic Designer',
        selftext: 'Looking for Illustrator vector logo only.',
      }),
      false
    );
  });

  it('normalizes Reddit post payload & fetches via custom fetchFn cleanly', async () => {
    const item = normalizeRedditPost({
      id: 'abc123',
      subreddit: 'forhire',
      author: 'startup_joe',
      title: '[Hiring] SaaS explainer video editor',
      selftext: '$300 fixed budget',
      permalink: '/r/forhire/comments/abc123/hiring_saas_editor/',
      created_utc: 1700000000,
      score: 12,
    });
    assert.equal(item.id, 'reddit_abc123');
    assert.equal(item.source, 'reddit');
    assert.equal(item.channelOrAuthor, 'r/forhire (u/startup_joe)');
    assert.equal(item.url, 'https://www.reddit.com/r/forhire/comments/abc123/hiring_saas_editor/');

    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        data: {
          children: [
            {
              data: {
                id: 'good1',
                subreddit: 'VideoEditing',
                author: 'creator1',
                title: '[Hiring] Short form TikTok video editor ($40/video)',
                selftext: 'Weekly batch of 5 shorts.',
                permalink: '/r/VideoEditing/comments/good1/test/',
                created_utc: 1700001000,
              },
            },
            {
              data: {
                id: 'bad1',
                subreddit: 'VideoEditing',
                author: 'editor_spam',
                title: '[For Hire] Video editor available',
                selftext: 'DM me',
                permalink: '/r/VideoEditing/comments/bad1/test/',
                created_utc: 1700000500,
              },
            },
          ],
        },
      }),
    });

    const fetched = await fetchRedditHiringPosts({ fetchFn: mockFetch });
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].id, 'reddit_good1');
  });
});

describe('Upwork Copilot Engine: ROI, 200-char Preview Hook & Proposal Generator', () => {
  it('scores high-quality verified clients as apply_now and flags spam/low-hire jobs as skip', () => {
    const goodRoi = calculateConnectsRoi({
      title: 'Weekly YouTube AI Video Editor',
      description: 'Looking for Premiere & After Effects pro.',
      clientPaymentVerified: true,
      clientHireRate: 72,
      clientTotalSpent: 15000,
      clientAvgHourlyRate: 30,
      proposalsCount: 6,
      connectsRequired: 12,
    });
    assert.ok(goodRoi.roiScore >= 75);
    assert.equal(goodRoi.recommendation, 'apply_now');

    const badRoi = calculateConnectsRoi({
      title: 'Need free sample edit first',
      description: '100 videos for $50 total, unpaid test required.',
      clientPaymentVerified: false,
      clientHireRate: 10,
      clientTotalSpent: 0,
      clientAvgHourlyRate: 4,
      proposalsCount: 55,
      connectsRequired: 24,
    });
    assert.ok(badRoi.roiScore < 38);
    assert.equal(badRoi.recommendation, 'skip');
    assert.ok(badRoi.redFlags.length >= 4);
  });

  it('puts portfolio deep-link inside first 200 chars and catches fluff openings', () => {
    const fluffy = analyzeUpworkPreviewHook(
      'Hi, my name is John and I have 5 years of experience offering my video editing services. I hope this message finds you well.'
    );
    assert.equal(fluffy.hasFluffOpening, true);
    assert.ok(fluffy.warnings.length >= 2);

    const parsed = parseUpworkPastedText(`AI SaaS Explainer Video Editor
Payment method verified | 65% hire rate | $12K total spent | $28/hr avg hourly rate
Send a proposal for: 16 Connects
Proposals: 5 to 10
You will be asked to answer the following questions:
1. Share similar AI or tech videos.
2. How fast can you deliver a 10-minute cut?`);

    assert.equal(parsed.connectsRequired, 16);
    assert.equal(parsed.clientHireRate, 65);
    assert.equal(parsed.clientTotalSpent, 12000);
    assert.equal(parsed.clientPaymentVerified, true);
    assert.equal(parsed.proposalsCount, 7);
    assert.equal(parsed.questions?.length, 2);

    const bundle = generateUpworkProposal(parsed, { name: 'Timur' });
    assert.equal(bundle.previewAnalysis.hasFluffOpening, false);
    assert.equal(bundle.previewAnalysis.hasLinkInPreview, true);
    assert.ok(bundle.coverLetter.slice(0, 200).includes('fleur-editor.netlify.app'));
    assert.equal(bundle.screeningAnswers.length, 2);
    assert.match(bundle.loomScript, /0:00-0:10/);
  });
});
