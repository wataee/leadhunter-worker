export type LeadTier = 1 | 2 | 3;

export type LeadStatus =
  | 'new'          // Новый
  | 'messaged'     // Написал
  | 'replied'      // Ответил
  | 'followup'     // Напоминание (повторное сообщение)
  | 'call'         // Созвон/Пробный
  | 'closed'       // Закрыт
  | 'rejected';    // Отказ

export interface LeadFinding {
  id: string;
  timecode: string;
  note: string;
}

export interface LeadTouch {
  id: string;
  at: string; // ISO string
  channel: 'Telegram' | 'Instagram' | 'Email' | 'Other';
  note: string;
  replied?: boolean;
}

export interface Lead {
  id: string;
  name: string;
  channelUrl: string;
  channelId?: string;
  avatar?: string;
  subscribers: number;
  hiddenSubscribers?: boolean;
  niche: string;
  tier: LeadTier;
  score: number; // Combined or final score (0.4 * ruleScore + 0.6 * aiScore if aiScore exists)
  ruleScore?: number; // Initial rule-based score
  source: string;
  email: string | null;
  telegram: string | null;
  instagram: string | null;
  website: string | null;
  lastVideo?: {
    id?: string;
    title: string;
    url: string;
    publishedAt: string;
  } | null;
  hasProduct: boolean;
  findings: LeadFinding[];
  status: LeadStatus;
  firstTouchAt?: string | null;
  nextTouchAt?: string | null;
  touchesCount?: number;
  touches: LeadTouch[];
  dealValue: number;
  currency: 'USD' | 'RUB' | 'KZT';
  tags: string[];
  notes: string;
  createdAt: string;

  // AI Evaluation Fields
  aiScore?: number;
  aiReason?: string;
  aiAngle?: string;
  aiPainHypotheses?: string[];
  aiMonetization?: 'product' | 'ads_only' | 'unclear';
  aiIsBusiness?: boolean;
  aiAwareness?: 'unaware' | 'problem' | 'solution' | 'product';
  aiHasEditorSignals?: boolean;
  aiAnalyzedAt?: string;
  aiCacheKey?: string; // channelId + id последнего видео

  // Feedback loop for few-shot learning
  outcome?: 'good' | 'bad' | null;
}

export interface Vacancy {
  id: string;
  channel: string;
  text: string;
  url: string;
  postedAt: string;
  views: string;
  matchedKeywords: string[];
  skills?: string[];
  relevance: number;
  profileFit?: number;
  risks?: string[];
  formatTag?: 'short' | 'long' | 'both';
  qualityTier?: 'great' | 'fair' | 'shady';
  statusBadge?: 'new' | 'hot' | 'shady';
  isFavorite?: boolean;
  seen: boolean;
  hidden: boolean;
  budget?: {
    min: number | null;
    max: number | null;
    currency: 'RUB' | 'USD' | 'EUR' | 'KZT' | 'UAH' | 'NEGOTIABLE';
    unit?: 'per_video' | 'per_month' | 'per_hour' | 'per_minute' | 'project';
  } | null;
  fromWorker?: boolean;
}

export interface SavedSearchPreset {
  id: string;
  name: string;
  filterHotOnly: boolean;
  filterFormat: string;
  filterQuality: string;
  createdAt: string;
  sendTelegramDigest?: boolean;
  digestIntervalHours?: number;
}

export type TemplateType =
  | 'shotgun'
  | 'sniper'
  | 'fire_question'
  | 'fire_sample'
  | 'followup_1'
  | 'followup_2';

export interface PitchTemplate {
  id: string;
  type: TemplateType;
  title: string;
  body: string;
  isCustom?: boolean;
}

export interface UserProfile {
  name: string;
  specialization: string;
  formats?: Array<'YouTube' | 'Shorts/Reels' | 'Подкасты' | 'Реклама'>;
  skills?: string[];
  minRate?: number;
  minRateCurrency?: 'RUB' | 'USD';
  telegram: string;
  portfolioUrl: string;
  email: string;
  sampleUrl: string;
}

export interface UserSettings {
  profile: UserProfile;
  dailyGoal: number;
  todaySentCount: number;
  lastSentDate: string; // YYYY-MM-DD
  followUpIntervals: number[]; // e.g. [2, 2, 3]
  duplicateToTelegram: boolean;
  autoRefreshInterval: number; // 0, 1, 2, 5
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  sessionQuotaUsed: number;

  // AI Settings
  useAiQualification: boolean;
  aiTopNCount: number; // Top N leads to qualify with AI (default 30)
}
