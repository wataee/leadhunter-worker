import React, { useState, useMemo } from 'react';
import { Search, ExternalLink, Plus, Filter, AlertTriangle } from 'lucide-react';
import { useCatalogStore } from '../sources/catalogStore';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useToastStore } from '../store/toastStore';

export const Sources: React.FC = () => {
  const {
    catalog,
    customSources,
    activeSources,
    toggleActive,
    enableAllSources,
    disableAllSources,
    addCustomSource,
  } = useCatalogStore();

  const vacancies = useVacanciesStore((s) => s.vacancies);
  const addToast = useToastStore((s) => s.addToast);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'channel' | 'group'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled'>('all');
  const [newUsername, setNewUsername] = useState('');

  // Объединяем каталог и пользовательские источники
  const allSources = useMemo(() => {
    const list = [...catalog, ...customSources];
    const seen = new Set<string>();
    return list.filter((item) => {
      const lower = item.id.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  }, [catalog, customSources]);

  // Подсчёт реальных лидов за 7 и 14 дней для каждого источника
  const sourceStats = useMemo(() => {
    const now = Date.now();
    const map7d = new Map<string, number>();
    const map14d = new Map<string, number>();

    for (const v of vacancies) {
      const ch = v.channel.toLowerCase().replace(/^@/, '');
      const diff = now - new Date(v.postedAt).getTime();
      if (diff <= 7 * 86400000) {
        map7d.set(ch, (map7d.get(ch) || 0) + 1);
      }
      if (diff <= 14 * 86400000) {
        map14d.set(ch, (map14d.get(ch) || 0) + 1);
      }
    }

    return { map7d, map14d };
  }, [vacancies]);

  // Фильтрация
  const filteredSources = useMemo(() => {
    return allSources.filter((s) => {
      const lowerId = s.id.toLowerCase();
      const isEnabled = activeSources.has(lowerId);

      if (statusFilter === 'enabled' && !isEnabled) return false;
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesId = lowerId.includes(q);
        const matchesTitle = s.title.toLowerCase().includes(q);
        if (!matchesId && !matchesTitle) return false;
      }

      return true;
    });
  }, [allSources, activeSources, typeFilter, statusFilter, search]);

  // Оставить только источники с лидами за 14 дней
  const handleKeepOnlyActive = () => {
    const confirmed = window.confirm(
      'Отключить все источники, в которых не было ни одной вакансии за последние 14 дней?'
    );
    if (!confirmed) return;

    let keptCount = 0;
    const { map14d } = sourceStats;

    for (const s of allSources) {
      const lowerId = s.id.toLowerCase();
      const count = map14d.get(lowerId) || (s as any).count7d || s.postsPerWeek || 0;
      const isCurrentlyActive = activeSources.has(lowerId);

      if (count > 0 && !isCurrentlyActive) {
        toggleActive(lowerId);
        keptCount++;
      } else if (count === 0 && isCurrentlyActive) {
        toggleActive(lowerId);
      } else if (count > 0 && isCurrentlyActive) {
        keptCount++;
      }
    }

    addToast({
      type: 'success',
      title: 'Источники обновлены',
      message: `Оставлено активными: ${keptCount} источников с недавними вакансиями.`,
    });
  };

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newUsername.trim().toLowerCase().replace(/^@/, '').replace('https://t.me/', '');
    if (!clean) return;

    addCustomSource({
      id: clean,
      username: clean,
      title: `@${clean}`,
      type: 'channel',
      category: 'jobs_video',
      language: 'ru',
      description: 'Добавлен вручную',
      url: `https://t.me/${clean}`,
      qualityScore: 60,
      subscribers: 0,
      lastPostAt: new Date().toISOString(),
      discoveredFrom: 'Ручной ввод',
      status: 'ok',
      tags: ['manual'],
      recommended: false,
      verifiedAt: new Date().toISOString(),
    });

    setNewUsername('');
    addToast({
      type: 'success',
      message: `Канал @${clean} добавлен и включён для мониторинга.`,
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text">Источники</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Активно для мониторинга: <span className="text-accent font-semibold">{activeSources.size}</span> из {allSources.length} проверенных каналов
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={enableAllSources}
            className="px-3 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent rounded-control border border-accent/30 text-xs font-semibold transition-colors min-h-[36px]"
          >
            Включить все ({allSources.length})
          </button>
          <button
            type="button"
            onClick={disableAllSources}
            className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text-muted hover:text-text rounded-control border border-border text-xs font-medium transition-colors min-h-[36px]"
          >
            Отключить все
          </button>
          <button
            type="button"
            onClick={handleKeepOnlyActive}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text-muted hover:text-text rounded-control border border-border text-xs font-medium transition-colors min-h-[36px]"
            title="Отключить каналы без вакансий за 14 дней"
          >
            <AlertTriangle size={13} className="text-warning" />
            <span>Только с лидами (14 дн.)</span>
          </button>
        </div>
      </div>

      {/* Search & Add Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Поиск по источникам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface text-text text-xs rounded-control border border-border focus:outline-none focus:border-accent min-h-[40px]"
          />
        </div>

        {/* Add Source Form */}
        <form onSubmit={handleAddSource} className="flex gap-2">
          <input
            type="text"
            placeholder="@username или ссылка"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="w-48 sm:w-56 px-3 py-2 bg-surface text-text text-xs rounded-control border border-border focus:outline-none focus:border-accent min-h-[40px]"
          />
          <button
            type="submit"
            className="px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control transition-colors flex items-center gap-1 shrink-0 min-h-[40px]"
          >
            <Plus size={14} />
            <span>Добавить</span>
          </button>
        </form>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-muted flex items-center gap-1 mr-1">
          <Filter size={13} /> Тип:
        </span>
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`px-2.5 py-1 rounded transition-colors ${
            typeFilter === 'all'
              ? 'bg-accent text-white font-semibold'
              : 'bg-surface-2 text-text-muted hover:text-text'
          }`}
        >
          Все
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter('channel')}
          className={`px-2.5 py-1 rounded transition-colors ${
            typeFilter === 'channel'
              ? 'bg-accent text-white font-semibold'
              : 'bg-surface-2 text-text-muted hover:text-text'
          }`}
        >
          Каналы
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter('group')}
          className={`px-2.5 py-1 rounded transition-colors ${
            typeFilter === 'group'
              ? 'bg-accent text-white font-semibold'
              : 'bg-surface-2 text-text-muted hover:text-text'
          }`}
        >
          Группы
        </button>

        <span className="text-border mx-1">|</span>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'all' ? 'enabled' : 'all')}
          className={`px-2.5 py-1 rounded transition-colors ${
            statusFilter === 'enabled'
              ? 'bg-emerald-500 text-white font-semibold'
              : 'bg-surface-2 text-text-muted hover:text-text'
          }`}
        >
          {statusFilter === 'enabled' ? '✓ Только включённые' : 'Все статусы'}
        </button>
      </div>

      {/* Sources List */}
      <div className="bg-surface rounded-card border border-border divide-y divide-border overflow-hidden">
        {filteredSources.length === 0 ? (
          <div className="p-8 text-center text-xs text-text-muted">
            По вашему запросу источников не найдено.
          </div>
        ) : (
          filteredSources.map((source) => {
            const lowerId = source.id.toLowerCase();
            const isEnabled = activeSources.has(lowerId);
            const count7d = sourceStats.map7d.get(lowerId) ?? (source as any).count7d ?? 0;

            return (
              <div
                key={source.id}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors"
              >
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-text truncate">
                      {source.title}
                    </span>
                    <a
                      href={source.url || `https://t.me/${source.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted hover:text-accent font-mono text-[11px] flex items-center gap-0.5"
                    >
                      <span>@{source.id}</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                    <span className="uppercase text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-2">
                      {source.type === 'group' ? 'Группа' : 'Канал'}
                    </span>
                    <span>•</span>
                    <span className={count7d > 0 ? 'text-emerald-400 font-medium' : 'text-muted'}>
                      {count7d > 0 ? `${count7d} лидов за 7 дн.` : 'нет лидов'}
                    </span>
                  </div>
                </div>

                {/* Toggle switch */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleActive(lowerId)}
                    className="sr-only peer"
                    aria-label={`Мониторить ${source.title}`}
                  />
                  <div className="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent" />
                </label>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
