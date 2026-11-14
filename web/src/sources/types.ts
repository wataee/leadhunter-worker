import { Vacancy } from '../types';

export interface RawSourceItem {
  id: string;
  source: string; // e.g. 'telegram', 'habr_freelance', 'hh_api'
  channelOrAuthor: string;
  text: string;
  url: string;
  publishedAt: string;
  views?: string;
  budgetRaw?: string;
}

export interface LeadSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly isEnabled: boolean;
  fetchItems(params?: Record<string, unknown>): Promise<RawSourceItem[]>;
}

export interface NormalizedSourceResult {
  vacancies: Vacancy[];
  totalRaw: number;
  filteredCount: number;
  duplicateCount: number;
}
