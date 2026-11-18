export type PortfolioCategoryKey =
  | 'auto'
  | 'vertical'
  | 'finance'
  | 'personal_brand'
  | 'real_estate'
  | 'all';

export interface PortfolioCategoryOption {
  key: PortfolioCategoryKey;
  labelRu: string;
  labelEn: string;
}

export const PORTFOLIO_CATEGORIES: PortfolioCategoryOption[];

export interface PortfolioDeepLinkOptions {
  text?: string;
  channelOrNiche?: string;
  region?: string;
  lang?: string;
  basePortfolioUrl?: string;
  overrideCategory?: PortfolioCategoryKey | string;
}

export interface PortfolioDeepLinkResult {
  url: string;
  categoryKey: Exclude<PortfolioCategoryKey, 'auto'>;
  niche: 'all' | 'finance' | 'personal_brand' | 'real_estate';
  format: 'vertical' | null;
  localePath: string;
  labelRu: string;
  labelEn: string;
  sampleUrl: string;
}

export function matchPortfolioDeepLink(
  options?: PortfolioDeepLinkOptions
): PortfolioDeepLinkResult;
