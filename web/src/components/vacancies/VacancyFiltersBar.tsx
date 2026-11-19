import React from 'react';
import { Link } from 'react-router-dom';
import { Languages, CheckCheck } from 'lucide-react';

export type FormatFilter = 'all' | 'reels' | 'youtube' | 'podcast' | 'other';
export type SeenFilter = 'unseen' | 'seen' | 'all';

interface VacancyFiltersBarProps {
  seenFilter: SeenFilter;
  onChangeSeenFilter: (filter: SeenFilter) => void;
  unseenCount: number;
  seenCount: number;
  totalCount: number;
  onMarkAllSeen?: () => void;
  hotOnly: boolean;
  onToggleHotOnly: (val: boolean) => void;
  formatFilter: FormatFilter;
  onChangeFormatFilter: (format: FormatFilter) => void;
  activeSourcesCount: number;
  totalSourcesCount: number;
  autoTranslate?: boolean;
  onToggleAutoTranslate?: (val: boolean) => void;
}

export const VacancyFiltersBar: React.FC<VacancyFiltersBarProps> = ({
  seenFilter,
  onChangeSeenFilter,
  unseenCount,
  seenCount,
  totalCount,
  onMarkAllSeen,
  hotOnly,
  onToggleHotOnly,
  formatFilter,
  onChangeFormatFilter,
  activeSourcesCount,
  totalSourcesCount,
  autoTranslate = true,
  onToggleAutoTranslate,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      {/* Filters: Seen/Unseen tabs + Hot toggle + Format dropdown + Auto-translate toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Seen / Unseen / Hot Tabs */}
        <div className="inline-flex p-0.5 bg-surface-2 rounded-control border border-border text-xs">
          <button
            type="button"
            onClick={() => {
              onChangeSeenFilter('unseen');
              onToggleHotOnly(false);
            }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[32px] ${
              seenFilter === 'unseen' && !hotOnly
                ? 'bg-surface text-text font-semibold shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <span>Непросмотренные</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                seenFilter === 'unseen' && !hotOnly
                  ? 'bg-accent/20 text-accent font-bold'
                  : 'bg-surface-3 text-text-muted'
              }`}
            >
              {unseenCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeSeenFilter('seen');
              onToggleHotOnly(false);
            }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[32px] ${
              seenFilter === 'seen' && !hotOnly
                ? 'bg-surface text-text font-semibold shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <span>Просмотрено</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-3 text-text-muted font-mono">
              {seenCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggleHotOnly(!hotOnly)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 min-h-[32px] ${
              hotOnly
                ? 'bg-danger text-white font-semibold shadow-sm'
                : 'text-text-muted hover:text-danger'
            }`}
          >
            <span>Горячие</span>
            <span className="text-[10px] opacity-80">(&lt;20 мин)</span>
          </button>
        </div>

        {/* Mark All Seen button */}
        {unseenCount > 0 && onMarkAllSeen && seenFilter === 'unseen' && (
          <button
            type="button"
            onClick={onMarkAllSeen}
            title="Отметить все вакансии как просмотренные"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted hover:text-text bg-surface-2 hover:bg-surface-3 rounded-control border border-border transition-colors min-h-[32px]"
          >
            <CheckCheck size={14} className="text-emerald-400" />
            <span className="hidden sm:inline">Все просмотрены</span>
          </button>
        )}

        {/* Format Dropdown */}
        <select
          value={formatFilter}
          onChange={(e) => onChangeFormatFilter(e.target.value as FormatFilter)}
          className="bg-surface-2 text-text text-xs rounded-control border border-border px-3 py-1.5 focus:outline-none focus:border-accent min-h-[36px]"
          aria-label="Фильтр по формату видео"
        >
          <option value="all">Все форматы</option>
          <option value="reels">Reels / Shorts</option>
          <option value="youtube">YouTube</option>
          <option value="podcast">Подкасты</option>
          <option value="other">Другое</option>
        </select>

        {/* Free AI/Neural Translation toggle */}
        {onToggleAutoTranslate && (
          <button
            type="button"
            onClick={() => onToggleAutoTranslate(!autoTranslate)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control border text-xs font-medium transition-colors min-h-[36px] ${
              autoTranslate
                ? 'bg-accent/15 text-accent border-accent/40 font-semibold'
                : 'bg-surface-2 text-text-muted border-border hover:text-text'
            }`}
            title="Бесплатный автоперевод иностранных и казахских объявлений на русский"
          >
            <Languages size={14} />
            <span>Перевод: {autoTranslate ? 'ВКЛ' : 'ВЫКЛ'}</span>
          </button>
        )}
      </div>

      {/* Right Link to Sources */}
      <Link
        to="/sources"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border text-xs font-semibold hover:border-accent transition-colors min-h-[36px]"
        title="Перейти к списку источников и настроить каналы"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>
          Мониторинг: {activeSourcesCount} из {totalSourcesCount} каналов →
        </span>
      </Link>
    </div>
  );
};
