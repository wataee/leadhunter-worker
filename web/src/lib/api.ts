import { useSettingsStore } from '../store/settingsStore';
import { computeTextHash } from '../shared/filter.js';

export interface HealthStatus {
  youtube: boolean;
  telegram: boolean;
  ai: boolean;
  status?: 'ok' | 'degraded' | 'error';
  telegramBot?: {
    status: 'ok' | 'error' | 'not_configured';
    username?: string;
    message?: string;
  };
  telegramWebhook?: {
    status: 'ok' | 'not_set' | 'error' | 'not_configured';
    url?: string | null;
    pendingUpdates?: number;
    lastError?: string | null;
    message?: string;
  };
  redis?: {
    status: 'ok' | 'error' | 'not_configured';
    latencyMs?: number;
    message?: string;
  };
  worker?: {
    status: 'ok' | 'error' | 'not_configured';
    uptimeSeconds?: number;
    message?: string;
  };
  config?: {
    authConfigured: boolean;
    sessionSecretConfigured: boolean;
    webhookSecretConfigured: boolean;
    telegramChatIdConfigured: boolean;
    youtubeConfigured: boolean;
  };
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
      budget?: any;
      fromWorker?: boolean;
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
    budget?: any;
    fromWorker?: boolean;
  }>;
  errors: Array<{ channel: string; error: string }>;
  totalMessages: number;
  workerActive?: boolean | null;
  workerConfigured?: boolean;
}

async function handleApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new Error('API вернул HTML: проверьте _redirects/netlify.toml');
  }

  let data: Record<string, unknown> | null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Ошибка сервера (HTTP ${res.status}): неверный формат ответа`);
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    const errorMsg =
      data && typeof data.error === 'string'
        ? data.error
        : res.status === 503
        ? 'Сервер недоступен: задайте APP_PASSWORD в настройках Netlify'
        : `Ошибка запроса (HTTP ${res.status})`;
    throw new Error(errorMsg);
  }

  return (data || {}) as unknown as T;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch('/api/health');
  const h = await handleApiResponse<HealthStatus>(res);
  if (h.youtube === undefined && h.config) {
    h.youtube = Boolean(h.config.youtubeConfigured);
  }
  if (h.telegram === undefined) {
    h.telegram = h.telegramBot?.status === 'ok';
  }
  if (h.ai === undefined) {
    h.ai = true;
  }
  return h;
}

export async function loginWithPassword(password: string): Promise<{ ok: boolean; devMode?: boolean }> {
  const res = await fetch('/api/auth-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return handleApiResponse<{ ok: boolean; devMode?: boolean }>(res);
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
  } catch {
    // Ignore network error on logout
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

export async function checkAuthStatus(): Promise<{ authenticated: boolean }> {
  try {
    const res = await fetch('/api/auth-login');
    if (res.ok) {
      const data = await res.json();
      return { authenticated: Boolean(data?.authenticated ?? true) };
    }
    return { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

export async function checkApiHealth(): Promise<HealthStatus> {
  try {
    return await fetchHealth();
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

export async function rewritePitchWithAi(payload: {
  text: string;
  leadContext?: { name?: string; channel?: string; niche?: string };
}): Promise<{ rewritten: string }> {
  const { customAiApiKey, customAiProvider } = useSettingsStore.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (customAiApiKey?.trim()) {
    headers['x-custom-ai-key'] = customAiApiKey.trim();
  }
  if (customAiProvider) {
    headers['x-custom-ai-provider'] = customAiProvider;
  }

  const res = await fetch('/api/ai-rewrite', {
    method: 'POST',
    headers,
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
  const { customAiApiKey, customAiProvider } = useSettingsStore.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (customAiApiKey?.trim()) {
    headers['x-custom-ai-key'] = customAiApiKey.trim();
  }
  if (customAiProvider) {
    headers['x-custom-ai-provider'] = customAiProvider;
  }

  const res = await fetch('/api/ai-score', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  return handleApiResponse<AiScoreResponse>(res);
}

export interface SourceCheckResult {
  ok: boolean;
  source?: {
    id: string;
    username: string;
    title: string;
    description: string;
    type: 'channel' | 'group';
    url: string;
    subscribers: number;
    status: string;
    lastPostAt?: string | null;
    daysSinceLastPost?: number | null;
  };
  error?: string;
}

export async function checkSource(username: string): Promise<SourceCheckResult> {
  const res = await fetch('/api/source-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });

  return handleApiResponse<SourceCheckResult>(res);
}

export interface InboxItem {
  id: string;
  text: string;
  url: string;
  channel?: string;
  budget?: string | null;
  postedAt: string;
}

export async function fetchInbox(): Promise<{ items: InboxItem[]; redisConfigured?: boolean }> {
  try {
    const res = await fetch('/api/inbox', {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return { items: [] };
    return await res.json();
  } catch {
    return { items: [] };
  }
}

export async function ackInbox(ids: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/inbox/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncDisabledSourcesToApi(disabledSources: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/sources-enabled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabledSources }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface TranslateApiResult {
  translatedText: string;
  provider: string;
  model: string;
  detectedSourceLang: string;
}

const TRANSLATION_CACHE_KEY = 'leadhunter_translations_v1';
const TRANSLATION_CACHE_LIMIT = 250;
const inflightTranslations = new Map<string, Promise<TranslateApiResult>>();
let activeTranslationRequests = 0;
const translationWaitQueue: Array<() => void> = [];
const MAX_TRANSLATE_CONCURRENCY = 3;

function acquireTranslateSlot(): Promise<void> {
  if (activeTranslationRequests < MAX_TRANSLATE_CONCURRENCY) {
    activeTranslationRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    translationWaitQueue.push(() => {
      activeTranslationRequests++;
      resolve();
    });
  });
}

function releaseTranslateSlot(): void {
  activeTranslationRequests = Math.max(0, activeTranslationRequests - 1);
  const next = translationWaitQueue.shift();
  if (next) next();
}

function readTranslationCache(cacheKey: string): TranslateApiResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    if (!raw) return null;
    const entries = JSON.parse(raw) as Array<[string, TranslateApiResult]>;
    if (!Array.isArray(entries)) return null;
    const found = entries.find(([k]) => k === cacheKey);
    return found ? found[1] : null;
  } catch {
    return null;
  }
}

function writeTranslationCache(cacheKey: string, val: TranslateApiResult): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    let entries: Array<[string, TranslateApiResult]> = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) entries = [];
    entries = entries.filter(([k]) => k !== cacheKey);
    entries.push([cacheKey, val]);
    if (entries.length > TRANSLATION_CACHE_LIMIT) {
      entries = entries.slice(entries.length - TRANSLATION_CACHE_LIMIT);
    }
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

export async function translateTextWithAi(params: {
  text: string;
  targetLang?: 'ru' | 'en';
  sourceLang?: string;
  mode?: 'vacancy' | 'pitch' | 'auto';
}): Promise<TranslateApiResult> {
  const cleanText = params.text.trim();
  const targetLang = params.targetLang === 'en' ? 'en' : 'ru';
  const cacheKey = `${targetLang}:${params.mode || 'auto'}:${computeTextHash(cleanText)}`;

  const cached = readTranslationCache(cacheKey);
  if (cached) return cached;

  const existingInflight = inflightTranslations.get(cacheKey);
  if (existingInflight) return existingInflight;

  const promise = (async () => {
    await acquireTranslateSlot();
    try {
      const { customAiApiKey, customAiProvider } = useSettingsStore.getState();
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          targetLang,
          sourceLang: params.sourceLang || 'auto',
          mode: params.mode || 'auto',
          customAiApiKey: customAiApiKey?.trim() || undefined,
          customAiProvider: customAiProvider || undefined,
        }),
      });
      const data = await handleApiResponse<TranslateApiResult>(res);
      if (data?.translatedText) {
        writeTranslationCache(cacheKey, data);
      }
      return data;
    } finally {
      releaseTranslateSlot();
      inflightTranslations.delete(cacheKey);
    }
  })();

  inflightTranslations.set(cacheKey, promise);
  return promise;
}

export interface CrmSyncPayload {
  leads: unknown[];
  blacklist: string[];
  hiddenChannels: string[];
  deletedLeadIds: string[];
}

export interface CrmSyncResponse {
  ok: boolean;
  redisConfigured: boolean;
  persistedToRedis?: boolean;
  syncedAt?: string;
  state: {
    updatedAt: string;
    leads: any[];
    blacklist: string[];
    hiddenChannels: string[];
    deletedLeadIds: string[];
  };
}

export async function fetchCrmSync(): Promise<CrmSyncResponse> {
  const res = await fetch('/api/crm-sync');
  return handleApiResponse<CrmSyncResponse>(res);
}

export async function postCrmSync(payload: CrmSyncPayload): Promise<CrmSyncResponse> {
  const res = await fetch('/api/crm-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<CrmSyncResponse>(res);
}

export async function fetchRedditFeed(): Promise<{
  ok: boolean;
  items: any[];
  totalRaw: number;
  subreddits: string[];
}> {
  const res = await fetch('/api/reddit-feed');
  return handleApiResponse(res);
}

export async function fetchUpworkJobs(): Promise<{
  ok: boolean;
  items: any[];
}> {
  const res = await fetch('/api/upwork-ingest');
  return handleApiResponse(res);
}

export async function ingestUpworkJob(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  job: any;
  roi: any;
  proposal: any;
  translatedRu?: string | null;
  vacancy?: any;
}> {
  const res = await fetch('/api/upwork-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res);
}


