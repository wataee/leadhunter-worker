import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVacanciesStore, computeVacancyRelevance } from '../store/vacanciesStore';
import { useLeadsStore } from '../store/leadsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { fetchTelegramFeed } from '../lib/api';
import {
  playNotificationBeep,
  requestNotificationPermission,
  sendBrowserNotification,
  updateTabBadge,
} from '../lib/notifications';
import { VacancyCard } from '../components/VacancyCard';
import { PitchGeneratorModal } from '../components/PitchGeneratorModal';
import { EmptyState } from '../components/EmptyState';
import { CardSkeleton } from '../components/Skeleton';
import { Vacancy } from '../types';
import {
  Radio,
  Plus,
  Trash2,
  RotateCw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Bell,
  Flame,
  AlertTriangle,
  X,
  RefreshCcw,
} from 'lucide-react';

export const Vacancies: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    sources,
    vacancies,
    includeKeywords,
    excludeKeywords,
    lastRefreshedAt,
    isLoading,
    addSource,
    removeSource,
    toggleSource,
    mergeNewVacancies,
    markSeen,
    hideVacancy,
    addIncludeKeyword,
    removeIncludeKeyword,
    addExcludeKeyword,
    removeExcludeKeyword,
    setLoading,
    setLastRefreshedAt,
  } = useVacanciesStore();

  const addLead = useLeadsStore((s) => s.addLead);
  const {
    autoRefreshInterval,
    setAutoRefreshInterval,
    soundEnabled,
    setSoundEnabled,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);

  // Filters initialized from URL search params
  const filterHotOnly = searchParams.get('hot') === '1';
  const filterFormat = searchParams.get('format') || 'all';
  const filterQuality = searchParams.get('quality') || 'all';

  const setFilterParam = (key: string, value: string | boolean) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (typeof value === 'boolean') {
        if (value) next.set(key, '1');
        else next.delete(key);
      } else {
        if (value && value !== 'all') next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  };

  const [newChannelInput, setNewChannelInput] = useState('');
  const [newIncludeInput, setNewIncludeInput] = useState('');
  const [newExcludeInput, setNewExcludeInput] = useState('');
  const [activePitchVacancy, setActivePitchVacancy] = useState<Vacancy | null>(null);
  const [workerActive, setWorkerActive] = useState<boolean | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load / Refresh Feed with useCallback to prevent stale closures
  const handleRefreshFeed = useCallback(async () => {
    const activeChannels = sources.filter((s) => s.enabled).map((s) => s.username);
    if (activeChannels.length === 0) {
      addToast({
        type: 'info',
        message: 'Добавьте и включите хотя бы один Telegram-канал для мониторинга.',
      });
      return;
    }

    setLoading(true);
    setNetworkError(null);

    try {
      const res = await fetchTelegramFeed(activeChannels);
      setWorkerActive(Boolean(res.workerActive));

      const processed: Vacancy[] = [];

      for (const msg of res.allMessages) {
        const isWorkerLead = Boolean(
          (msg as any).views === 'MTProto 24/7' ||
          msg.id.startsWith('tg_') ||
          (msg as any).fromWorker
        );

        const { relevance, matchedKeywords, isExcluded, formatTag, qualityTier, budget } =
          computeVacancyRelevance(msg.text, includeKeywords, excludeKeywords, isWorkerLead);

        if (!isExcluded && (isWorkerLead || matchedKeywords.length > 0)) {
          processed.push({
            id: msg.id,
            channel: msg.channel,
            text: msg.text,
            url: msg.url,
            postedAt: msg.postedAt,
            views: msg.views,
            matchedKeywords,
            relevance,
            formatTag,
            qualityTier,
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
            `LeadHunter: ${newCount} новых вакансий!`,
            hotCount > 0 ? `Из них ${hotCount} горячих (<20 мин)!` : `Проверьте вкладку мониторинга.`
          );
        }
        addToast({
          type: 'success',
          title: `Найдено ${newCount} новых вакансий!`,
          message: hotCount > 0 ? `Из них ${hotCount} опубликованы совсем недавно.` : '',
        });
      }

      if (res.errors.length > 0) {
        if (res.errors.length > 1) {
          addToast({
            type: 'warning',
            title: 'Telegram ограничил веб-просмотр',
            message: `Telegram временно перенаправляет запросы для ${res.errors.length} каналов. Отображаются лиды от облачного воркера.`,
          });
        } else {
          res.errors.forEach((e) => {
            addToast({
              type: 'warning',
              title: `@${e.channel}`,
              message: e.error,
            });
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка обновления Telegram';
      setNetworkError(msg);
      addToast({
        type: 'error',
        title: 'Ошибка монитора',
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [
    sources,
    includeKeywords,
    excludeKeywords,
    mergeNewVacancies,
    setLoading,
    setLastRefreshedAt,
    soundEnabled,
    notificationsEnabled,
    addToast,
  ]);

  // Initial load on mount if cache is empty
  useEffect(() => {
    if (vacancies.length === 0) {
      handleRefreshFeed();
    }
  }, []);

  // Interval timer for auto-refresh while tab is open
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (autoRefreshInterval > 0) {
      const ms = autoRefreshInterval * 60 * 1000;
      refreshTimerRef.current = setInterval(() => {
        handleRefreshFeed();
      }, ms);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefreshInterval, handleRefreshFeed]);

  // Update tab badge on unseen count
  useEffect(() => {
    const unseenCount = vacancies.filter((v) => !v.seen && !v.hidden).length;
    updateTabBadge(unseenCount);
  }, [vacancies]);

  const handleAddSourceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelInput.trim()) return;
    addSource(newChannelInput.trim());
    setNewChannelInput('');
    addToast({
      type: 'success',
      message: 'Канал добавлен. Нажмите "Обновить" для загрузки постов.',
    });
  };

  const handleNotificationToggle = async () => {
    if (!notificationsEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setNotificationsEnabled(true);
        addToast({ type: 'success', message: 'Браузерные уведомления включены' });
      } else {
        addToast({
          type: 'warning',
          message: 'Браузер отклонил разрешение на уведомления',
        });
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleConvertToLead = (vac: Vacancy) => {
    const tgMatch =
      vac.text.match(/(?:https?:\/\/)?(?:t\.me)\/([a-zA-Z0-9_]{4,})/i) ||
      vac.text.match(/@([a-zA-Z0-9_]{4,})/i);
    const foundTg = tgMatch ? `@${tgMatch[1]}` : `@${vac.channel}`;

    addLead({
      name: `Вакансия из @${vac.channel}`,
      channelUrl: vac.url,
      subscribers: 0,
      hiddenSubscribers: true,
      niche: 'Telegram-вакансия',
      tier: 2,
      score: vac.relevance,
      source: 'Telegram-вакансия',
      email: null,
      telegram: foundTg,
      instagram: null,
      website: vac.url,
      hasProduct: false,
      status: 'new',
      notes: vac.text,
      dealValue: 600,
      tags: ['Telegram', vac.channel],
    });

    markSeen(vac.id);
    addToast({
      type: 'success',
      title: 'Лид создан',
      message: `Вакансия сохранена в воронку клиентов со ссылкой на пост.`,
    });
  };

  // Filtered vacancies
  const displayedVacancies = vacancies.filter((v) => {
    if (v.hidden) return false;
    if (filterHotOnly) {
      const isHot = Date.now() - new Date(v.postedAt).getTime() < 20 * 60 * 1000;
      if (!isHot) return false;
    }
    if (filterFormat !== 'all') {
      if (v.formatTag && v.formatTag !== 'both' && v.formatTag !== filterFormat) {
        return false;
      }
    }
    if (filterQuality !== 'all') {
      if (filterQuality === 'great' && v.qualityTier !== 'great') return false;
      if (filterQuality === 'fair_or_great' && v.qualityTier === 'shady') return false;
    }
    return true;
  });

  const renderFiltersSidebar = () => (
    <div className="space-y-5">
      {/* Sources Box */}
      <div className="bg-surface rounded-card p-4 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text">
            Каналы для мониторинга
          </h2>
          <span className="font-mono text-[11px] text-muted">
            {sources.filter((s) => s.enabled).length}/{sources.length} вкл
          </span>
        </div>

        {/* Add Channel Form */}
        <form onSubmit={handleAddSourceSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="@username или t.me/..."
            value={newChannelInput}
            onChange={(e) => setNewChannelInput(e.target.value)}
            className="flex-1 bg-surface-2 text-text text-xs rounded-control border border-border px-3 py-1.5 focus:outline-none focus:border-accent min-h-[44px]"
            aria-label="Имя канала для мониторинга"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Добавить канал"
          >
            <Plus size={16} />
          </button>
        </form>

        {/* Sources List */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {sources.length === 0 ? (
            <div className="text-[11px] text-muted italic p-3 bg-surface-2/30 rounded-control border border-border/50">
              <p>Добавьте каналы или группы для мониторинга.</p>
            </div>
          ) : (
            sources.map((s) => (
              <div
                key={s.username}
                className="flex items-center justify-between p-2 bg-surface-2/50 rounded-control border border-border text-xs min-h-[44px]"
              >
                <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => toggleSource(s.username)}
                    className="rounded bg-surface-2 border-border text-accent focus:ring-accent w-4 h-4"
                    aria-label={`Включить канал @${s.username}`}
                  />
                  <span className="font-semibold text-text truncate">@{s.username}</span>
                </label>

                <button
                  onClick={() => removeSource(s.username)}
                  className="text-muted hover:text-danger p-2 rounded min-w-[36px] min-h-[36px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-danger"
                  aria-label={`Удалить канал @${s.username}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Keywords Filters */}
      <div className="bg-surface rounded-card p-4 border border-border space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text">
          Фильтры ключевых слов
        </h2>

        {/* Include chips */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-success block">
            Включающие (роли и сигналы монтажа):
          </span>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {includeKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-success-soft text-success border border-success/20"
              >
                <span>{kw}</span>
                <button
                  onClick={() => removeIncludeKeyword(kw)}
                  className="hover:text-white p-0.5 focus-visible:ring-1 focus-visible:ring-white"
                  aria-label={`Удалить ключевое слово ${kw}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newIncludeInput.trim()) {
                addIncludeKeyword(newIncludeInput.trim());
                setNewIncludeInput('');
              }
            }}
            className="flex gap-1 pt-1"
          >
            <input
              type="text"
              placeholder="+ ключевое слово..."
              value={newIncludeInput}
              onChange={(e) => setNewIncludeInput(e.target.value)}
              className="flex-1 bg-surface-2 text-text text-[11px] rounded px-2 py-1.5 border border-border min-h-[40px]"
              aria-label="Новое ключевое слово"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text rounded text-[11px] border border-border min-h-[40px] focus-visible:ring-2 focus-visible:ring-accent"
            >
              Добавить
            </button>
          </form>
        </div>

        {/* Exclude chips */}
        <div className="space-y-1.5 pt-2 border-t border-border/50">
          <span className="text-[11px] font-semibold text-danger block">
            Исключающие (стоп-лист резюме/услуг):
          </span>
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
            {excludeKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-danger-soft text-danger border border-danger/20"
              >
                <span>{kw}</span>
                <button
                  onClick={() => removeExcludeKeyword(kw)}
                  className="hover:text-white p-0.5 focus-visible:ring-1 focus-visible:ring-white"
                  aria-label={`Удалить стоп-фразу ${kw}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newExcludeInput.trim()) {
                addExcludeKeyword(newExcludeInput.trim());
                setNewExcludeInput('');
              }
            }}
            className="flex gap-1 pt-1"
          >
            <input
              type="text"
              placeholder="+ исключить..."
              value={newExcludeInput}
              onChange={(e) => setNewExcludeInput(e.target.value)}
              className="flex-1 bg-surface-2 text-text text-[11px] rounded px-2 py-1.5 border border-border min-h-[40px]"
              aria-label="Новая стоп-фраза"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text rounded text-[11px] border border-border min-h-[40px] focus-visible:ring-2 focus-visible:ring-danger"
            >
              Добавить
            </button>
          </form>
        </div>
      </div>

      {/* Auto-refresh selector */}
      <div className="bg-surface rounded-card p-4 border border-border space-y-2 text-xs">
        <span className="font-semibold text-text block">
          Автообновление (пока открыта вкладка):
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 5].map((m) => (
            <button
              key={m}
              onClick={() => setAutoRefreshInterval(m)}
              className={`py-2 rounded text-center text-xs font-mono font-medium border transition-colors min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-accent ${
                autoRefreshInterval === m
                  ? 'bg-accent-soft text-accent border-accent/30 font-bold'
                  : 'bg-surface-2 text-muted border-border hover:text-text'
              }`}
              aria-label={`Интервал автообновления: ${m === 0 ? 'Выключено' : `${m} минут`}`}
            >
              {m === 0 ? 'Выкл' : `${m} мин`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text flex items-center gap-2">
            <Radio size={22} className="text-accent" />
            <span>Монитор вакансий "Ищу монтажёра"</span>
          </h1>
          <p className="text-xs md:text-sm text-text-muted mt-0.5">
            Мониторинг Telegram-каналов и чатов в реальном времени.
          </p>
        </div>

        {/* Quick controls */}
        <div className="flex items-center gap-2">
          {/* Mobile Filter Button */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-surface-2 hover:bg-surface-3 border border-border text-xs font-semibold rounded-control text-text min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Открыть настройки каналов и фильтров"
          >
            <SlidersHorizontal size={16} />
            <span>Каналы и фильтры</span>
          </button>

          {/* Sound toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-control border text-xs transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-accent ${
              soundEnabled
                ? 'bg-accent-soft text-accent border-accent/20'
                : 'bg-surface-2 text-muted border-border hover:text-text'
            }`}
            title={soundEnabled ? 'Звук включён' : 'Звук выключен'}
            aria-label="Звук уведомлений"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Browser notification toggle */}
          <button
            onClick={handleNotificationToggle}
            className={`p-2.5 rounded-control border text-xs transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-accent ${
              notificationsEnabled
                ? 'bg-accent-soft text-accent border-accent/20'
                : 'bg-surface-2 text-muted border-border hover:text-text'
            }`}
            title={notificationsEnabled ? 'Уведомления включены' : 'Уведомления выключены'}
            aria-label="Браузерные уведомления"
          >
            <Bell size={18} />
          </button>

          {/* Refresh button */}
          <button
            onClick={handleRefreshFeed}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control shadow-subtle disabled:opacity-50 transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Обновить ленту вакансий"
          >
            <RotateCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? 'Проверяю...' : 'Обновить'}</span>
          </button>
        </div>
      </div>

      {/* Cloud Worker Status Badge */}
      {workerActive === false ? (
        <div className="p-3 bg-warning-soft/40 border border-warning/40 rounded-card flex items-center justify-between gap-3 text-xs text-text">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="text-warning shrink-0" />
            <div className="leading-relaxed">
              <strong>Воркер недоступен (Render):</strong> Telegram-воркер не отвечает по WEBHOOK_URL. Лента работает в резервном режиме веб-скрейпинга.
            </div>
          </div>
          <button
            onClick={handleRefreshFeed}
            className="px-3 py-1 bg-warning/20 hover:bg-warning/30 text-warning font-semibold rounded text-xs shrink-0 border border-warning/30 min-h-[36px]"
          >
            Повторить
          </button>
        </div>
      ) : (
        <div className="p-3 bg-success-soft/30 border border-success/30 rounded-card flex items-center gap-2.5 text-xs text-text">
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0" />
          <div className="leading-relaxed">
            <strong>Облачный мониторинг 24/7 активен:</strong> вакансии из ваших Telegram-каналов и чатов перехватываются непрерывно в облаке, даже когда вкладка браузера закрыта.
          </div>
        </div>
      )}

      {/* Network Error alert if present */}
      {networkError && (
        <div className="p-3 bg-danger-soft/40 border border-danger/40 rounded-card flex items-center justify-between gap-3 text-xs text-text">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-danger shrink-0" />
            <span>Ошибка обновления: {networkError}</span>
          </div>
          <button
            onClick={handleRefreshFeed}
            className="flex items-center gap-1 px-3 py-1 bg-danger/20 hover:bg-danger/30 text-danger rounded text-xs font-semibold border border-danger/30 min-h-[36px]"
          >
            <RefreshCcw size={12} />
            <span>Повторить</span>
          </button>
        </div>
      )}

      {/* Two columns: Sources & Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Desktop Sources & Keywords (4 cols) */}
        <div className="hidden lg:block lg:col-span-4">{renderFiltersSidebar()}</div>

        {/* Right Column: Feed (8 cols) */}
        <div className="lg:col-span-8 space-y-4 min-w-0">
          {/* Feed Filter Bar */}
          <div className="bg-surface rounded-card p-3 border border-border flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-text">
                Вакансий в ленте: {displayedVacancies.length}
              </span>

              {/* Hot only filter */}
              <label className="flex items-center gap-1.5 cursor-pointer text-text-muted select-none min-h-[36px]">
                <input
                  type="checkbox"
                  checked={filterHotOnly}
                  onChange={(e) => setFilterParam('hot', e.target.checked)}
                  className="rounded bg-surface-2 border-border text-danger focus:ring-danger w-4 h-4"
                />
                <span className="flex items-center gap-1 text-danger font-medium">
                  <Flame size={14} /> Горячие (&lt;20 мин)
                </span>
              </label>

              {/* Format Filter */}
              <select
                value={filterFormat}
                onChange={(e) => setFilterParam('format', e.target.value)}
                className="bg-surface-2 text-text border border-border rounded-control px-2.5 py-1.5 text-xs min-h-[36px] focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Фильтр формата вакансии"
              >
                <option value="all">Все форматы</option>
                <option value="short">#короткийформат (Shorts/Reels)</option>
                <option value="long">#длинныйформат (YouTube/Шоу)</option>
              </select>

              {/* Quality Filter */}
              <select
                value={filterQuality}
                onChange={(e) => setFilterParam('quality', e.target.value)}
                className="bg-surface-2 text-text border border-border rounded-control px-2.5 py-1.5 text-xs min-h-[36px] focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Фильтр качества вакансии"
              >
                <option value="all">Все оценки</option>
                <option value="great">🟢 Только отличные</option>
                <option value="fair_or_great">🟡 Приемлемые и выше</option>
              </select>
            </div>

            {lastRefreshedAt && (
              <span className="text-muted font-mono text-[11px]">
                Обновлено:{' '}
                {new Date(lastRefreshedAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
          </div>

          {/* Skeleton on loading */}
          {isLoading && vacancies.length === 0 && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && displayedVacancies.length === 0 && (
            <EmptyState
              icon={Radio}
              title="Вакансий пока нет, ждём новые..."
              description="Мониторинг слушает Telegram 24/7 в реальном времени. Новые вакансии монтажёра появятся здесь автоматически."
              actionText="Обновить ленту"
              onAction={handleRefreshFeed}
            />
          )}

          {/* Vacancy cards list */}
          <div className="space-y-3">
            {displayedVacancies.map((vacancy) => (
              <VacancyCard
                key={vacancy.id}
                vacancy={vacancy}
                highlightWords={includeKeywords}
                onApply={() => {
                  markSeen(vacancy.id);
                  setActivePitchVacancy(vacancy);
                }}
                onConvertToLead={() => handleConvertToLead(vacancy)}
                onHide={() => hideVacancy(vacancy.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Drawer Slide-over */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-bg h-full p-6 overflow-y-auto space-y-6 shadow-modal border-l border-border animate-slide-left">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="text-sm font-bold text-text flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-accent" />
                <span>Каналы и фильтры</span>
              </h2>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 text-muted hover:text-text rounded-control min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Закрыть панель фильтров"
              >
                <X size={20} />
              </button>
            </div>

            {renderFiltersSidebar()}
          </div>
        </div>
      )}

      {/* Pitch Generator Modal for Vacancy */}
      <PitchGeneratorModal
        isOpen={Boolean(activePitchVacancy)}
        onClose={() => setActivePitchVacancy(null)}
        vacancy={activePitchVacancy}
      />
    </div>
  );
};
