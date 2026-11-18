import { RawSourceItem, LeadSourceAdapter } from './types';
import { fetchRedditHiringPosts, REDDIT_HIRING_SUBREDDITS } from '../shared/reddit.js';

export class RedditSource implements LeadSourceAdapter {
  readonly id = 'reddit';
  readonly name = 'Reddit [Hiring] (EU / US)';
  readonly isEnabled = true;

  async fetchItems(params?: {
    subreddits?: string[];
    limit?: number;
  }): Promise<RawSourceItem[]> {
    return fetchRedditHiringPosts({
      subreddits: params?.subreddits || REDDIT_HIRING_SUBREDDITS,
      limit: params?.limit || 40,
    });
  }
}
