import {
  jsonResponse,
  errorResponse,
  handleOptions,
  checkDistributedRateLimit,
  validatePayloadSize,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';
import {
  detectProduct,
  extractContacts,
  calculateLeadScore,
} from './_shared/scoring';

interface SearchRequestBody {
  query: string;
  minSubs?: number;
  maxSubs?: number;
  relevanceLanguage?: string;
  regionCode?: string;
  maxDaysActive?: number;
  onlyWithProduct?: boolean;
  onlyWithEmail?: boolean;
  maxPages?: number;
}

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

interface YouTubeSearchItem {
  id: {
    channelId: string;
  };
}

interface YouTubeChannelItem {
  id: string;
  snippet?: {
    title: string;
    description: string;
    customUrl?: string;
    publishedAt: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
    country?: string;
  };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
}

interface YouTubePlaylistItem {
  snippet?: {
    publishedAt: string;
    title: string;
    description: string;
    resourceId?: {
      videoId: string;
    };
  };
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // 1.3 Проверка авторизации
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Метод не поддерживается. Используйте POST.', null, origin);
  }

  // Rate Limiting по IP (распределённый через Upstash Redis или in-memory)
  const clientIp =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    'anonymous';

  const rateCheck = await checkDistributedRateLimit(clientIp, 30, 60_000);
  if (!rateCheck.allowed) {
    return errorResponse(429, 'Слишком много поисковых запросов. Пожалуйста, подождите минуту.', null, origin);
  }

  // Проверка размера тела запроса (макс 32 КБ)
  const sizeValidation = validatePayloadSize(event.body, 32 * 1024);
  if (!sizeValidation.valid) {
    return errorResponse(400, sizeValidation.error || 'Слишком большой запрос', null, origin);
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse(
      400,
      'Ключ YOUTUBE_API_KEY не настроен в переменных окружения Netlify.',
      null,
      origin
    );
  }

  let body: SearchRequestBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Некорректный JSON в теле запроса.', null, origin);
  }

  const query = (body.query || '').trim();
  if (!query) {
    return errorResponse(400, 'Укажите поисковый запрос (нишу).', null, origin);
  }

  if (query.length > 200) {
    return errorResponse(400, 'Поисковый запрос слишком длинный (максимум 200 символов).', null, origin);
  }

  const minSubs = typeof body.minSubs === 'number' ? body.minSubs : 5000;
  const maxSubs = typeof body.maxSubs === 'number' ? body.maxSubs : 50000;
  const maxDaysActive = typeof body.maxDaysActive === 'number' ? body.maxDaysActive : 30;
  const maxPages = Math.min(Math.max(body.maxPages || 1, 1), 3); // limit to 1-3 to prevent quota drain
  const relevanceLanguage = body.relevanceLanguage && body.relevanceLanguage !== 'ALL' ? body.relevanceLanguage : undefined;
  const regionCode = body.regionCode && body.regionCode !== 'ALL' ? body.regionCode : undefined;

  let estimatedQuotaUsed = 0;

  try {
    const channelIds: string[] = [];
    let pageToken: string | undefined = undefined;

    // 1) search.list
    for (let page = 0; page < maxPages; page++) {
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('type', 'channel');
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('maxResults', '50');
      searchUrl.searchParams.set('key', apiKey);
      if (relevanceLanguage) searchUrl.searchParams.set('relevanceLanguage', relevanceLanguage);
      if (regionCode) searchUrl.searchParams.set('regionCode', regionCode);
      if (pageToken) searchUrl.searchParams.set('pageToken', pageToken);

      estimatedQuotaUsed += 100;
      const res = await fetchWithTimeout(searchUrl.toString(), {}, 8000);
      const data = await res.json();

      if (!res.ok) {
        if (data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
          return errorResponse(403, 'Закончилась дневная квота YouTube API (10 000 юнитов). Попробуйте завтра или используйте демо-данные.', { quotaUsed: estimatedQuotaUsed });
        }
        if (data?.error?.errors?.[0]?.reason === 'keyInvalid') {
          return errorResponse(401, 'Неверный API ключ YouTube. Проверьте переменную YOUTUBE_API_KEY в Netlify.', { quotaUsed: estimatedQuotaUsed });
        }
        return errorResponse(res.status, data?.error?.message || 'Ошибка поиска в YouTube API', data);
      }

      const items = (data.items || []) as YouTubeSearchItem[];
      for (const item of items) {
        if (item.id?.channelId && !channelIds.includes(item.id.channelId)) {
          channelIds.push(item.id.channelId);
        }
      }

      pageToken = data.nextPageToken;
      if (!pageToken || channelIds.length >= 50) break;
    }

    if (channelIds.length === 0) {
      return jsonResponse(200, {
        channels: [],
        quotaUsed: estimatedQuotaUsed,
        totalFound: 0,
      });
    }

    // 2) channels.list
    const channelDetailsUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    channelDetailsUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
    channelDetailsUrl.searchParams.set('id', channelIds.slice(0, 50).join(','));
    channelDetailsUrl.searchParams.set('key', apiKey);

    estimatedQuotaUsed += 1;
    const chRes = await fetchWithTimeout(channelDetailsUrl.toString(), {}, 8000);
    const chData = await chRes.json();

    if (!chRes.ok) {
      return errorResponse(chRes.status, chData?.error?.message || 'Ошибка получения информации о каналах');
    }

    const rawChannels = (chData.items || []) as YouTubeChannelItem[];

    // 3) Filter by subscriber range
    const filteredChannels = rawChannels.filter((c) => {
      const isHidden = Boolean(c.statistics?.hiddenSubscriberCount);
      if (isHidden) return true; // keep hidden with a flag
      const subs = parseInt(c.statistics?.subscriberCount || '0', 10);
      return subs >= minSubs && subs <= maxSubs;
    });

    const now = Date.now();
    const results = [];

    // 4) playlistItems.list for recent uploads & stats (up to 20 channels to conserve quota and time)
    const channelsToInspect = filteredChannels.slice(0, 20);

    for (const ch of channelsToInspect) {
      const snippet = ch.snippet || {
        title: '',
        description: '',
        customUrl: '',
        publishedAt: '',
        thumbnails: {},
      };
      const stats = ch.statistics || {
        viewCount: '0',
        subscriberCount: '0',
        hiddenSubscriberCount: false,
        videoCount: '0',
      };
      const subs = parseInt(stats.subscriberCount || '0', 10);
      const isHiddenSubs = Boolean(stats.hiddenSubscriberCount);
      const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;

      let lastVideo: {
        title: string;
        url: string;
        publishedAt: string;
      } | null = null;
      let daysSinceLastVideo: number | null = null;
      let frequencyPerMonth = 0;
      let videoDescriptions = '';

      if (uploadsPlaylistId) {
        try {
          const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
          playlistUrl.searchParams.set('part', 'snippet');
          playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
          playlistUrl.searchParams.set('maxResults', '5');
          playlistUrl.searchParams.set('key', apiKey);

          estimatedQuotaUsed += 1;
          const pRes = await fetchWithTimeout(playlistUrl.toString(), {}, 5000);
          if (pRes.ok) {
            const pData = await pRes.json();
            const videos = (pData.items || []) as YouTubePlaylistItem[];

            if (videos.length > 0) {
              const firstVid = videos[0]?.snippet;
              if (firstVid) {
                const vidId = firstVid.resourceId?.videoId || '';
                lastVideo = {
                  title: firstVid.title,
                  url: vidId ? `https://www.youtube.com/watch?v=${vidId}` : `https://www.youtube.com/channel/${ch.id}`,
                  publishedAt: firstVid.publishedAt,
                };
                const pubDate = new Date(firstVid.publishedAt).getTime();
                daysSinceLastVideo = Math.max(0, Math.floor((now - pubDate) / (1000 * 60 * 60 * 24)));
              }

              // Compute average frequency from up to 5 videos
              if (videos.length >= 2) {
                const oldest = new Date(videos[videos.length - 1].snippet?.publishedAt || 0).getTime();
                const newest = new Date(videos[0].snippet?.publishedAt || 0).getTime();
                const spanDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
                frequencyPerMonth = Number(((videos.length / spanDays) * 30).toFixed(1));
              } else {
                frequencyPerMonth = 1;
              }

              // Collect video descriptions for regex extraction
              videoDescriptions = videos.map((v) => v.snippet?.description || '').join(' ');
            }
          }
        } catch {
          // Playlist fetch failed, continue with channel info
        }
      }

      // Check activity filter
      if (maxDaysActive && daysSinceLastVideo !== null && daysSinceLastVideo > maxDaysActive) {
        continue;
      }

      // Aggregate texts for contacts & product keywords
      const combinedText = `${snippet.description || ''} ${videoDescriptions}`;
      const contacts = extractContacts(combinedText);
      const hasProduct = detectProduct(combinedText);

      // Filters
      if (body.onlyWithProduct && !hasProduct) continue;
      if (body.onlyWithEmail && !contacts.email) continue;

      const { score, tier } = calculateLeadScore({
        subscribers: subs,
        hiddenSubscribers: isHiddenSubs,
        hasProduct,
        hasEmail: Boolean(contacts.email),
        hasTelegramOrInstagram: Boolean(contacts.telegram || contacts.instagram),
        daysSinceLastVideo,
        frequencyPerMonth,
      });

      const avatar =
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.default?.url ||
        '';

      const customHandle = snippet.customUrl ? (snippet.customUrl.startsWith('@') ? snippet.customUrl : `@${snippet.customUrl}`) : '';
      const channelUrl = customHandle ? `https://www.youtube.com/${customHandle}` : `https://www.youtube.com/channel/${ch.id}`;

      results.push({
        id: `yt_${ch.id}`,
        channelId: ch.id,
        name: snippet.title || 'Без названия',
        channelUrl,
        avatar,
        subscribers: subs,
        hiddenSubscribers: isHiddenSubs,
        niche: query,
        tier,
        score,
        source: 'YouTube Search',
        email: contacts.email,
        telegram: contacts.telegram,
        instagram: contacts.instagram,
        website: contacts.website,
        hasProduct,
        lastVideo,
        daysSinceLastVideo,
        frequencyPerMonth,
        description: (snippet.description || '').slice(0, 300),
      });
    }

    // Sort by score descending by default
    results.sort((a, b) => b.score - a.score);

    return jsonResponse(
      200,
      {
        channels: results,
        quotaUsed: estimatedQuotaUsed,
        totalFound: results.length,
      },
      origin
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка при поиске на YouTube';
    return errorResponse(500, `Внутренняя ошибка сервиса: ${msg}`, { quotaUsed: estimatedQuotaUsed }, origin);
  }
}
