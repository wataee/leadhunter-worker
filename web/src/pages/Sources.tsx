import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ExternalLink,
  Star,
  CheckCircle2,
  XCircle,
  Plus,
  Upload,
  Download,
  Filter,
  CheckSquare,
  Square,
  Users,
  Radio,
  RefreshCw,
  Globe,
  Tag,
  SlidersHorizontal,
} from 'lucide-react';
import { useCatalogStore, SortOption } from '../sources/catalogStore';
import { SourceItem, SourceCategory } from '../sources/catalogTypes';
import { useToastStore } from '../store/toastStore';
import { checkSource, SourceCheckResult } from '../lib/api';

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  jobs_video: 'Видео',
  jobs_remote_freelance: 'Фриланс',
  editors_community: 'Сообщества',
  clients_entrepreneurs: 'Клиенты',
  international_en: 'International',
};

const CATEGORY_COLORS: Record<SourceCategory, { bg: string; text: string; border: string }> = {
  jobs_video: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  jobs_remote_freelance: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  editors_community: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  clients_entrepreneurs: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  international_en: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
};

function formatSubscribers(num?: number): string {
  if (!num) return '—';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'недавно';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diffMs / (1000 * 3600));
    if (hours < 1) return 'только что';
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} дн назад`;
    const months = Math.floor(days / 30);
    return `${months} мес назад`;
  } catch {
    return 'недавно';
  }
}

export const Sources: React.FC = () => {
  const {
    catalog,
    customSources,
    activeSources,
    selectedIds,
    searchQuery,
    selectedCategory,
    selectedLanguage,
    selectedType,
    selectedStatus,
    selectedTag,
    sortBy,
    setSearchQuery,
    setSelectedCategory,
    setSelectedLanguage,
    setSelectedType,
    setSelectedStatus,
    setSelectedTag,
    setSortBy,
    toggleActive,
    enableRecommended,
    addActiveBatch,
    removeActiveBatch,
    toggleSelected,
    setSelectedBatch,
    clearSelection,
    addCustomSource,
    importSources,
    exportSources,
  } = useCatalogStore();

  const addToast = useToastStore((s) => s.addToast);

  // Local search input for debounce
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [proposeModalOpen, setProposeModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Propose source state
  const [proposeUsername, setProposeUsername] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<SourceCheckResult | null>(null);

  // Import state
  const [importText, setImportText] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput, setSearchQuery]);

  // Combine built-in catalog + custom sources
  const allSources = useMemo(() => {
    const map = new Map<string, SourceItem>();
    catalog.forEach((item) => map.set(item.id.toLowerCase(), item));
    customSources.forEach((item) => map.set(item.id.toLowerCase(), item));
    return Array.from(map.values());
  }, [catalog, customSources]);

  // Stats
  const stats = useMemo(() => {
    let channels = 0;
    let groups = 0;
    let recommended = 0;
    const catCounts: Record<string, number> = {
      jobs_video: 0,
      jobs_remote_freelance: 0,
      editors_community: 0,
      clients_entrepreneurs: 0,
      international_en: 0,
    };

    allSources.forEach((s) => {
      if (s.type === 'channel') channels++;
      if (s.type === 'group') groups++;
      if (s.recommended) recommended++;
      if (catCounts[s.category] !== undefined) {
        catCounts[s.category]++;
      }
    });

    return {
      total: allSources.length,
      channels,
      groups,
      recommended,
      catCounts,
    };
  }, [allSources]);

  // Filter & Sort
  const filteredSources = useMemo(() => {
    return allSources.filter((s) => {
      // Category filter
      if (selectedCategory !== 'all' && s.category !== selectedCategory) {
        return false;
      }
      // Language filter
      if (selectedLanguage !== 'all' && s.language !== selectedLanguage) {
        return false;
      }
      // Type filter
      if (selectedType !== 'all' && s.type !== selectedType) {
        return false;
      }
      // Status filter
      if (selectedStatus === 'active_only') {
        if (s.status !== 'ok' && s.status !== 'group') return false;
      }
      // Tag filter
      if (selectedTag && !s.tags.includes(selectedTag)) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = s.title.toLowerCase().includes(q);
        const inUsername = s.username.toLowerCase().includes(q);
        const inDesc = s.description.toLowerCase().includes(q);
        const inTags = s.tags.some((t) => t.toLowerCase().includes(q));
        if (!inTitle && !inUsername && !inDesc && !inTags) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'quality') {
        return (b.qualityScore || 0) - (a.qualityScore || 0);
      }
      if (sortBy === 'subscribers') {
        return (b.subscribers || 0) - (a.subscribers || 0);
      }
      if (sortBy === 'activity') {
        return (b.postsPerWeek || 0) - (a.postsPerWeek || 0);
      }
      if (sortBy === 'alphabet') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
  }, [allSources, selectedCategory, selectedLanguage, selectedType, selectedStatus, selectedTag, searchQuery, sortBy]);

  const allFilteredSelected = useMemo(() => {
    if (filteredSources.length === 0) return false;
    return filteredSources.every((s) => selectedIds.has(s.id));
  }, [filteredSources, selectedIds]);

  const handleToggleSelectAllFiltered = () => {
    const ids = filteredSources.map((s) => s.id);
    setSelectedBatch(ids, !allFilteredSelected);
  };

  const handleAddSelectedToActive = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    addActiveBatch(ids);
    addToast({
      type: 'success',
      title: 'Источники подключены',
      message: `Добавлено в мониторинг: ${ids.length} источников.`,
    });
    clearSelection();
  };

  const handleRemoveSelectedFromActive = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    removeActiveBatch(ids);
    addToast({
      type: 'info',
      title: 'Источники отключены',
      message: `Отключено от мониторинга: ${ids.length} источников.`,
    });
    clearSelection();
  };

  const handleCheckProposedSource = async () => {
    const clean = proposeUsername.replace(/^@/, '').trim().toLowerCase();
    if (!clean) return;
    setIsChecking(true);
    setCheckResult(null);
    try {
      const res = await checkSource(clean);
      setCheckResult(res);
      if (!res.ok || !res.source) {
        addToast({
          type: 'error',
          title: 'Ошибка проверки',
          message: res.error || 'Не удалось найти канал в Telegram.',
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Ошибка проверки',
        message: err.message,
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleAddProposedSource = () => {
    if (!checkResult?.source) return;
    const s = checkResult.source;
    const newItem: SourceItem = {
      id: s.id,
      title: s.title,
      username: s.username,
      url: s.url,
      type: s.type,
      category: 'jobs_video',
      language: 'ru',
      description: s.description || 'Пользовательский источник',
      subscribers: s.subscribers,
      qualityScore: 70,
      status: s.status as any,
      tags: ['custom', 'video'],
      recommended: false,
      discoveredFrom: 'user_proposed',
      verifiedAt: new Date().toISOString(),
    };
    addCustomSource(newItem);
    addToast({
      type: 'success',
      title: 'Источник добавлен',
      message: `@${s.username} успешно добавлен в ваш список мониторинга.`,
    });
    setProposeModalOpen(false);
    setProposeUsername('');
    setCheckResult(null);
  };

  const handleImportSubmit = () => {
    const lines = importText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const { added, errors } = importSources(lines);
    if (added > 0) {
      addToast({
        type: 'success',
        title: 'Импорт завершён',
        message: `Успешно добавлено в мониторинг: ${added} источников.`,
      });
    }
    if (errors.length > 0) {
      addToast({
        type: 'warning',
        title: 'Предупреждение импорта',
        message: `Ошибки в ${errors.length} строках. Проверьте формат @username.`,
      });
    }
    setImportModalOpen(false);
    setImportText('');
  };

  const handleDownloadExport = (format: 'json' | 'txt') => {
    const content = exportSources(format, selectedIds.size > 0 ? Array.from(selectedIds) : undefined);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadhunter-sources-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({
      type: 'success',
      title: 'Экспорт готов',
      message: `Файл .${format} успешно сохранён.`,
    });
    setExportModalOpen(false);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-surface-1 border border-border rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-text flex items-center gap-2">
                  Каталог Telegram-источников
                  <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">
                    150+ проверенных
                  </span>
                </h1>
                <p className="text-sm text-text-muted mt-0.5">
                  База проверенных каналов и чатов для поиска заказов на видеомонтаж, вакансий и прямых клиентов
                </p>
              </div>
            </div>

            {/* Counters */}
            <div className="flex flex-wrap items-center gap-2 mt-4 text-xs sm:text-sm text-text-muted">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2 border border-border font-medium text-text">
                <Users className="w-3.5 h-3.5 text-primary" />
                Всего: {stats.total}
              </span>
              <span>•</span>
              <span>Каналов: <strong className="text-text">{stats.channels}</strong></span>
              <span>•</span>
              <span>Чатов: <strong className="text-text">{stats.groups}</strong></span>
              <span>•</span>
              <span>Рекомендованных: <strong className="text-amber-400">{stats.recommended}</strong></span>
              <span>•</span>
              <span>В вашем мониторинге: <strong className="text-emerald-400">{activeSources.size}</strong></span>
            </div>
          </div>

          {/* Quick Action: Enable recommended */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                enableRecommended();
                addToast({
                  type: 'success',
                  title: 'Рекомендованные включены',
                  message: `В мониторинг добавлены все ${stats.recommended} лучших источников.`,
                });
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-sm font-medium transition-colors"
            >
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              Включить рекомендуемые ({stats.recommended})
            </button>
            <button
              onClick={() => setProposeModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Предложить источник
            </button>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="space-y-3">
        {/* Search & Main Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Поиск по названию, @username или тегам..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-1 border border-border text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-primary transition-colors"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Language Filter */}
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-text-muted shrink-0" />
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-1 border border-border text-sm text-text focus:outline-none focus:border-primary transition-colors"
            >
              <option value="all">Язык: Все</option>
              <option value="ru">Русский (RU)</option>
              <option value="en">English (EN)</option>
            </select>
          </div>

          {/* Type & Status */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted shrink-0" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-1 border border-border text-sm text-text focus:outline-none focus:border-primary transition-colors"
            >
              <option value="all">Тип: Все</option>
              <option value="channel">Только каналы</option>
              <option value="group">Только чаты / группы</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-text-muted shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-1 border border-border text-sm text-text focus:outline-none focus:border-primary transition-colors"
            >
              <option value="quality">Сортировка: По качеству (Score)</option>
              <option value="subscribers">По подписчикам</option>
              <option value="activity">По активности (постов/нед)</option>
              <option value="alphabet">По алфавиту (А-Я)</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              selectedCategory === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface-1 hover:bg-surface-2 text-text-muted border border-border'
            }`}
          >
            Все ({stats.total})
          </button>

          {(Object.keys(CATEGORY_LABELS) as SourceCategory[]).map((cat) => {
            const count = stats.catCounts[cat] || 0;
            const isSelected = selectedCategory === cat;
            const colors = CATEGORY_COLORS[cat];
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? `${colors.bg} ${colors.text} border ${colors.border} ring-1 ring-primary/40`
                    : 'bg-surface-1 hover:bg-surface-2 text-text-muted border border-border'
                }`}
              >
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-surface-2/80 text-text">
                  {count}
                </span>
              </button>
            );
          })}

          {/* Status quick toggle: active only */}
          <button
            onClick={() => setSelectedStatus(selectedStatus === 'all' ? 'active_only' : 'all')}
            className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              selectedStatus === 'active_only'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-surface-1 text-text-muted border-border hover:bg-surface-2'
            }`}
          >
            {selectedStatus === 'active_only' ? '✓ Только активные' : 'Все статусы'}
          </button>
        </div>

        {/* Selected Tag Active Pill */}
        {selectedTag && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Фильтр по тегу:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
              #{selectedTag}
              <button onClick={() => setSelectedTag(null)} className="hover:text-white">
                ✕
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Batch Actions Bar */}
      <div className="bg-surface-1 border border-border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleSelectAllFiltered}
            className="inline-flex items-center gap-1.5 text-text hover:text-primary transition-colors font-medium"
          >
            {allFilteredSelected ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : (
              <Square className="w-4 h-4 text-text-muted" />
            )}
            {allFilteredSelected ? 'Снять выбор' : `Выбрать все (${filteredSources.length})`}
          </button>

          {selectedIds.size > 0 && (
            <span className="text-text-muted">
              Выбрано: <strong className="text-text">{selectedIds.size}</strong>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleAddSelectedToActive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                В мониторинг ({selectedIds.size})
              </button>
              <button
                onClick={handleRemoveSelectedFromActive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Убрать ({selectedIds.size})
              </button>
            </>
          )}

          <button
            onClick={() => setExportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface-3 text-text border border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-text-muted" />
            Экспорт
          </button>

          <button
            onClick={() => setImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface-3 text-text border border-border transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-text-muted" />
            Импорт
          </button>
        </div>
      </div>

      {/* Sources Grid */}
      {filteredSources.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-xl p-12 text-center space-y-3">
          <p className="text-base text-text-muted">Источников по заданным фильтрам не найдено.</p>
          <button
            onClick={() => {
              setSearchInput('');
              setSelectedCategory('all');
              setSelectedLanguage('all');
              setSelectedType('all');
              setSelectedStatus('all');
              setSelectedTag(null);
            }}
            className="text-sm text-primary hover:underline"
          >
            Сбросить все фильтры
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSources.map((source) => {
            const isSelected = selectedIds.has(source.id);
            const isActive = activeSources.has(source.id.toLowerCase());
            const catColors = CATEGORY_COLORS[source.category] || CATEGORY_COLORS.jobs_video;

            // Quality score color
            let scoreBg = 'bg-zinc-700/50 text-zinc-400 border-zinc-600/40';
            if (source.qualityScore >= 70) {
              scoreBg = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
            } else if (source.qualityScore >= 40) {
              scoreBg = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
            }

            return (
              <div
                key={source.id}
                className={`bg-surface-1 border rounded-xl p-4 flex flex-col justify-between transition-all hover:border-border-hover relative ${
                  isActive ? 'border-primary/40 bg-surface-1/90' : 'border-border'
                }`}
              >
                {/* Top Row: Checkbox, Title & Recommendation Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <button
                        onClick={() => toggleSelected(source.id)}
                        className="mt-1 text-text-muted hover:text-text transition-colors shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-semibold text-text text-sm sm:text-base truncate">
                            {source.title}
                          </h3>
                          {source.recommended && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-medium">
                              <Star className="w-3 h-3 fill-amber-400" />
                              Рекомендуем
                            </span>
                          )}
                        </div>

                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                        >
                          @{source.username}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Quality Score Badge */}
                    <div className={`px-2 py-0.5 rounded-md border text-xs font-semibold shrink-0 ${scoreBg}`}>
                      {source.qualityScore}
                    </div>
                  </div>

                  {/* Badges: Category & Type */}
                  <div className="flex flex-wrap items-center gap-1.5 my-2.5">
                    <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${catColors.bg} ${catColors.text} ${catColors.border}`}>
                      {CATEGORY_LABELS[source.category] || source.category}
                    </span>

                    <span className="px-2 py-0.5 rounded-md bg-surface-2 border border-border text-text-muted text-[11px]">
                      {source.type === 'channel' ? 'Канал' : 'Чат / Группа'}
                    </span>

                    <span className="px-1.5 py-0.5 rounded-md bg-surface-2 text-text-muted text-[10px] uppercase font-mono">
                      {source.language}
                    </span>

                    {source.status === 'group' && (
                      <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px]">
                        Воркер 24/7
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-text-muted line-clamp-2 mb-3">
                    {source.description}
                  </p>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2/60 rounded-lg p-2.5 mb-3 border border-border/50">
                    <div>
                      <span className="text-text-muted block text-[11px]">Подписчиков:</span>
                      <strong className="text-text font-medium">{formatSubscribers(source.subscribers)}</strong>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">Постов / нед:</span>
                      <strong className="text-text font-medium">{source.postsPerWeek ?? '—'}</strong>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">% вакансий:</span>
                      <strong className="text-emerald-400 font-medium">
                        {source.vacancyRate !== undefined ? `${Math.round(source.vacancyRate * 100)}%` : '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">Пост:</span>
                      <strong className="text-text font-medium">{formatRelativeTime(source.lastPostAt)}</strong>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {source.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(tag)}
                        className="px-2 py-0.5 rounded-md bg-surface-2 hover:bg-surface-3 text-[11px] text-text-muted hover:text-text transition-colors flex items-center gap-1"
                      >
                        <Tag className="w-2.5 h-2.5 opacity-60" />
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bottom Action: Toggle Active Monitoring */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <span className="text-xs text-text-muted">
                    {isActive ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> В мониторинге
                      </span>
                    ) : (
                      'Не мониторится'
                    )}
                  </span>

                  <button
                    onClick={() => toggleActive(source.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                        : 'bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40'
                    }`}
                  >
                    {isActive ? 'Отключить' : 'Подключить'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Предложить источник */}
      {proposeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-1 border border-border rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Предложить новый Telegram-источник
              </h2>
              <button
                onClick={() => {
                  setProposeModalOpen(false);
                  setCheckResult(null);
                  setProposeUsername('');
                }}
                className="text-text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-text-muted">
              Введите @username Telegram-канала или чата. Система автоматически проверит его существование,
              свежесть постов и статус.
            </p>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="@channel_username"
                  value={proposeUsername}
                  onChange={(e) => setProposeUsername(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleCheckProposedSource}
                  disabled={isChecking || !proposeUsername.trim()}
                  className="px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {isChecking && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Проверить
                </button>
              </div>

              {/* Check Result Preview */}
              {checkResult?.source && (
                <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-text text-sm">{checkResult.source.title}</h4>
                      <p className="text-xs text-primary">@{checkResult.source.username}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs border border-emerald-500/30">
                      {checkResult.source.type === 'channel' ? 'Канал' : 'Чат'} • {checkResult.source.status}
                    </span>
                  </div>

                  {checkResult.source.description && (
                    <p className="text-xs text-text-muted line-clamp-2">{checkResult.source.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-text-muted pt-2 border-t border-border/40">
                    <span>Подписчиков: <strong>{formatSubscribers(checkResult.source.subscribers)}</strong></span>
                    {checkResult.source.lastPostAt && (
                      <span>Последний пост: <strong>{formatRelativeTime(checkResult.source.lastPostAt)}</strong></span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setProposeModalOpen(false);
                  setCheckResult(null);
                  setProposeUsername('');
                }}
                className="px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-text text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleAddProposedSource}
                disabled={!checkResult?.source}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Добавить в мой мониторинг
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Импорт списка */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-1 border border-border rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Импорт списка источников
              </h2>
              <button onClick={() => setImportModalOpen(false)} className="text-text-muted hover:text-text">
                ✕
              </button>
            </div>

            <p className="text-xs text-text-muted">
              Вставьте список Telegram юзернеймов (через запятую, пробел или с новой строки).
            </p>

            <textarea
              rows={6}
              placeholder={`@editors_video\n@normrabota\n@theyseeku`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-sm text-text font-mono focus:outline-none focus:border-primary"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-text text-sm transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleImportSubmit}
                disabled={!importText.trim()}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Импортировать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Экспорт списка */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-1 border border-border rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                Экспорт списка источников
              </h2>
              <button onClick={() => setExportModalOpen(false)} className="text-text-muted hover:text-text">
                ✕
              </button>
            </div>

            <p className="text-xs text-text-muted">
              {selectedIds.size > 0
                ? `Будет экспортировано ${selectedIds.size} выбранных источников.`
                : `Будут экспортированы все ${activeSources.size} активных источников из мониторинга.`}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleDownloadExport('json')}
                className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-center space-y-1 transition-colors"
              >
                <div className="text-primary font-bold text-sm">JSON Format</div>
                <div className="text-[11px] text-text-muted">Полная информация и метрики</div>
              </button>

              <button
                onClick={() => handleDownloadExport('txt')}
                className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-center space-y-1 transition-colors"
              >
                <div className="text-primary font-bold text-sm">TXT List</div>
                <div className="text-[11px] text-text-muted">Список @юзернеймов</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
