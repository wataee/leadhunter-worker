export function extractDirectTelegramHandle(
  text: string,
  channelName?: string
): string | null;

export interface ReadyTelegramPitch {
  pitchText: string;
  portfolioUrl: string;
  portfolioCategoryLabel: string;
  directHandle: string | null;
  directWriteUrl: string | null;
  lang: string;
  region: string;
  formatLabel: string;
}

export function buildReadyTelegramPitch(params?: {
  text?: string;
  channel?: string;
  region?: string;
  basePortfolioUrl?: string;
}): ReadyTelegramPitch;
