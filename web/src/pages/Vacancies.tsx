import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVacanciesStore, computeVacancyRelevance } from '../store/vacanciesStore';
import { useLeadsStore } from '../store/leadsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { fetchTelegramFeed, fetchRedditFeed, fetchUpworkJobs } from '../lib/api';
import { playNotificationBeep, sendBrowserNotification } from '../lib/notifications';
import { normalizeText, computeTextHash } from '../shared/filter.js';
import { detectVacancyRegion } from '../shared/regions.js';
import { Vacancy } from '../types';
import { CardSkeleton } from '../components/Skeleton';
import { VacancyCard } from '../components/VacancyCard';
import { PitchGeneratorModal } from '../components/PitchGeneratorModal';
import { UpworkCopilotModal } from '../components/UpworkCopilotModal';
import { VacancyHeader } from '../components/vacancies/VacancyHeader';
import {
  VacancyFiltersBar,
  FormatFilter,
} from '../components/vacancies/VacancyFiltersBar';
import { Zap } from 'lucide-react';

export type RegionTab = 'all' | 'eu' | 'us' | 'kz';
export type PlatformTab = 'all' | 'telegram' | 'reddit' | 'upwork';

export const Vacancies: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    sources,
    vacancies,
    includeKeywords,
    excludeKeywords,
    lastRefreshedAt,
    isLoading,
    lastError,
    scrapeOffset,
    hiddenChannels,
    mergeNewVacancies,
    markSeen,
    hideVacancy,
    hideChannel,
    setLoading,
    setLastRefreshedAt,
    setLastError,
    setScrapeOffset,
  } = useVacanciesStore();

  const addLead = useLeadsStore((s) => s.addLead);
  const {
    soundEnabled,
    notificationsEnabled,
    autoTranslateVacancies,
    setAutoTranslateVacancies,
  } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);

  const [activePitchVacancy, setActivePitchVacancy] = useState<Vacancy | null>(null);
  const [showUpworkCopilot, setShowUpworkCopilot] = useState(false);
  const [showShady, setShowShady] = useState(false);
  const isRefreshingRef = useRef(false);

  // Region Tab: EU + US + KZ combined by default
  const rawParam = searchParams.get('region') || 'all';
  const regionTab: RegionTab = (
    rawParam === 'eu' || rawParam === 'us' || rawParam === 'kz' ? rawParam : 'all'
  );

  // Source Platform Tab: Telegram + Reddit [Hiring] + Upwork
  const rawPlatform = searchParams.get('platform') || 'all';
  const platformTab: PlatformTab = (
    rawPlatform === 'telegram' || rawPlatform === 'reddit' || rawPlatform === 'upwork'
      ? rawPlatform
      : 'all'
  );

  const setPlatformTab = (tab: PlatformTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab && tab !== 'all') next.set('platform', tab);
      else next.delete('platform');
      return next;
    });
  };

  const setRegionTab = (tab: RegionTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab && tab !== 'all') next.set('region', tab);
      else next.delete('region');
      return next;
    });
  };

  // 2 URL Filters: Hot (<20 min) and Format
  const hotOnly = searchParams.get('hot') === '1';
  const formatFilter = (searchParams.get('format') || 'all') as FormatFilter;

  const setHotOnly = (val: boolean) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val) next.set('hot', '1');
      else next.delete('hot');
      return next;
    });
  };

  const setFormatFilter = (fmt: FormatFilter) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (fmt && fmt !== 'all') next.set('format', fmt);
      else next.delete('format');
      return next;
    });
  };

  // Channel polling & refresh with round-robin rotation (stable reference, no infinite effect loop)
  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    const state = useVacanciesStore.getState();
    const {
      sources: currentSources,
      scrapeOffset: currentOffset,
      hiddenChannels: currentHidden,
      includeKeywords: currentInclude,
      excludeKeywords: currentExclude,
    } = state;

    const hiddenSet = new Set(currentHidden.map((c) => c.toLowerCase()));
    const eligibleChannels = currentSources.filter(
      (s) =>
        s.enabled &&
        s.type !== 'group' &&
        s.region !== 'RU' &&
        !hiddenSet.has(s.username.toLowerCase())
    );

    eligibleChannels.sort((a, b) => {
      const aScore = (a as any).recommended ? 2 : 1;
      const bScore = (b as any).recommended ? 2 : 1;
      return bScore - aScore;
    });

    if (eligibleChannels.length === 0) {
      isRefreshingRef.current = false;
      return;
    }

    const batchSize = 15;
    const offset = currentOffset % eligibleChannels.length;
    const batchChannels: string[] = [];
    for (let i = 0; i < Math.min(batchSize, eligibleChannels.length); i++) {
      const idx = (offset + i) % eligibleChannels.length;
      batchChannels.push(eligibleChannels[idx].username);
    }
    const nextOffset = (offset + batchSize) % eligibleChannels.length;
    setScrapeOffset(nextOffset);

    setLoading(true);
    try {
      const [tgSettled, redditSettled, upworkSettled] = await Promise.allSettled([
        fetchTelegramFeed(batchChannels),
        fetchRedditFeed(),
        fetchUpworkJobs(),
      ]);

      const processed: Vacancy[] = [];

      if (tgSettled.status === 'fulfilled') {
        const res = tgSettled.value;
        setLastError(null);
        for (const msg of res.allMessages) {
          const isWorkerLead = Boolean((msg as any).fromWorker === true);

          const {
            relevance,
            matchedKeywords,
            skills,
            isExcluded,
            formatTag,
            qualityTier,
            statusBadge,
            budget,
            region,
          } = computeVacancyRelevance(
            msg.text,
            currentInclude,
            currentExclude,
            isWorkerLead,
            msg.postedAt,
            msg.channel
          );

          if (region === 'RU' || budget?.currency === 'RUB') {
            continue;
          }

          if (!isExcluded && (isWorkerLead || matchedKeywords.length > 0)) {
            processed.push({
              id: msg.id,
              channel: msg.channel,
              text: msg.text,
              url: msg.url,
              postedAt: msg.postedAt,
              views: msg.views,
              matchedKeywords,
              skills,
              relevance,
              formatTag,
              qualityTier,
              statusBadge,
              region,
              sourcePlatform: 'telegram',
              budget: budget || (msg as any).budget || null,
              fromWorker: isWorkerLead,
              seen: false,
              hidden: false,
            });
          }
        }
      }

      if (redditSettled.status === 'fulfilled' && Array.isArray(redditSettled.value?.items)) {
        for (const rItem of redditSettled.value.items) {
          processed.push({
            ...rItem,
            sourcePlatform: 'reddit',
            region: rItem.region === 'RU' ? 'US' : rItem.region || 'US',
          });
        }
      }

      if (upworkSettled.status === 'fulfilled' && Array.isArray(upworkSettled.value?.items)) {
        for (const uItem of upworkSettled.value.items) {
          processed.push({
            ...uItem,
            sourcePlatform: 'upwork',
            region: 'US',
          });
        }
      }

      if (
        tgSettled.status === 'rejected' &&
        redditSettled.status === 'rejected' &&
        upworkSettled.status === 'rejected'
      ) {
        const reason = tgSettled.reason;
        throw reason instanceof Error ? reason : new Error('Не удалось обновить источники');
      }

      const { newCount, hotCount } = mergeNewVacancies(processed);
      setLastRefreshedAt(new Date().toISOString());

      if (newCount > 0) {
        if (soundEnabled) playNotificationBeep();
        if (notificationsEnabled) {
          sendBrowserNotification(
            `LeadHunter: ${newCount} новых заказов!`,
            hotCount > 0 ? `${hotCount} горячих (<20 мин)` : 'Проверьте ленту заказов'
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при получении вакансий';
      setLastError(msg);
    } finally {
      setLoading(false);
      isRefreshingRef.current = false;
    }
  }, [
    mergeNewVacancies,
    setLoading,
    setLastRefreshedAt,
    setLastError,
    setScrapeOffset,
    soundEnabled,
    notificationsEnabled,
  ]);

  const refreshRef = useRef(handleRefresh);
  refreshRef.current = handleRefresh;

  // Polling every 60s while tab is visible (runs once on mount, no endless loop)
  useEffect(() => {
    refreshRef.current();

    let intervalId: any = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(() => {
          if (document.visibilityState === 'visible') {
            refreshRef.current();
          }
        }, 60000);
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshRef.current();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const activeSourcesCount = useMemo(() => {
    return sources.filter((s) => s.enabled && s.region !== 'RU').length;
  }, [sources]);

  // Source platform counts & Region counts
  const platformCounts = useMemo(() => {
    let telegram = 0;
    let reddit = 0;
    let upwork = 0;
    for (const v of vacancies) {
      if (v.hidden) continue;
      const r = v.region || detectVacancyRegion(v.text, v.channel);
      if (r === 'RU' || v.budget?.currency === 'RUB') continue;
      const plat =
        v.sourcePlatform ||
        (v.channel.startsWith('r/') ? 'reddit' : v.channel === 'Upwork' ? 'upwork' : 'telegram');
      if (plat === 'reddit') reddit++;
      else if (plat === 'upwork') upwork++;
      else telegram++;
    }
    return { telegram, reddit, upwork, total: telegram + reddit + upwork };
  }, [vacancies]);

  // Region counts for tabs (EU, US, KZ only — RU excluded)
  const regionCounts = useMemo(() => {
    let eu = 0;
    let us = 0;
    let kz = 0;
    for (const v of vacancies) {
      if (v.hidden) continue;
      const r = v.region || detectVacancyRegion(v.text, v.channel);
      if (r === 'RU' || v.budget?.currency === 'RUB') continue;
      if (r === 'EU') eu++;
      else if (r === 'KZ') kz++;
      else us++;
    }
    return { eu, us, kz, total: eu + us + kz };
  }, [vacancies]);

  // Filter vacancies (includes platformTab & regionTab dependencies and drops RU items)
  const filteredVacancies = useMemo(() => {
    const hiddenSet = new Set(hiddenChannels.map((c) => c.toLowerCase()));
    const now = Date.now();

    return vacancies.filter((v) => {
      if (v.hidden) return false;
      if (hiddenSet.has(v.channel.toLowerCase().replace(/^@/, ''))) return false;

      const vRegion = v.region || detectVacancyRegion(v.text, v.channel);
      if (vRegion === 'RU' || v.budget?.currency === 'RUB') return false;

      const plat =
        v.sourcePlatform ||
        (v.channel.startsWith('r/') ? 'reddit' : v.channel === 'Upwork' ? 'upwork' : 'telegram');
      if (platformTab !== 'all' && plat !== platformTab) return false;

      if (regionTab === 'eu' && vRegion !== 'EU') return false;
      if (regionTab === 'us' && vRegion !== 'US') return false;
      if (regionTab === 'kz' && vRegion !== 'KZ') return false;

      if (hotOnly) {
        const isHot = now - new Date(v.postedAt).getTime() < 20 * 60 * 1000;
        if (!isHot && v.statusBadge !== 'hot') return false;
      }

      if (formatFilter !== 'all') {
        const lower = v.text.toLowerCase();
        if (formatFilter === 'reels') {
          const isReels = v.formatTag === 'short' || /reels|shorts|tiktok|рилс|тикто/i.test(lower);
          if (!isReels) return false;
        } else if (formatFilter === 'youtube') {
          const isYt = v.formatTag === 'long' || /youtube|ютуб|длинн|горизонтал/i.test(lower);
          if (!isYt) return false;
        } else if (formatFilter === 'podcast') {
          const isPod = /подкаст|интервью|podcast/i.test(lower);
          if (!isPod) return false;
        } else if (formatFilter === 'other') {
          const isOther = !/reels|shorts|tiktok|рилс|youtube|ютуб|подкаст|podcast/i.test(lower);
          if (!isOther) return false;
        }
      }

      return true;
    });
  }, [vacancies, hiddenChannels, platformTab, regionTab, hotOnly, formatFilter]);

  // Cluster cross-posts
  const clusteredVacancies = useMemo(() => {
    const clusters = new Map<string, Vacancy[]>();
    for (const v of filteredVacancies) {
      const norm = normalizeText(v.text).slice(0, 160);
      const hash = computeTextHash(norm);
      const list = clusters.get(hash) || [];
      list.push(v);
      clusters.set(hash, list);
    }

    const result: Vacancy[] = [];
    for (const list of clusters.values()) {
      result.push({ ...list[0] });
    }

    return result.sort(
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );
  }, [filteredVacancies]);

  const normalVacancies = useMemo(
    () => clusteredVacancies.filter((v) => v.qualityTier !== 'shady'),
    [clusteredVacancies]
  );
  const shadyVacancies = useMemo(
    () => clusteredVacancies.filter((v) => v.qualityTier === 'shady'),
    [clusteredVacancies]
  );

  const displayedList = showShady ? clusteredVacancies : normalVacancies;

  const handleConvertToLead = (vac: Vacancy) => {
    const existingLeads = useLeadsStore.getState().leads;
    const isAlreadyLead = existingLeads.some(
      (l) => Boolean(l.channelUrl && vac.url && l.channelUrl.trim() === vac.url.trim())
    );

    if (isAlreadyLead) {
      addToast({
        type: 'info',
        title: 'Уже в воронке',
        message: `Этот заказ из @${vac.channel.replace(/^@/, '')} уже добавлен в воронку.`,
      });
      return;
    }

    const r = vac.region || detectVacancyRegion(vac.text, vac.channel);
    const plat = vac.sourcePlatform || (vac.channel.startsWith('r/') ? 'reddit' : vac.channel === 'Upwork' ? 'upwork' : 'telegram');
    addLead({
      name: plat === 'telegram' ? `@${vac.channel.replace(/^@/, '')}` : `${vac.channel}: ${vac.text.slice(0, 36)}`,
      channelUrl: vac.url,
      notes: vac.translatedText ? `${vac.translatedText}\n\n---\n${vac.text}` : vac.text,
      region: r === 'RU' ? 'US' : r,
      source: plat === 'reddit' ? 'Reddit [Hiring]' : plat === 'upwork' ? 'Upwork' : 'Telegram',
      sourcePlatform: plat,
      connectsSpent: vac.upworkMeta?.connectsRequired,
      upworkMeta: vac.upworkMeta,
      status: 'new',
    });
    addToast({
      type: 'success',
      title: 'Сохранено в лиды',
      message: `Заказ из ${vac.channel} перенесён в воронку.`,
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      <VacancyHeader
        count={normalVacancies.length}
        lastRefreshedAt={lastRefreshedAt}
        isLoading={isLoading}
        onRefresh={handleRefresh}
        lastError={lastError}
      />

      {/* Platform Tabs: All / Telegram / Reddit [Hiring] / Upwork Copilot */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-surface-2 rounded-control border border-border">
          <button
            type="button"
            onClick={() => setPlatformTab('all')}
            className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
              platformTab === 'all'
                ? 'bg-surface text-text shadow font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <span>Все потоки</span>
            <span className="text-[10px] font-mono opacity-80">{platformCounts.total}</span>
          </button>
          <button
            type="button"
            onClick={() => setPlatformTab('telegram')}
            className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
              platformTab === 'telegram'
                ? 'bg-sky-600 text-white shadow font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <span>Telegram</span>
            <span className="text-[10px] font-mono opacity-80">{platformCounts.telegram}</span>
          </button>
          <button
            type="button"
            onClick={() => setPlatformTab('reddit')}
            className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
              platformTab === 'reddit'
                ? 'bg-orange-600 text-white shadow font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <span>Reddit [Hiring]</span>
            <span className="text-[10px] font-mono opacity-80">{platformCounts.reddit}</span>
          </button>
          <button
            type="button"
            onClick={() => setPlatformTab('upwork')}
            className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
              platformTab === 'upwork'
                ? 'bg-emerald-600 text-white shadow font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <span>Upwork</span>
            <span className="text-[10px] font-mono opacity-80">{platformCounts.upwork}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowUpworkCopilot(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-control shadow-sm transition-colors"
        >
          <Zap size={13} />
          <span>Upwork Copilot</span>
        </button>
      </div>

      {/* Region Tabs: EU + US + KZ */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-surface-2 rounded-control border border-border">
        <button
          type="button"
          onClick={() => setRegionTab('all')}
          className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
            regionTab === 'all'
              ? 'bg-accent text-white shadow font-semibold'
              : 'text-text-muted hover:text-text hover:bg-surface'
          }`}
        >
          <span>🌍 Все (EU + US + KZ)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25">{regionCounts.total}</span>
        </button>
        <button
          type="button"
          onClick={() => setRegionTab('eu')}
          className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
            regionTab === 'eu'
              ? 'bg-indigo-600 text-white shadow font-semibold'
              : 'text-text-muted hover:text-text hover:bg-surface'
          }`}
        >
          <span>🇪🇺 Европа / UK</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25">{regionCounts.eu}</span>
        </button>
        <button
          type="button"
          onClick={() => setRegionTab('us')}
          className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
            regionTab === 'us'
              ? 'bg-sky-600 text-white shadow font-semibold'
              : 'text-text-muted hover:text-text hover:bg-surface'
          }`}
        >
          <span>🇺🇸 США / Global</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25">{regionCounts.us}</span>
        </button>
        <button
          type="button"
          onClick={() => setRegionTab('kz')}
          className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 font-medium ${
            regionTab === 'kz'
              ? 'bg-emerald-600 text-white shadow font-semibold'
              : 'text-text-muted hover:text-text hover:bg-surface'
          }`}
        >
          <span>🇰🇿 Казахстан</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25">{regionCounts.kz}</span>
        </button>
      </div>

      {/* Filters & Translation Toggle */}
      <VacancyFiltersBar
        hotOnly={hotOnly}
        onToggleHotOnly={setHotOnly}
        formatFilter={formatFilter}
        onChangeFormatFilter={setFormatFilter}
        activeSourcesCount={activeSourcesCount}
        totalSourcesCount={sources.length}
        autoTranslate={autoTranslateVacancies ?? true}
        onToggleAutoTranslate={setAutoTranslateVacancies}
      />

      {/* Vacancy Card List */}
      <div className="space-y-3 pt-1">
        {isLoading && displayedList.length === 0 ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : displayedList.length === 0 ? (
          <div className="bg-surface rounded-card p-8 border border-border text-center space-y-3">
            {lastError ? (
              <div className="space-y-3">
                <p className="text-sm text-danger font-medium">
                  Ошибка загрузки вакансий: {lastError}
                </p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control transition-colors"
                >
                  Повторить запрос
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-text-muted">
                  {hotOnly
                    ? 'Сейчас нет горящих вакансий за последние 20 минут.'
                    : regionTab === 'eu'
                    ? 'В ленте Европы / UK пока нет заказов по выбранным фильтрам.'
                    : regionTab === 'us'
                    ? 'В ленте США / Global пока нет заказов по выбранным фильтрам.'
                    : regionTab === 'kz'
                    ? 'В ленте Казахстана пока нет заказов по выбранным фильтрам.'
                    : 'В лентах EU, US и KZ пока нет заказов по выбранным фильтрам.'}
                </p>
                {hotOnly && (
                  <button
                    type="button"
                    onClick={() => setHotOnly(false)}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control transition-colors"
                  >
                    Показать все вакансии
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          displayedList.map((vac) => (
            <VacancyCard
              key={vac.id}
              vacancy={vac}
              onApply={() => {
                markSeen(vac.id);
                setActivePitchVacancy(vac);
              }}
              onConvertToLead={() => handleConvertToLead(vac)}
              onHide={() => hideVacancy(vac.id)}
              onHideChannel={(ch) => {
                hideChannel(ch);
                addToast({
                  type: 'info',
                  message: `Канал @${ch} скрыт из ленты.`,
                });
              }}
            />
          ))
        )}
      </div>

      {/* Shady toggle */}
      {shadyVacancies.length > 0 && (
        <div className="text-center pt-4 pb-8">
          <button
            type="button"
            onClick={() => setShowShady(!showShady)}
            className="text-xs text-muted hover:text-text-muted transition-colors underline underline-offset-4"
          >
            {showShady
              ? 'Скрыть сомнительные вакансии'
              : `Показать ${shadyVacancies.length} скрытых сомнительных`}
          </button>
        </div>
      )}

      {/* Pitch Modal */}
      <PitchGeneratorModal
        isOpen={Boolean(activePitchVacancy)}
        onClose={() => setActivePitchVacancy(null)}
        vacancy={activePitchVacancy}
      />

      {/* Upwork Copilot Modal */}
      <UpworkCopilotModal
        isOpen={showUpworkCopilot}
        onClose={() => setShowUpworkCopilot(false)}
      />
    </div>
  );
};
