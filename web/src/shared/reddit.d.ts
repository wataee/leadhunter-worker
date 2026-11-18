import type { RawSourceItem } from '../sources/types';

export const REDDIT_HIRING_SUBREDDITS: string[];

export interface RedditSubmissionLike {
  id?: string;
  title?: string;
  selftext?: string;
  link_flair_text?: string;
  subreddit?: string;
  author?: string;
  permalink?: string;
  url?: string;
  created_utc?: number;
  score?: number;
}

export function isRedditHiringPost(post: RedditSubmissionLike): boolean;
export function normalizeRedditPost(post: RedditSubmissionLike): RawSourceItem;
export function fetchRedditHiringPosts(options?: {
  subreddits?: string[];
  limit?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}): Promise<RawSourceItem[]>;
