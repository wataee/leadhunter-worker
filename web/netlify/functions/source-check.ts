import { jsonResponse, handleOptions, type NetlifyResponse } from './_shared/response';
import { requireAuth } from './_shared/auth';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  body?: string | null;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

function cleanHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseSubscribers(raw: string): number {
  const clean = raw.replace(/\s+/g, '').replace(/,/g, '.');
  const kMatch = clean.match(/([\d.]+)K/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = clean.match(/([\d.]+)M/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  const digits = clean.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // Auth check
  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return jsonResponse(401, { error: 'Необходима авторизация' }, origin);
  }

  let username = '';
  if (event.httpMethod === 'GET') {
    username = (event.queryStringParameters?.username || '').trim();
  } else if (event.httpMethod === 'POST') {
    try {
      const data = JSON.parse(event.body || '{}');
      username = (data.username || '').trim();
    } catch {
      return jsonResponse(400, { error: 'Невалидный JSON запрос' }, origin);
    }
  }

  username = username.replace(/^@/, '').toLowerCase().trim();

  if (!username || !USERNAME_REGEX.test(username)) {
    return jsonResponse(
      400,
      { error: 'Юзернейм должен содержать от 5 до 32 символов (a-z, 0-9, _)' },
      origin
    );
  }

  try {
    const previewUrl = `https://t.me/s/${username}`;
    const previewRes = await fetch(previewUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const previewHtml = await previewRes.text();
    const hasPreviewPosts = previewHtml.includes('tgme_widget_message');

    // Title parsing
    const titleMatch = previewHtml.match(
      /<div class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i
    );
    const title = titleMatch ? cleanHtml(titleMatch[1]) : `@${username}`;

    // Description parsing
    const descMatch = previewHtml.match(
      /<div class="tgme_page_description"[^>]*>([\s\S]*?)<\/div>/i
    );
    const description = descMatch ? cleanHtml(descMatch[1]) : '';

    // Extra / subscribers
    const extraMatch = previewHtml.match(
      /<div class="tgme_page_extra"[^>]*>([\s\S]*?)<\/div>/i
    );
    const extraRaw = extraMatch ? cleanHtml(extraMatch[1]) : '';
    const subscribers = parseSubscribers(extraRaw);

    if (hasPreviewPosts) {
      // Check last post date
      const timeMatches = [...previewHtml.matchAll(/datetime="([^"]+)"/g)];
      let daysSinceLast = 999;
      let lastPostAt: string | undefined;

      if (timeMatches.length > 0) {
        lastPostAt = timeMatches[timeMatches.length - 1][1];
        const postDate = new Date(lastPostAt);
        if (!isNaN(postDate.getTime())) {
          daysSinceLast = Math.round(
            (Date.now() - postDate.getTime()) / (1000 * 3600 * 24)
          );
        }
      }

      let status = 'ok';
      if (daysSinceLast > 90) status = 'dead';
      else if (daysSinceLast > 30) status = 'stale';

      return jsonResponse(
        200,
        {
          ok: true,
          source: {
            id: username,
            username,
            title,
            description,
            type: 'channel',
            url: `https://t.me/${username}`,
            subscribers,
            status,
            lastPostAt,
            daysSinceLastPost: daysSinceLast < 999 ? daysSinceLast : null,
          },
        },
        origin
      );
    }

    // If no preview posts, check https://t.me/<username> to see if it's a group
    const infoUrl = `https://t.me/${username}`;
    const infoRes = await fetch(infoUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const infoHtml = await infoRes.text();
    const infoTitleMatch = infoHtml.match(
      /<div class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i
    );
    const infoExtraMatch = infoHtml.match(
      /<div class="tgme_page_extra"[^>]*>([\s\S]*?)<\/div>/i
    );

    if (
      infoExtraMatch &&
      (infoExtraMatch[1].includes('members') ||
        infoExtraMatch[1].includes('subscribers') ||
        infoExtraMatch[1].includes('участник'))
    ) {
      const gTitle = infoTitleMatch ? cleanHtml(infoTitleMatch[1]) : title;
      const gSubs = parseSubscribers(cleanHtml(infoExtraMatch[1]));

      return jsonResponse(
        200,
        {
          ok: true,
          source: {
            id: username,
            username,
            title: gTitle,
            description,
            type: 'group',
            url: `https://t.me/${username}`,
            subscribers: gSubs,
            status: 'group',
            lastPostAt: null,
            daysSinceLastPost: null,
          },
        },
        origin
      );
    }

    // If not found or private
    if (
      infoHtml.includes('tgme_page_icon') &&
      !infoTitleMatch &&
      !infoExtraMatch
    ) {
      return jsonResponse(
        404,
        { error: `Источник @${username} не найден в Telegram` },
        origin
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        source: {
          id: username,
          username,
          title,
          description,
          type: 'channel',
          url: `https://t.me/${username}`,
          subscribers,
          status: 'no_preview',
        },
      },
      origin
    );
  } catch (err: any) {
    return jsonResponse(
      500,
      { error: `Ошибка при проверке источника: ${err.message}` },
      origin
    );
  }
}
