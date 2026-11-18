/* global fetch, AbortSignal */
/**
 * Free Reddit [Hiring] job fetcher & filter for EU / US video editing leads.
 * Targets creator-heavy subreddits using Reddit's public JSON endpoints with zero API keys.
 */

export const REDDIT_HIRING_SUBREDDITS = [
  'forhire',
  'CreatorServices',
  'VideoEditing',
  'DoneDirtCheap',
  'YouTubeEditors',
  'HungryArtists',
];

const FOR_HIRE_REGEX = /(?:\[\s*for\s*hire\s*\]|^for\s+hire\b|\boffering\s+my\b|\bi['’]?m\s+a\s+video\s+editor\b|\bportfolio\s+below\b)/i;
const HIRING_SIGNAL_REGEX = /(?:\[\s*hiring\s*\]|\bhiring\b|\blooking\s+for\b|\bneed\s+(?:a|an)\b|\bseeking\s+(?:a|an)\b)/i;
const VIDEO_EDITING_REGEX = /\b(video\s*edit(?:or|ing)?|reels|shorts|tiktok|youtube\s*(?:editor|video|channel)|premiere\s*pro|after\s*effects|davinci\s*resolve|capcut|motion\s*graphic(?:s)?|vfx|podcast\s*edit(?:or|ing)?|color\s*grad(?:e|ing)|short[\s-]*form|long[\s-]*form|talking[\s-]*head|faceless\s*(?:channel|video))\b/i;

/**
 * Checks whether a Reddit submission is a genuine video-editing [Hiring] job.
 * @param {{ title?: string; selftext?: string; link_flair_text?: string }} post
 * @returns {boolean}
 */
export function isRedditHiringPost(post) {
  if (!post || typeof post !== 'object') return false;
  const title = String(post.title || '').trim();
  const selftext = String(post.selftext || '').trim();
  const flair = String(post.link_flair_text || '').trim();

  if (!title) return false;
  const titleAndFlair = `${flair} ${title}`;

  // Reject [For Hire] / self-promotion posts strictly
  if (FOR_HIRE_REGEX.test(titleAndFlair)) {
    return false;
  }
  if (/^\s*\[?\s*for\s*hire\s*\]?/i.test(selftext)) {
    return false;
  }

  // Must express hiring intent in title or flair
  if (!HIRING_SIGNAL_REGEX.test(titleAndFlair)) {
    return false;
  }

  // Must relate to video editing / YouTube / Reels / Shorts / Motion
  const combined = `${title}\n${selftext}`;
  return VIDEO_EDITING_REGEX.test(combined);
}

/**
 * Converts a Reddit post payload into LeadHunter RawSourceItem format.
 * @param {object} post
 */
export function normalizeRedditPost(post) {
  const title = String(post.title || '').trim();
  const selftext = String(post.selftext || '').trim();
  const subreddit = String(post.subreddit || 'forhire').trim();
  const author = String(post.author || 'redditor').trim();
  const permalink = String(post.permalink || '').trim();

  const fullUrl = permalink.startsWith('/')
    ? `https://www.reddit.com${permalink}`
    : post.url && /^https?:\/\//i.test(post.url)
    ? post.url
    : `https://www.reddit.com/r/${subreddit}`;

  const createdSec = Number(post.created_utc || 0);
  const publishedAt =
    createdSec > 0
      ? new Date(createdSec * 1000).toISOString()
      : new Date().toISOString();

  const text = [title, selftext].filter(Boolean).join('\n\n').slice(0, 1800);

  return {
    id: `reddit_${String(post.id || Date.now())}`,
    source: 'reddit',
    channelOrAuthor: `r/${subreddit} (u/${author})`,
    text,
    url: fullUrl,
    publishedAt,
    views: post.score != null ? `▲ ${post.score}` : undefined,
  };
}

/**
 * Fetches recent [Hiring] video editor posts from Reddit public JSON search API.
 * Includes clean fallback when combined search is throttled.
 * @param {{ subreddits?: string[]; limit?: number; timeoutMs?: number; fetchFn?: typeof fetch }} [options]
 */
export async function fetchRedditHiringPosts(options = {}) {
  const subreddits =
    Array.isArray(options.subreddits) && options.subreddits.length > 0
      ? options.subreddits
      : REDDIT_HIRING_SUBREDDITS;
  const limit = Math.min(60, Math.max(10, Number(options.limit || 40)));
  const timeoutMs = Number(options.timeoutMs || 6000);
  const fetchImpl = options.fetchFn || fetch;

  const headers = {
    'User-Agent': 'LeadHunter-VideoEditor-Bot/1.0 (by /u/fleur_editor)',
    Accept: 'application/json',
  };

  const rawPosts = [];
  const multiPath = subreddits.join('+');
  const query = encodeURIComponent(
    '(flair:hiring OR title:hiring) AND ("video editor" OR "video editing" OR reels OR shorts OR youtube OR premiere OR davinci)'
  );
  const searchUrl = `https://www.reddit.com/r/${multiPath}/search.json?q=${query}&restrict_sr=1&sort=new&t=week&limit=${limit}&raw_json=1`;

  try {
    const res = await fetchImpl(searchUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const json = await res.json();
      const children = json?.data?.children || [];
      for (const child of children) {
        if (child?.data) rawPosts.push(child.data);
      }
    }
  } catch {
    // Fall back to direct subreddit /new.json feeds below
  }

  // Fallback on top 3 core hiring subreddits if search returned empty
  if (rawPosts.length === 0) {
    const fallbackSubs = subreddits.slice(0, 3);
    const results = await Promise.allSettled(
      fallbackSubs.map(async (sub) => {
        const url = `https://www.reddit.com/r/${sub}/new.json?limit=25&raw_json=1`;
        const res = await fetchImpl(url, {
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return [];
        const json = await res.json();
        return (json?.data?.children || []).map((c) => c?.data).filter(Boolean);
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        rawPosts.push(...r.value);
      }
    }
  }

  const seenIds = new Set();
  const normalized = [];

  for (const post of rawPosts) {
    if (!post || !post.id || seenIds.has(post.id)) continue;
    seenIds.add(post.id);
    if (!isRedditHiringPost(post)) continue;
    normalized.push(normalizeRedditPost(post));
  }

  return normalized.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
