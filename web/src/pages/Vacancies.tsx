import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useLeadsStore } from '../store/leadsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { fetchTelegramFeed } from '../lib/api';
import { computeVacancyRelevance } from '../store/vacanciesStore';
import { playNotificationBeep, sendBrowserNotification } from '../lib/notifications';
import { normalizeText, computeTextHash } from '../shared/filter.js';
import { Vacancy } from '../types';
import { CardSkeleton } from '../components/Skeleton';
import { VacancyCard } from '../components/VacancyCard';
import { PitchGeneratorModal } from '../components/PitchGeneratorModal';
import { VacancyHeader } from '../components/vacancies/VacancyHeader';
import {
  VacancyFiltersBar,
  FormatFilter,
} from '../components/vacancies/VacancyFiltersBar';

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
  const { soundEnabled, notificationsEnabled } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);

  const [activePitchVacancy, setActivePitchVacancy] = useState<Vacancy | null>(null);
  const [showShady, setShowShady] = useState(false);
  const isRefreshingRef = useRef(false);

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

  // Channel polling & refresh with round-robin rotation
  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    // Filter only eligible channels (no groups, enabled, not hidden)
    const hiddenSet = new Set(hiddenChannels.map((c) => c.toLowerCase()));
    const eligibleChannels = sources.filter(
      (s) => s.enabled && s.type !== 'group' && !hiddenSet.has(s.username.toLowerCase())
    );

    // Prioritize recommended channels
    eligibleChannels.sort((a, b) => {
      const aScore = (a as any).recommended ? 2 : 1;
      const bScore = (b as any).recommended ? 2 : 1;
      return bScore - aScore;
    });

    if (eligibleChannels.length === 0) {
      isRefreshingRef.current = false;
      return;
    }

    // Round-robin slice of 15 channels
    const batchSize = 15;
    const currentOffset = scrapeOffset % eligibleChannels.length;
    const batchChannels: string[] = [];
    for (let i = 0; i < Math.min(batchSize, eligibleChannels.length); i++) {
      const idx = (currentOffset + i) % eligibleChannels.length;
      batchChannels.push(eligibleChannels[idx].username);
    }
    const nextOffset = (currentOffset + batchSize) % eligibleChannels.length;
    setScrapeOffset(nextOffset);

    setLoading(true);
    try {
      const res = await fetchTelegramFeed(batchChannels);
      setLastError(null);
      const processed: Vacancy[] = [];

      for (const msg of res.allMessages) {
        // A3.a: Only genuine worker leads have fromWorker === true
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
        } = computeVacancyRelevance(
          msg.text,
          includeKeywords,
          excludeKeywords,
          isWorkerLead,
          msg.postedAt
        );

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
            budget: budget || (msg as any).budget || null,
            fromWorker: isWorkerLead,
            seen: false,
            hidden: false,
          });
        }
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
    sources,
    scrapeOffset,
    hiddenChannels,
    includeKeywords,
    excludeKeywords,
    mergeNewVacancies,
    setLoading,
    setLastRefreshedAt,
    setLastError,
    setScrapeOffset,
    soundEnabled,
    notificationsEnabled,
  ]);

  // A3.b: Polling every 60s while tab is visible, immediate on mount and visibility change
  useEffect(() => {
    handleRefresh();

    let intervalId: any = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(() => {
          if (document.visibilityState === 'visible') {
            handleRefresh();
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
        handleRefresh();
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
  }, [handleRefresh]);

  // Active sources count (sources with leads in last 7 days)
  const activeSourcesCount = useMemo(() => {
    return sources.filter((s) => s.enabled).length;
  }, [sources]);

  // Filter vacancies
  const filteredVacancies = useMemo(() => {
    const hiddenSet = new Set(hiddenChannels.map((c) => c.toLowerCase()));
    const now = Date.now();

    return vacancies.filter((v) => {
      if (v.hidden) return false;
      if (hiddenSet.has(v.channel.toLowerCase().replace(/^@/, ''))) return false;

      // Hot filter (<20 min)
      if (hotOnly) {
        const isHot = now - new Date(v.postedAt).getTime() < 20 * 60 * 1000;
        if (!isHot && v.statusBadge !== 'hot') return false;
      }

      // Format filter
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
          const isOther = !/reels|shorts|tiktok|рилс|youtube|ютуб|подкаст/i.test(lower);
          if (!isOther) return false;
        }
      }

      return true;
    });
  }, [vacancies, hiddenChannels, hotOnly, formatFilter]);

  // Cluster cross-posts (deduplicate identical announcements across channels)
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
      const primary = { ...list[0] };
      result.push(primary);
    }

    // Always sort by date, newest first
    return result.sort(
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );
  }, [filteredVacancies]);

  // Split normal vs shady
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
        message: `Этот заказ из @${vac.channel} уже добавлен в воронку.`,
      });
      return;
    }

    addLead({
      name: `@${vac.channel.replace(/^@/, '')}`,
      channelUrl: vac.url,
      notes: vac.text,
      status: 'new',
    });
    addToast({
      type: 'success',
      title: 'Сохранено в лиды',
      message: `Заказ из @${vac.channel} перенесён в воронку.`,
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      {/* 2.1 Header: Title + count + Refresh */}
      <VacancyHeader
        count={normalVacancies.length}
        lastRefreshedAt={lastRefreshedAt}
        isLoading={isLoading}
        onRefresh={handleRefresh}
        lastError={lastError}
      />

      {/* 2.5 Filters: Hot toggle + Format dropdown + Sources link */}
      <VacancyFiltersBar
        hotOnly={hotOnly}
        onToggleHotOnly={setHotOnly}
        formatFilter={formatFilter}
        onChangeFormatFilter={setFormatFilter}
        activeSourcesCount={activeSourcesCount}
      />

      {/* Vacancy Card List (Single column) */}
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
                    : 'По выбранным фильтрам пока нет вакансий.'}
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

      {/* Shady toggle link at bottom */}
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
    </div>
  );
};
