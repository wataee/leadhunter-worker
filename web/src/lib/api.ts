export interface HealthStatus {
  youtube: boolean;
  telegram: boolean;
  ai: boolean;
  aiProvider?: string | null;
  providers?: {
    gemini: boolean;
    groq: boolean;
    openrouter: boolean;
    anthropic: boolean;
  };
  models?: {
    gemini: string;
    groq: string;
    openrouter: string;
  };
}

export interface AiScoreLeadInput {
  channelId: string;
  title: string;
  description: string;
  subscribers: number;
  uploadsPerMonth?: number;
  lastVideos?: Array<{
    title: string;
    description: string;
    publishedAt: string;
  }>;
  links?: string[];
  hasProductKeywords?: boolean;
}

export interface AiScoreExample {
  title: string;
  description: string;
  subscribers: number;
  niche?: string;
}

export interface AiScoreResponse {
  enabled: boolean;
  provider?: string;
  scores?: Array<{
    channelId: string;
    is_business: boolean;
    monetization: 'product' | 'ads_only' | 'unclear';
    fit_score: number;
    has_editor_signals: boolean;
    awareness: 'unaware' | 'problem' | 'solution' | 'product';
    pain_hypotheses: string[];
    reason: string;
    opening_angle: string;
    error?: string;
  }>;
}

export interface YouTubeSearchParams {
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

export interface YouTubeSearchResponse {
  channels: Array<{
    id: string;
    channelId: string;
    name: string;
    channelUrl: string;
    avatar: string;
    subscribers: number;
    hiddenSubscribers?: boolean;
    niche: string;
    tier: 1 | 2 | 3;
    score: number;
    source: string;
    email: string | null;
    telegram: string | null;
    instagram: string | null;
    website: string | null;
    hasProduct: boolean;
    lastVideo?: {
      title: string;
      url: string;
      publishedAt: string;
    } | null;
    daysSinceLastVideo: number | null;
    frequencyPerMonth: number;
    description: string;
    ruleScore?: number;
    aiScore?: number;
    aiReason?: string;
    aiAngle?: string;
    aiPainHypotheses?: string[];
    aiMonetization?: 'product' | 'ads_only' | 'unclear';
    aiIsBusiness?: boolean;
    aiAwareness?: 'unaware' | 'problem' | 'solution' | 'product';
    aiHasEditorSignals?: boolean;
    aiAnalyzedAt?: string;
    aiCacheKey?: string;
  }>;
  quotaUsed: number;
  totalFound: number;
}

export interface TgFeedResponse {
  results: Array<{
    channel: string;
    messages: Array<{
      id: string;
      channel: string;
      text: string;
      url: string;
      postedAt: string;
      views: string;
    }>;
    error?: string;
  }>;
  allMessages: Array<{
    id: string;
    channel: string;
    text: string;
    url: string;
    postedAt: string;
    views: string;
  }>;
  errors: Array<{ channel: string; error: string }>;
  totalMessages: number;
}

async function handleApiResponse<T>(res: Response): Promise<T> {
  let data: Record<string, unknown> | null = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Ошибка сервера (HTTP ${res.status}): неверный формат ответа`);
  }

  if (!res.ok) {
    const errorMsg = (data && typeof data.error === 'string') ? data.error : `Ошибка запроса (HTTP ${res.status})`;
    throw new Error(errorMsg);
  }

  return data as unknown as T;
}

export async function checkApiHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      return { youtube: false, telegram: false, ai: false };
    }
    return await res.json();
  } catch {
    return { youtube: false, telegram: false, ai: false };
  }
}

export async function searchYouTubeChannels(params: YouTubeSearchParams): Promise<YouTubeSearchResponse> {
  const res = await fetch('/api/youtube-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  return handleApiResponse<YouTubeSearchResponse>(res);
}

export async function fetchTelegramFeed(channels: string[], before?: string): Promise<TgFeedResponse> {
  const res = await fetch('/api/tg-feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channels, before }),
  });

  return handleApiResponse<TgFeedResponse>(res);
}

export async function sendTelegramNotification(payload: {
  text: string;
  url: string;
  channel?: string;
}): Promise<{ success: boolean }> {
  const res = await fetch('/api/tg-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<{ success: boolean }>(res);
}

export async function rewritePitchWithAi(payload: {
  text: string;
  leadContext?: { name?: string; channel?: string; niche?: string };
}): Promise<{ rewritten: string }> {
  const res = await fetch('/api/ai-rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<{ rewritten: string }>(res);
}

export async function scoreLeadsWithAi(payload: {
  leads: AiScoreLeadInput[];
  examples?: {
    good?: AiScoreExample[];
    bad?: AiScoreExample[];
  };
}): Promise<AiScoreResponse> {
  const res = await fetch('/api/ai-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<AiScoreResponse>(res);
}
