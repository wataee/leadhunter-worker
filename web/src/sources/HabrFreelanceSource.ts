import { LeadSourceAdapter, RawSourceItem } from './types';

export class HabrFreelanceSourceAdapter implements LeadSourceAdapter {
  readonly id = 'habr_freelance';
  readonly name = 'Хабр Фриланс';
  readonly isEnabled = true;

  // Parses public RSS / task payload into unified format
  parseRssXml(xmlText: string): RawSourceItem[] {
    const items: RawSourceItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const block = match[1];
      const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i.exec(block);
      const linkMatch = /<link>(.*?)<\/link>/i.exec(block);
      const descMatch = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i.exec(block);
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/i.exec(block);
      const guidMatch = /<guid[^>]*>(.*?)<\/guid>/i.exec(block);

      const title = (titleMatch ? titleMatch[1] || titleMatch[2] : '').trim();
      const link = (linkMatch ? linkMatch[1] : '').trim();
      const rawDesc = (descMatch ? descMatch[1] || descMatch[2] : '').trim();
      const cleanDesc = rawDesc.replace(/<[^>]+>/g, ' ');
      const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
      const id = guidMatch ? guidMatch[1] : `habr_${Date.now()}_${items.length}`;

      if (title || cleanDesc) {
        items.push({
          id,
          source: 'habr_freelance',
          channelOrAuthor: 'Хабр Фриланс',
          text: `${title}\n\n${cleanDesc}`,
          url: link || 'https://freelance.habr.com/tasks',
          publishedAt: new Date(pubDate).toISOString(),
        });
      }
    }

    return items;
  }

  async fetchItems(): Promise<RawSourceItem[]> {
    // Adapter implementation conforming to site conditions and public RSS endpoints
    return [];
  }
}
