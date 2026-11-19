import { UpworkJobInput } from './upwork.js';

export interface UpworkEmailPayload {
  subject?: string;
  text?: string;
  html?: string;
  from?: string;
}

/**
 * Strips HTML tags and decodes common entities to produce clean readable text.
 */
function cleanHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*[/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Extracts all Upwork job links from a text or HTML block.
 */
function extractUpworkJobLinks(raw: string): string[] {
  const regex = /https?:\/\/(?:www\.)?upwork\.com\/(?:jobs|nx\/find-work\/details)\/~([a-zA-Z0-9]+)/gi;
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    const cleanUrl = `https://www.upwork.com/jobs/~${m[1]}`;
    if (!links.includes(cleanUrl)) {
      links.push(cleanUrl);
    }
  }
  return links;
}

function splitEmailIntoJobChunks(fullText: string, links: string[]): { url: string; chunk: string }[] {
  if (links.length <= 1) {
    return [{ url: links[0], chunk: fullText }];
  }

  const linkPositions = links
    .map((url) => {
      const key = url.split('/~')[1] || url;
      return { url, index: fullText.indexOf(key) };
    })
    .filter((lp) => lp.index !== -1)
    .sort((a, b) => a.index - b.index);

  const results: { url: string; chunk: string }[] = [];
  for (let i = 0; i < linkPositions.length; i++) {
    const cur = linkPositions[i];
    const prev = i > 0 ? linkPositions[i - 1] : null;
    const next = i < linkPositions.length - 1 ? linkPositions[i + 1] : null;

    let start = 0;
    if (prev) {
      const betweenPrevAndCur = fullText.slice(prev.index, cur.index);
      const match = betweenPrevAndCur.match(/\n\s*\n|\bjob\s*\d+:/i);
      if (match && match.index !== undefined) {
        start = prev.index + match.index;
      } else {
        start = Math.floor((prev.index + cur.index) / 2);
      }
    }

    let end = fullText.length;
    if (next) {
      const betweenCurAndNext = fullText.slice(cur.index, next.index);
      const match = betweenCurAndNext.match(/\n\s*\n|\bjob\s*\d+:/i);
      if (match && match.index !== undefined) {
        end = cur.index + match.index;
      } else {
        end = Math.floor((cur.index + next.index) / 2);
      }
    }

    results.push({ url: cur.url, chunk: fullText.slice(start, end).trim() });
  }

  return results;
}

/**
 * Parses Upwork Job Alert / Notification emails into structured UpworkJobInput items.
 */
export function parseUpworkEmail(payload: UpworkEmailPayload): UpworkJobInput[] {
  const subject = (payload.subject || '').trim();
  const textContent = payload.text ? payload.text.trim() : '';
  const htmlContent = payload.html ? cleanHtml(payload.html) : '';
  const fullContent = `${subject}\n\n${textContent}\n\n${htmlContent}`.trim();

  if (!fullContent) return [];

  const rawForLinks = `${payload.html || ''}\n${payload.text || ''}\n${subject}`;
  const links = extractUpworkJobLinks(rawForLinks);

  // If no job links found, check if it's a single job alert by subject
  if (links.length === 0) {
    const isUpworkEmail =
      /upwork/i.test(payload.from || '') ||
      /new job|job alert|matching your saved search|recommended job/i.test(subject);

    if (isUpworkEmail && textContent.length > 50) {
      const title = subject
        .replace(/^(new job:|job alert:|upwork:)/i, '')
        .replace(/matching your.*$/i, '')
        .trim() || 'Upwork Video Editing Job';

      return [
        {
          title,
          description: textContent.slice(0, 1500),
          url: 'https://www.upwork.com/nx/find-work/',
          budget: extractBudgetLine(textContent),
          clientPaymentVerified: /payment\s+(?:is\s+)?verified/i.test(textContent),
          connectsRequired: extractConnectsNumber(textContent),
        },
      ];
    }
    return [];
  }

  // Split into chunks per job
  const chunks = splitEmailIntoJobChunks(fullContent, links);
  const jobs: UpworkJobInput[] = [];

  for (const item of chunks) {
    const { url, chunk } = item;
    let title = '';

    if (links.length === 1) {
      const subjectTitleMatch = subject.match(/(?:new job:\s*|job alert:\s*)(.+?)(?:\s*[-–—]\s*upwork|\s*matching|$)/i);
      if (subjectTitleMatch) {
        title = subjectTitleMatch[1].trim();
      }
    }

    if (!title) {
      const lines = chunk.split('\n').map((l) => l.trim()).filter((l) => l.length > 5 && !l.includes(url));
      const titleCandidate = lines.find(
        (l) =>
          l.length >= 10 &&
          l.length <= 110 &&
          !/^(hourly|budget|fixed-price|posted|skills|client|payment|https?:\/\/|a new job|job alert|matching your)/i.test(l)
      );
      if (titleCandidate) {
        title = titleCandidate.replace(/^job\s*\d+:\s*/i, '').trim();
      }
    }

    title = title || 'Upwork Video Editing Project';

    jobs.push({
      title,
      description: chunk.slice(0, 1800),
      url,
      budget: extractBudgetLine(chunk),
      connectsRequired: extractConnectsNumber(chunk),
      clientPaymentVerified: /payment\s+(?:is\s+)?verified/i.test(chunk),
    });
  }

  return jobs;
}

function extractBudgetLine(text: string): string | undefined {
  const hourlyMatch = text.match(/Hourly:\s*(\$[\d,.]+(?:\s*-\s*\$[\d,.]+)?(?:\s*\/\s*hr)?)/i);
  if (hourlyMatch) return hourlyMatch[1].trim();

  const fixedMatch = text.match(/(?:Budget|Fixed-price|Est\. Budget):\s*(\$[\d,.]+)/i);
  if (fixedMatch) return fixedMatch[1].trim();

  const dollarMatch = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*-\s*\$[\d,]+(?:\.\d{2})?)?(?:\s*\/\s*hr)?/);
  if (dollarMatch) return dollarMatch[0].trim();

  return undefined;
}

function extractConnectsNumber(text: string): number | undefined {
  const m = text.match(/\b(\d{1,2})\s*connects\b/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && num > 0 && num <= 40) return num;
  }
  return undefined;
}


