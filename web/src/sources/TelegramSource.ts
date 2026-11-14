import { LeadSourceAdapter, RawSourceItem } from './types';
import { fetchTelegramFeed } from '../lib/api';

export class TelegramSourceAdapter implements LeadSourceAdapter {
  readonly id = 'telegram';
  readonly name = 'Telegram Channels';
  readonly isEnabled = true;

  async fetchItems(params?: { channels?: string[]; before?: string }): Promise<RawSourceItem[]> {
    const channels = params?.channels || [];
    if (channels.length === 0) return [];

    const feed = await fetchTelegramFeed(channels, params?.before);
    const messages = feed.allMessages || [];

    return messages.map((m) => ({
      id: m.id,
      source: 'telegram',
      channelOrAuthor: m.channel,
      text: m.text,
      url: m.url,
      publishedAt: m.postedAt,
      views: m.views,
    }));
  }
}
