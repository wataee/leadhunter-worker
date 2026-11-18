import React, { useState, useEffect } from 'react';
import { useLeadsStore } from '../store/leadsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { searchYouTubeChannels, YouTubeSearchResponse, scoreLeadsWithAi, checkApiHealth } from '../lib/api';
import { formatDate } from '../lib/time';
import { TierBadge } from '../components/TierBadge';
import { ScoreBar } from '../components/ScoreBar';
import { CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { PitchGeneratorModal } from '../components/PitchGeneratorModal';
import { FlagKZ, FlagUS, FlagEU } from '../components/RegionBadge';
import { Lead } from '../types';
import {
  Search,
  ExternalLink,
  Plus,
  Flame,
  Mail,
  Send,
  Globe,
  Instagram,
  Check,
  Ban,
  Sparkles,
  History,
  AlertCircle,
  Play,
  RotateCw,
  LayoutGrid,
  Table as TableIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const DEFAULT_CHIPS_EU = [
  'uk business podcast',
  'saas founder europe',
  'real estate london',
  'tech startup berlin',
  'ai agency uk',
  'fitness coach uk',
  'crypto podcast europe',
];

const DEFAULT_CHIPS_KZ = [
  'недвижимость алматы',
  'бизнес казахстан',
  'подкаст казахстан',
  'авто алматы',
  'онлайн курсы казахстан',
  'инвестиции kz',
  'маркетинг алматы',
];

const DEFAULT_CHIPS_US = [
  'real estate investing',
  'ai automation',
  'crypto',
  'fitness coaching',
  'ecommerce brand',
  'podcast',
  'saas marketing',
];

export const Finder: React.FC = () => {
  const leads = useLeadsStore((s) => s.leads);
  const blacklist = useLeadsStore((s) => s.blacklist);
  const searchHistory = useLeadsStore((s) => s.searchHistory);
  const addLead = useLeadsStore((s) => s.addLead);
  const addLeads = useLeadsStore((s) => s.addLeads);
  const addToBlacklist = useLeadsStore((s) => s.addToBlacklist);
  const addSearchHistory = useLeadsStore((s) => s.addSearchHistory);

  const addQuotaUsed = useSettingsStore((s) => s.addQuotaUsed);
  const sessionQuotaUsed = useSettingsStore((s) => s.sessionQuotaUsed);
  const useAiQualification = useSettingsStore((s) => s.useAiQualification);
  const aiTopNCount = useSettingsStore((s) => s.aiTopNCount);
  const getAiExamples = useLeadsStore((s) => s.getAiExamples);
  const addToast = useToastStore((s) => s.addToast);

  // Form states
  const [query, setQuery] = useState('недвижимость алматы');
  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS_KZ);
  const [newChipInput, setNewChipInput] = useState('');
  const [minSubs, setMinSubs] = useState<number>(5000);
  const [maxSubs, setMaxSubs] = useState<number>(50000);
  const [language, setLanguage] = useState<string>('ru');
  const [region, setRegion] = useState<string>('KZ');
  const [maxDaysActive, setMaxDaysActive] = useState<number>(30);
  const [onlyWithProduct, setOnlyWithProduct] = useState<boolean>(false);
  const [onlyWithEmail, setOnlyWithEmail] = useState<boolean>(false);
  const [hideAlreadyAdded, setHideAlreadyAdded] = useState<boolean>(true);
  const [maxPages, setMaxPages] = useState<number>(1);

  // Search execution states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<YouTubeSearchResponse['channels']>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'score' | 'subs' | 'date'>('score');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');

  // AI Qualification states
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
  const [isAiScoring, setIsAiScoring] = useState<boolean>(false);
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number } | null>(null);
  const [onlyMinAiScore, setOnlyMinAiScore] = useState<boolean>(false);
  const [minAiScoreValue, setMinAiScoreValue] = useState<number>(60);
  const [expandedAiCardId, setExpandedAiCardId] = useState<string | null>(null);
  const [reevaluatingId, setReevaluatingId] = useState<string | null>(null);
  const [pitchLead, setPitchLead] = useState<Lead | null>(null);
  const [pitchOpeningAngle, setPitchOpeningAngle] = useState<string | undefined>(undefined);

  useEffect(() => {
    checkApiHealth()
      .then((h) => {
        if (!h.ai && !h.providers?.gemini && !h.providers?.groq && !h.providers?.openrouter) {
          setAiEnabled(false);
        } else {
          setAiEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  const triggerAiQualification = async (channelsList: YouTubeSearchResponse['channels']) => {
    if (!useAiQualification) return;

    const sorted = [...channelsList].sort((a, b) => (b.ruleScore ?? b.score) - (a.ruleScore ?? a.score));
    const topN = sorted.slice(0, aiTopNCount);

    const existingLeadsMap = new Map(leads.map((l) => [l.channelId || l.id, l]));
    const updatedChannels = [...channelsList];
    const toScoreIndices: number[] = [];

    for (const ch of topN) {
      const key = `${ch.channelId}_${ch.lastVideo?.url || 'last'}`;
      const cached = existingLeadsMap.get(ch.channelId);
      const idx = updatedChannels.findIndex((c) => c.id === ch.id);
      if (cached && cached.aiCacheKey === key && cached.aiScore !== undefined) {
        const rule = ch.ruleScore ?? ch.score;
        const combined = Math.round(0.4 * rule + 0.6 * cached.aiScore);
        const tier = combined >= 80 ? 1 : combined >= 60 ? 2 : 3;
        if (idx !== -1) {
          updatedChannels[idx] = {
            ...updatedChannels[idx],
            ruleScore: rule,
            score: combined,
            tier: tier as 1 | 2 | 3,
            aiScore: cached.aiScore,
            aiReason: cached.aiReason,
            aiAngle: cached.aiAngle,
            aiPainHypotheses: cached.aiPainHypotheses,
            aiMonetization: cached.aiMonetization,
            aiIsBusiness: cached.aiIsBusiness,
            aiAwareness: cached.aiAwareness,
            aiHasEditorSignals: cached.aiHasEditorSignals,
            aiAnalyzedAt: cached.aiAnalyzedAt,
            aiCacheKey: key,
          };
        }
      } else if (idx !== -1) {
        toScoreIndices.push(idx);
      }
    }

    setResults([...updatedChannels]);

    if (toScoreIndices.length === 0) return;

    setIsAiScoring(true);
    setAiProgress({ current: 0, total: toScoreIndices.length });

    const batchSize = 5;
    let processed = 0;

    for (let i = 0; i < toScoreIndices.length; i += batchSize) {
      const batchIndices = toScoreIndices.slice(i, i + batchSize);
      const batchChannels = batchIndices.map((idx) => updatedChannels[idx]);

      const scoreInput = batchChannels.map((c) => ({
        channelId: c.channelId,
        title: c.name,
        description: c.description || '',
        subscribers: c.subscribers,
        uploadsPerMonth: c.frequencyPerMonth || 2,
        lastVideos: c.lastVideo
          ? [{ title: c.lastVideo.title, description: '', publishedAt: c.lastVideo.publishedAt }]
          : [],
        links: [c.website, c.telegram, c.instagram].filter(Boolean) as string[],
        hasProductKeywords: c.hasProduct,
      }));

      try {
        const aiRes = await scoreLeadsWithAi({
          leads: scoreInput,
          examples: getAiExamples(),
        });

        if (aiRes.enabled === false) {
          setAiEnabled(false);
          break;
        }

        if (aiRes.scores && aiRes.scores.length > 0) {
          const scoreMap = new Map(aiRes.scores.map((s) => [s.channelId, s]));
          for (const idx of batchIndices) {
            const ch = updatedChannels[idx];
            const sc = scoreMap.get(ch.channelId);
            if (sc && sc.fit_score !== undefined) {
              const rule = ch.ruleScore ?? ch.score;
              const combined = Math.round(0.4 * rule + 0.6 * sc.fit_score);
              const tier = combined >= 80 ? 1 : combined >= 60 ? 2 : 3;
              const cacheKey = `${ch.channelId}_${ch.lastVideo?.url || 'last'}`;
              updatedChannels[idx] = {
                ...ch,
                ruleScore: rule,
                score: combined,
                tier: tier as 1 | 2 | 3,
                aiScore: sc.fit_score,
                aiReason: sc.reason,
                aiAngle: sc.opening_angle,
                aiPainHypotheses: sc.pain_hypotheses,
                aiMonetization: sc.monetization,
                aiIsBusiness: sc.is_business,
                aiAwareness: sc.awareness,
                aiHasEditorSignals: sc.has_editor_signals,
                aiAnalyzedAt: new Date().toISOString(),
                aiCacheKey: cacheKey,
              };
            }
          }
          setResults([...updatedChannels]);
        }
      } catch {
        // Continue gracefully
      }

      processed += batchChannels.length;
      setAiProgress({ current: Math.min(processed, toScoreIndices.length), total: toScoreIndices.length });

      if (i + batchSize < toScoreIndices.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    setIsAiScoring(false);
    setAiProgress(null);
  };

  const handleReevaluateSingleChannel = async (channel: YouTubeSearchResponse['channels'][0]) => {
    setReevaluatingId(channel.id);
    try {
      const res = await scoreLeadsWithAi({
        leads: [
          {
            channelId: channel.channelId,
            title: channel.name,
            description: channel.description || '',
            subscribers: channel.subscribers,
            uploadsPerMonth: channel.frequencyPerMonth || 2,
            lastVideos: channel.lastVideo
              ? [{ title: channel.lastVideo.title, description: '', publishedAt: channel.lastVideo.publishedAt }]
              : [],
            links: [channel.website, channel.telegram, channel.instagram].filter(Boolean) as string[],
            hasProductKeywords: channel.hasProduct,
          },
        ],
        examples: getAiExamples(),
      });

      if (res.scores && res.scores.length > 0) {
        const sc = res.scores[0];
        const rule = channel.ruleScore ?? channel.score;
        const combined = Math.round(0.4 * rule + 0.6 * sc.fit_score);
        const tier = combined >= 80 ? 1 : combined >= 60 ? 2 : 3;
        const cacheKey = `${channel.channelId}_${channel.lastVideo?.url || 'last'}`;
        setResults((prev) =>
          prev.map((c) =>
            c.id === channel.id
              ? {
                  ...c,
                  ruleScore: rule,
                  score: combined,
                  tier: tier as 1 | 2 | 3,
                  aiScore: sc.fit_score,
                  aiReason: sc.reason,
                  aiAngle: sc.opening_angle,
                  aiPainHypotheses: sc.pain_hypotheses,
                  aiMonetization: sc.monetization,
                  aiIsBusiness: sc.is_business,
                  aiAwareness: sc.awareness,
                  aiHasEditorSignals: sc.has_editor_signals,
                  aiAnalyzedAt: new Date().toISOString(),
                  aiCacheKey: cacheKey,
                }
              : c
          )
        );
        addToast({
          type: 'success',
          title: 'ИИ-оценка обновлена',
          message: `${channel.name}: Оценка ${sc.fit_score}/100. Итоговый балл: ${combined}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка ИИ';
      addToast({ type: 'error', title: 'Ошибка оценки', message: msg });
    } finally {
      setReevaluatingId(null);
    }
  };

  const handleUseOpeningAngle = (channel: YouTubeSearchResponse['channels'][0]) => {
    let leadObj = leads.find((l) => l.channelId === channel.channelId);
    if (!leadObj) {
      leadObj = {
        id: channel.id,
        name: channel.name,
        channelUrl: channel.channelUrl,
        channelId: channel.channelId,
        avatar: channel.avatar,
        subscribers: channel.subscribers,
        hiddenSubscribers: channel.hiddenSubscribers,
        niche: query,
        tier: channel.tier,
        score: channel.score,
        ruleScore: channel.ruleScore ?? channel.score,
        source: 'YouTube Search',
        email: channel.email,
        telegram: channel.telegram,
        instagram: channel.instagram,
        website: channel.website,
        lastVideo: channel.lastVideo,
        hasProduct: channel.hasProduct,
        findings: [],
        status: 'new',
        dealValue: channel.tier === 1 ? 1200 : channel.tier === 2 ? 700 : 400,
        currency: 'USD',
        tags: [],
        notes: '',
        touches: [],
        createdAt: new Date().toISOString(),
        aiScore: channel.aiScore,
        aiReason: channel.aiReason,
        aiAngle: channel.aiAngle,
        aiPainHypotheses: channel.aiPainHypotheses,
        aiMonetization: channel.aiMonetization,
        aiIsBusiness: channel.aiIsBusiness,
        aiAwareness: channel.aiAwareness,
        aiHasEditorSignals: channel.aiHasEditorSignals,
        aiAnalyzedAt: channel.aiAnalyzedAt,
        aiCacheKey: channel.aiCacheKey,
      };
      addLead(leadObj);
    }
    setPitchLead(leadObj);
    setPitchOpeningAngle(channel.aiAngle);
  };

  const handleAddChip = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newChipInput.trim();
    if (clean && !chips.includes(clean)) {
      setChips([...chips, clean]);
      setNewChipInput('');
    }
  };

  const executeSearch = async (searchQuery: string = query) => {
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery) {
      addToast({ type: 'warning', message: 'Введите поисковый запрос (нишу)' });
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    setSelectedIds([]);
    addSearchHistory(cleanQuery);

    setProgressStep('Ищу каналы на YouTube...');
    try {
      setTimeout(() => setProgressStep('Проверяю статистику и подписчиков...'), 800);
      setTimeout(() => setProgressStep('Анализирую последние видео и контакты...'), 1800);

      const res = await searchYouTubeChannels({
        query: cleanQuery,
        minSubs,
        maxSubs,
        relevanceLanguage: language,
        regionCode: region,
        maxDaysActive,
        onlyWithProduct,
        onlyWithEmail,
        maxPages,
      });

      addQuotaUsed(res.quotaUsed);
      const initialized = res.channels.map((c) => ({
        ...c,
        ruleScore: c.score,
      }));
      setResults(initialized);

      if (res.channels.length > 0 && useAiQualification && aiEnabled) {
        triggerAiQualification(initialized);
      }

      if (res.channels.length === 0) {
        addToast({
          type: 'info',
          title: 'Ничего не найдено',
          message: 'Попробуйте расширить диапазон подписчиков или изменить запрос.',
        });
      } else {
        addToast({
          type: 'success',
          title: `Найдено ${res.channels.length} каналов`,
          message: `Израсходовано ~${res.quotaUsed} единиц квоты YouTube API.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при поиске на YouTube';
      setSearchError(msg);
      addToast({
        type: 'error',
        title: 'Ошибка YouTube API',
        message: msg,
      });
    } finally {
      setIsLoading(false);
      setProgressStep('');
    }
  };

  // Filter out blacklisted or already added
  const existingChannelIds = new Set(leads.map((l) => l.channelId).filter(Boolean));
  const blacklistedIds = new Set(blacklist);

  const displayedResults = results.filter((c) => {
    if (blacklistedIds.has(c.channelId)) return false;
    if (hideAlreadyAdded && existingChannelIds.has(c.channelId)) return false;
    if (onlyMinAiScore && aiEnabled) {
      if (c.aiScore === undefined || c.aiScore < minAiScoreValue) return false;
    }
    return true;
  });

  // Sort
  const sortedResults = [...displayedResults].sort((a, b) => {
    if (sortBy === 'score') return b.score - a.score;
    if (sortBy === 'subs') return b.subscribers - a.subscribers;
    if (sortBy === 'date') {
      const da = a.lastVideo ? new Date(a.lastVideo.publishedAt).getTime() : 0;
      const db = b.lastVideo ? new Date(b.lastVideo.publishedAt).getTime() : 0;
      return db - da;
    }
    return 0;
  });

  const handleAddSingleLead = (channel: YouTubeSearchResponse['channels'][0]) => {
    addLead({
      name: channel.name,
      channelUrl: channel.channelUrl,
      channelId: channel.channelId,
      avatar: channel.avatar,
      subscribers: channel.subscribers,
      hiddenSubscribers: channel.hiddenSubscribers,
      niche: query,
      tier: channel.tier,
      score: channel.score,
      ruleScore: channel.ruleScore ?? channel.score,
      source: 'YouTube Search',
      email: channel.email,
      telegram: channel.telegram,
      instagram: channel.instagram,
      website: channel.website,
      lastVideo: channel.lastVideo,
      hasProduct: channel.hasProduct,
      findings: [],
      status: 'new',
      dealValue: channel.tier === 1 ? 1200 : channel.tier === 2 ? 700 : 400,
      currency: 'USD',
      tags: [],
      notes: '',
      touches: [],
      aiScore: channel.aiScore,
      aiReason: channel.aiReason,
      aiAngle: channel.aiAngle,
      aiPainHypotheses: channel.aiPainHypotheses,
      aiMonetization: channel.aiMonetization,
      aiIsBusiness: channel.aiIsBusiness,
      aiAwareness: channel.aiAwareness,
      aiHasEditorSignals: channel.aiHasEditorSignals,
      aiAnalyzedAt: channel.aiAnalyzedAt,
      aiCacheKey: channel.aiCacheKey,
    });
    addToast({
      type: 'success',
      message: `Канал "${channel.name}" добавлен в воронку!`,
    });
  };

  const handleBulkAdd = () => {
    const toAdd = results.filter((c) => selectedIds.includes(c.id));
    addLeads(
      toAdd.map((c) => ({
        name: c.name,
        channelUrl: c.channelUrl,
        channelId: c.channelId,
        avatar: c.avatar,
        subscribers: c.subscribers,
        hiddenSubscribers: c.hiddenSubscribers,
        niche: query,
        tier: c.tier,
        score: c.score,
        ruleScore: c.ruleScore ?? c.score,
        source: 'YouTube Search',
        email: c.email,
        telegram: c.telegram,
        instagram: c.instagram,
        website: c.website,
        lastVideo: c.lastVideo,
        hasProduct: c.hasProduct,
        findings: [],
        status: 'new',
        dealValue: c.tier === 1 ? 1200 : c.tier === 2 ? 700 : 400,
        currency: 'USD',
        tags: [],
        notes: '',
        touches: [],
        aiScore: c.aiScore,
        aiReason: c.aiReason,
        aiAngle: c.aiAngle,
        aiPainHypotheses: c.aiPainHypotheses,
        aiMonetization: c.aiMonetization,
        aiIsBusiness: c.aiIsBusiness,
        aiAwareness: c.aiAwareness,
        aiHasEditorSignals: c.aiHasEditorSignals,
        aiAnalyzedAt: c.aiAnalyzedAt,
        aiCacheKey: c.aiCacheKey,
      }))
    );
    addToast({
      type: 'success',
      title: 'Массовое добавление',
      message: `${toAdd.length} каналов добавлены в воронку!`,
    });
    setSelectedIds([]);
  };

  const handleIgnore = (channelId: string) => {
    addToBlacklist(channelId);
    addToast({
      type: 'info',
      message: 'Канал добавлен в чёрный список и скрыт.',
    });
  };

  const handleFindSimilar = (channel: YouTubeSearchResponse['channels'][0]) => {
    const words = `${channel.name} ${channel.niche}`
      .replace(/[^\p{L}\s]/gu, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3)
      .join(' ');

    if (words) {
      setQuery(words);
      executeSearch(words);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text flex items-center gap-2">
            <Search size={22} className="text-accent" />
            <span>Поиск каналов</span>
          </h1>
        </div>

        {sessionQuotaUsed > 7000 && (
          <div className="flex items-center gap-2 text-xs font-mono text-warning bg-warning/10 border border-warning/30 px-3 py-1.5 rounded-control">
            <span>Квота YouTube: {sessionQuotaUsed} / 10 000</span>
          </div>
        )}
      </div>

      {/* Main Search Panel */}
      <div className="bg-surface rounded-card p-5 border border-border space-y-4">
        {/* Country / Market Selection */}
        <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-border/50">
          <span className="text-xs text-text-muted font-medium mr-1">Рынок клиентов:</span>
          <button
            type="button"
            onClick={() => {
              setRegion('KZ');
              setLanguage('ru');
              setChips(DEFAULT_CHIPS_KZ);
              setQuery(DEFAULT_CHIPS_KZ[0]);
            }}
            className={`px-3 py-1.5 text-xs rounded-control transition-colors flex items-center gap-1.5 border ${
              region === 'KZ'
                ? 'bg-surface text-text font-medium border-border shadow-none'
                : 'bg-surface-2 text-text-muted hover:text-text border-transparent'
            }`}
          >
            <FlagKZ />
            <span>Казахстан</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRegion('US');
              setLanguage('en');
              setChips(DEFAULT_CHIPS_US);
              setQuery(DEFAULT_CHIPS_US[0]);
            }}
            className={`px-3 py-1.5 text-xs rounded-control transition-colors flex items-center gap-1.5 border ${
              region === 'US'
                ? 'bg-surface text-text font-medium border-border shadow-none'
                : 'bg-surface-2 text-text-muted hover:text-text border-transparent'
            }`}
          >
            <FlagUS />
            <span>США / Global</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRegion('GB');
              setLanguage('en');
              setChips(DEFAULT_CHIPS_EU);
              setQuery(DEFAULT_CHIPS_EU[0]);
            }}
            className={`px-3 py-1.5 text-xs rounded-control transition-colors flex items-center gap-1.5 border ${
              ['GB', 'DE', 'NL', 'PL', 'FR', 'ES'].includes(region)
                ? 'bg-surface text-text font-medium border-border shadow-none'
                : 'bg-surface-2 text-text-muted hover:text-text border-transparent'
            }`}
          >
            <FlagEU />
            <span>Европа / UK</span>
          </button>
        </div>

        {/* Input & Search Button */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
              placeholder="Введите нишу (например: ai автоматизация, недвижимость дубая, крипта)..."
              className="w-full bg-surface-2 text-text text-sm rounded-control border border-border pl-10 pr-4 py-2.5 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>

          <button
            onClick={() => executeSearch()}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-control shadow-subtle disabled:opacity-50 transition-all shrink-0"
          >
            {isLoading ? (
              <RotateCw size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            <span>{isLoading ? 'Поиск...' : 'Найти каналы'}</span>
          </button>
        </div>

        {/* Chips */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted mr-1 font-medium">Ниши:</span>
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => {
                  setQuery(chip);
                  executeSearch(chip);
                }}
                className={`text-xs px-2.5 py-1 rounded-control border transition-all ${
                  query === chip
                    ? 'bg-accent-soft text-accent border-accent/40 font-semibold'
                    : 'bg-surface-2 text-text-muted hover:text-text border-border hover:bg-surface-3'
                }`}
              >
                {chip}
              </button>
            ))}
            <form onSubmit={handleAddChip} className="inline-flex">
              <input
                type="text"
                placeholder="+ свой чип"
                value={newChipInput}
                onChange={(e) => setNewChipInput(e.target.value)}
                className="w-24 bg-surface text-[11px] text-text rounded-control border border-border px-2 py-0.5 focus:outline-none focus:border-accent"
              />
            </form>
          </div>
        </div>

        {/* Extended Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-border/60 text-xs">
          {/* Subs Range */}
          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Подписчики (мин - макс)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={minSubs}
                onChange={(e) => setMinSubs(Number(e.target.value))}
                className="w-full bg-surface-2 border border-border rounded-control px-2 py-1.5 font-mono text-text text-xs"
                placeholder="5000"
              />
              <span className="text-muted">—</span>
              <input
                type="number"
                value={maxSubs}
                onChange={(e) => setMaxSubs(Number(e.target.value))}
                className="w-full bg-surface-2 border border-border rounded-control px-2 py-1.5 font-mono text-text text-xs"
                placeholder="50000"
              />
            </div>
          </div>

          {/* Region / Lang */}
          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Регион / Язык
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-surface-2 border border-border rounded-control px-2 py-1.5 text-text text-xs"
              >
                <option value="ru">RU (Рус)</option>
                <option value="en">EN (Англ)</option>
                <option value="ALL">Любой</option>
              </select>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="bg-surface-2 border border-border rounded-control px-2 py-1.5 text-text text-xs"
              >
                <option value="KZ">Казахстан (KZ)</option>
                <option value="US">США (US)</option>
                <option value="GB">Великобритания (UK)</option>
                <option value="DE">Германия (DE)</option>
                <option value="NL">Нидерланды (NL)</option>
                <option value="PL">Польша (PL)</option>
                <option value="FR">Франция (FR)</option>
                <option value="ES">Испания (ES)</option>
                <option value="ALL">Все</option>
              </select>
            </div>
          </div>

          {/* Activity */}
          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Активность (видео не старше N дней)
            </label>
            <input
              type="number"
              value={maxDaysActive}
              onChange={(e) => setMaxDaysActive(Number(e.target.value))}
              className="w-full bg-surface-2 border border-border rounded-control px-2 py-1.5 font-mono text-text text-xs"
              placeholder="30"
            />
          </div>

          {/* Depth / Pages */}
          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Глубина поиска (1-3 стр.)
            </label>
            <select
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="w-full bg-surface-2 border border-border rounded-control px-2 py-1.5 text-text text-xs"
            >
              <option value="1">1 страница (~100 юнитов)</option>
              <option value="2">2 страницы (~200 юнитов)</option>
              <option value="3">3 страницы (~300 юнитов)</option>
            </select>
          </div>
        </div>

        {/* Checkboxes */}
        <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-text-muted">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyWithProduct}
              onChange={(e) => setOnlyWithProduct(e.target.checked)}
              className="rounded bg-surface-2 border-border text-accent focus:ring-accent"
            />
            <span>Только с продуктом / ссылкой на продажу</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyWithEmail}
              onChange={(e) => setOnlyWithEmail(e.target.checked)}
              className="rounded bg-surface-2 border-border text-accent focus:ring-accent"
            />
            <span>Только с Email в описании</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideAlreadyAdded}
              onChange={(e) => setHideAlreadyAdded(e.target.checked)}
              className="rounded bg-surface-2 border-border text-accent focus:ring-accent"
            />
            <span>Скрыть уже добавленных в воронку</span>
          </label>
        </div>

        {/* Step-by-step progress indicator */}
        {isLoading && (
          <div className="p-3 bg-surface-2/60 rounded-control border border-accent/20 flex items-center gap-3 animate-pulse">
            <RotateCw size={15} className="animate-spin text-accent" />
            <span className="text-xs text-text font-medium">{progressStep}</span>
          </div>
        )}

        {/* Error / Key missing alert */}
        {searchError && (
          <div className="p-4 bg-warning-soft/20 border border-warning/40 rounded-card space-y-1.5">
            <div className="flex items-start gap-2.5 text-warning text-xs font-semibold">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{searchError}</span>
            </div>
            <p className="text-[11px] text-text-muted">
              Укажите действующий YouTube API ключ в разделе «Настройки», чтобы искать реальные каналы.
            </p>
          </div>
        )}
      </div>

      {/* Search History Chips */}
      {searchHistory.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted overflow-x-auto pb-1">
          <History size={13} className="shrink-0" />
          <span className="shrink-0">История:</span>
          {searchHistory.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(h);
                executeSearch(h);
              }}
              className="shrink-0 hover:text-text hover:underline"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* AI Evaluation Progress Bar */}
      {isAiScoring && aiProgress && (
        <div className="p-4 bg-surface rounded-card border border-accent/40 space-y-2 animate-fade-in-scale">
          <div className="flex items-center justify-between text-xs font-semibold text-text">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent animate-spin" />
              <span>ИИ оценивает {aiProgress.current}/{aiProgress.total}</span>
            </div>
            <span className="font-mono text-accent text-xs">
              {aiProgress.total > 0 ? Math.round((aiProgress.current / aiProgress.total) * 100) : 0}%
            </span>
          </div>
          <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden border border-border">
            <div
              className="bg-accent h-full transition-all duration-300 rounded-full"
              style={{
                width: `${aiProgress.total > 0 ? (aiProgress.current / aiProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Results Header & Actions Bar */}
      {results.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface p-3 rounded-card border border-border">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text font-semibold">
              Результаты: {displayedResults.length} из {results.length}
            </span>
            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkAdd}
                className="flex items-center gap-1.5 px-3 py-1 bg-accent text-white text-xs font-semibold rounded-control transition-colors"
              >
                <Plus size={13} />
                <span>Добавить выбранные ({selectedIds.length})</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by AI Score */}
            {aiEnabled && (
              <div className="flex items-center gap-1.5 text-xs text-text-muted bg-surface-2/60 px-2.5 py-1 rounded-control border border-border">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyMinAiScore}
                    onChange={(e) => setOnlyMinAiScore(e.target.checked)}
                    className="rounded bg-surface border-border text-accent focus:ring-accent"
                  />
                  <span className="text-[11px] font-medium text-text">Только с ИИ-оценкой ≥</span>
                </label>
                {onlyMinAiScore && (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minAiScoreValue}
                    onChange={(e) => setMinAiScoreValue(Number(e.target.value))}
                    className="w-12 bg-surface border border-border rounded px-1.5 py-0.5 text-text font-mono text-[11px] text-center focus:outline-none focus:border-accent"
                  />
                )}
              </div>
            )}

            {/* Sort */}
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <span>Сортировка:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-surface-2 border border-border rounded-control px-2 py-1 text-text text-xs"
              >
                <option value="score">По рейтингу клиента</option>
                <option value="subs">По подписчикам</option>
                <option value="date">По дате последнего видео</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-border rounded-control overflow-hidden">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 ${
                  viewMode === 'cards' ? 'bg-surface-2 text-accent' : 'text-muted hover:text-text'
                }`}
                aria-label="Карточки"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 ${
                  viewMode === 'table' ? 'bg-surface-2 text-accent' : 'text-muted hover:text-text'
                }`}
                aria-label="Таблица"
              >
                <TableIcon size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && results.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && results.length === 0 && !searchError && (
        <EmptyState
          icon={Search}
          title="Запустите поиск каналов"
          description="Выберите нишу из чипов выше или введите свою. Система найдёт каналы, вытащит контакты и посчитает рейтинг клиентов."
          actionText="Искать 'ai automation'"
          onAction={() => executeSearch('ai automation')}
        />
      )}

      {/* Results View: Cards or Table */}
      {!isLoading && results.length > 0 && viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedResults.map((channel) => {
            const isSelected = selectedIds.includes(channel.id);
            const isAdded = existingChannelIds.has(channel.channelId);

            return (
              <div
                key={channel.id}
                className="bg-surface hover:bg-surface-2/60 border border-border hover:border-border-strong rounded-card p-4 space-y-3 flex flex-col justify-between transition-colors shadow-subtle"
              >
                <div className="space-y-3">
                  {/* Top Bar: Checkbox, Avatar, Name, Tier */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds([...selectedIds, channel.id]);
                          } else {
                            setSelectedIds(selectedIds.filter((id) => id !== channel.id));
                          }
                        }}
                        className="mt-1 rounded bg-surface-2 border-border text-accent focus:ring-accent"
                      />

                      {channel.avatar ? (
                        <img
                          src={channel.avatar}
                          alt={channel.name}
                          className="w-10 h-10 rounded-full border border-border object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-accent shrink-0">
                          {channel.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <a
                          href={channel.channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-text hover:text-accent flex items-center gap-1 truncate"
                        >
                          <span className="truncate">{channel.name}</span>
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                        <div className="font-mono text-[11px] text-muted mt-0.5">
                          {channel.hiddenSubscribers
                            ? 'Сабы скрыты'
                            : `${channel.subscribers.toLocaleString('ru-RU')} подписчиков`}
                        </div>
                      </div>
                    </div>

                    <TierBadge tier={channel.tier} />
                  </div>

                  {/* Score & Offer */}
                  <div className="flex items-center justify-between text-xs py-1 border-y border-border/40">
                    <div className="flex items-center gap-2">
                      {channel.aiScore !== undefined && (
                        <span
                          title={channel.aiReason || 'Оценка соответствия ИИ'}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-accent-soft text-accent border border-accent/25"
                        >
                          <Sparkles size={10} />
                          <span>ИИ: {channel.aiScore}</span>
                        </span>
                      )}
                      <ScoreBar score={channel.score} />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {channel.hasProduct && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning-soft px-1.5 py-0.5 rounded">
                          <Flame size={12} />
                          <span>Есть продукт</span>
                        </span>
                      )}
                      {aiEnabled && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedAiCardId(expandedAiCardId === channel.id ? null : channel.id)
                          }
                          className="text-muted hover:text-accent p-1 rounded text-[11px] flex items-center gap-0.5 transition-colors"
                          title="Развернуть ИИ-анализ"
                        >
                          <Sparkles size={12} />
                          {expandedAiCardId === channel.id ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded AI analysis details */}
                  {expandedAiCardId === channel.id && aiEnabled && (
                    <div className="p-3 bg-surface-2/70 rounded-control border border-accent/25 space-y-2 text-xs animate-fade-in-scale">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-accent flex items-center gap-1">
                          <Sparkles size={11} /> ИИ-квалификация
                        </span>
                        <button
                          type="button"
                          onClick={() => handleReevaluateSingleChannel(channel)}
                          disabled={reevaluatingId === channel.id}
                          className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1 disabled:opacity-50"
                        >
                          <RotateCw
                            size={10}
                            className={reevaluatingId === channel.id ? 'animate-spin text-accent' : ''}
                          />
                          <span>Переоценить</span>
                        </button>
                      </div>

                      {channel.aiScore !== undefined ? (
                        <>
                          {channel.aiReason && (
                            <p className="text-[11px] text-text leading-relaxed">
                              {channel.aiReason}
                            </p>
                          )}

                          {channel.aiPainHypotheses && channel.aiPainHypotheses.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] text-muted uppercase font-semibold block">
                                Гипотезы болей:
                              </span>
                              <ul className="space-y-0.5">
                                {channel.aiPainHypotheses.map((p, pI) => (
                                  <li key={pI} className="text-[11px] text-text-muted flex items-start gap-1">
                                    <span className="text-accent font-bold">•</span>
                                    <span>{p}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {channel.aiAngle && (
                            <div className="pt-1.5 space-y-1.5 border-t border-border/60">
                              <span className="text-[10px] text-accent uppercase font-semibold block">
                                Идея первой строки:
                              </span>
                              <div className="text-[11px] text-text italic bg-surface p-2 rounded border border-border">
                                "{channel.aiAngle}"
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUseOpeningAngle(channel)}
                                className="w-full py-1.5 px-2.5 bg-accent hover:bg-accent-hover text-white rounded text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 shadow-subtle"
                              >
                                <Sparkles size={11} />
                                <span>Использовать как первую строку</span>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-[11px] text-muted italic flex items-center justify-between">
                          <span>Канал ещё не оценён ИИ</span>
                          <button
                            type="button"
                            onClick={() => handleReevaluateSingleChannel(channel)}
                            disabled={reevaluatingId === channel.id}
                            className="px-2 py-1 bg-accent text-white rounded text-[10px] font-semibold"
                          >
                            Оценить
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Last Video */}
                  {channel.lastVideo && (
                    <div className="text-[11px] space-y-0.5 bg-surface-2/40 p-2 rounded-control border border-border/50">
                      <span className="text-[10px] text-muted block uppercase font-medium">
                        Последнее видео ({formatDate(channel.lastVideo.publishedAt)}):
                      </span>
                      <a
                        href={channel.lastVideo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text hover:text-accent font-medium line-clamp-1 flex items-center gap-1"
                      >
                        <Play size={10} className="text-accent shrink-0" />
                        <span>{channel.lastVideo.title}</span>
                      </a>
                    </div>
                  )}

                  {/* Contacts Found Icons */}
                  <div className="flex items-center gap-2 pt-1 text-muted text-xs">
                    {channel.email && (
                      <span title={channel.email} className="text-info flex items-center gap-1">
                        <Mail size={13} />
                        <span className="text-[10px] truncate max-w-[80px]">Email</span>
                      </span>
                    )}
                    {channel.telegram && (
                      <span title={channel.telegram} className="text-accent flex items-center gap-1">
                        <Send size={13} />
                        <span className="text-[10px] truncate max-w-[80px]">{channel.telegram}</span>
                      </span>
                    )}
                    {channel.instagram && (
                      <span title={channel.instagram} className="text-[#E1306C] flex items-center gap-1">
                        <Instagram size={13} />
                      </span>
                    )}
                    {channel.website && (
                      <span title={channel.website} className="text-text-muted flex items-center gap-1">
                        <Globe size={13} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-border/60">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleIgnore(channel.channelId)}
                      title="В чёрный список (больше не показывать)"
                      className="text-muted hover:text-danger p-1 rounded"
                    >
                      <Ban size={14} />
                    </button>
                    <button
                      onClick={() => handleFindSimilar(channel)}
                      title="Найти похожие каналы"
                      className="text-muted hover:text-accent p-1 rounded text-xs flex items-center gap-0.5"
                    >
                      <Sparkles size={13} />
                      <span className="hidden xl:inline text-[10px]">Похожие</span>
                    </button>
                    {aiEnabled && (
                      <button
                        onClick={() => handleReevaluateSingleChannel(channel)}
                        disabled={reevaluatingId === channel.id}
                        title="Переоценить через ИИ"
                        className="text-muted hover:text-accent p-1 rounded text-xs flex items-center gap-0.5"
                      >
                        <RotateCw
                          size={13}
                          className={reevaluatingId === channel.id ? 'animate-spin text-accent' : ''}
                        />
                      </button>
                    )}
                  </div>

                  {isAdded ? (
                    <span className="text-[11px] font-medium text-success flex items-center gap-1">
                      <Check size={13} /> В воронке
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddSingleLead(channel)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control transition-colors"
                    >
                      <Plus size={13} />
                      <span>В лиды</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {!isLoading && results.length > 0 && viewMode === 'table' && (
        <div className="bg-surface rounded-card border border-border overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2/60 border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === displayedResults.length && displayedResults.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(displayedResults.map((d) => d.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="rounded bg-surface-2 border-border text-accent focus:ring-accent"
                  />
                </th>
                <th className="p-3">Канал</th>
                <th className="p-3">Подписчики</th>
                <th className="p-3">Класс & Балл</th>
                <th className="p-3">Последнее видео</th>
                <th className="p-3">Контакты</th>
                <th className="p-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sortedResults.map((channel) => {
                const isSelected = selectedIds.includes(channel.id);
                const isAdded = existingChannelIds.has(channel.channelId);

                return (
                  <tr key={channel.id} className="hover:bg-surface-2/30 transition-colors">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds([...selectedIds, channel.id]);
                          } else {
                            setSelectedIds(selectedIds.filter((id) => id !== channel.id));
                          }
                        }}
                        className="rounded bg-surface-2 border-border text-accent focus:ring-accent"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={channel.avatar}
                          alt=""
                          className="w-7 h-7 rounded-full border border-border object-cover"
                        />
                        <div className="min-w-0">
                          <a
                            href={channel.channelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-text hover:text-accent flex items-center gap-1"
                          >
                            <span className="truncate max-w-[180px]">{channel.name}</span>
                            <ExternalLink size={10} />
                          </a>
                          {channel.hasProduct && (
                            <span className="text-[10px] text-warning font-medium">
                              есть продукт
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono">
                      {channel.hiddenSubscribers ? 'Скрыто' : channel.subscribers.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="space-y-1">
                        <TierBadge tier={channel.tier} showLabel={false} />
                        <div className="flex items-center gap-1.5">
                          {channel.aiScore !== undefined && (
                            <span
                              title={channel.aiReason || 'ИИ-оценка'}
                              className="px-1 py-0.2 rounded text-[10px] font-mono font-bold bg-accent-soft text-accent border border-accent/20"
                            >
                              ИИ:{channel.aiScore}
                            </span>
                          )}
                          <ScoreBar score={channel.score} />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 max-w-[200px]">
                      {channel.lastVideo ? (
                        <div className="truncate">
                          <a
                            href={channel.lastVideo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-muted hover:text-accent truncate block"
                          >
                            {channel.lastVideo.title}
                          </a>
                          <span className="text-[10px] text-muted font-mono">
                            {formatDate(channel.lastVideo.publishedAt)}
                          </span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {channel.email && <Mail size={13} className="text-info" />}
                        {channel.telegram && <Send size={13} className="text-accent" />}
                        {channel.website && <Globe size={13} className="text-muted" />}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {aiEnabled && (
                          <button
                            type="button"
                            onClick={() => handleReevaluateSingleChannel(channel)}
                            disabled={reevaluatingId === channel.id}
                            className="p-1 text-muted hover:text-accent rounded"
                            title="Переоценить через ИИ"
                          >
                            <RotateCw
                              size={12}
                              className={reevaluatingId === channel.id ? 'animate-spin text-accent' : ''}
                            />
                          </button>
                        )}
                        {isAdded ? (
                          <span className="text-success text-xs font-semibold flex items-center justify-end gap-1">
                            <Check size={13} /> В воронке
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAddSingleLead(channel)}
                            className="px-2.5 py-1 bg-accent text-white rounded text-xs font-semibold hover:bg-accent-hover transition-colors"
                          >
                            В лиды
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pitch Generator Modal */}
      <PitchGeneratorModal
        isOpen={Boolean(pitchLead)}
        onClose={() => {
          setPitchLead(null);
          setPitchOpeningAngle(undefined);
        }}
        lead={pitchLead}
        initialOpeningAngle={pitchOpeningAngle}
      />
    </div>
  );
};
