import React from 'react';
import { Link } from 'react-router-dom';

export type FormatFilter = 'all' | 'reels' | 'youtube' | 'podcast' | 'other';

interface VacancyFiltersBarProps {
  hotOnly: boolean;
  onToggleHotOnly: (val: boolean) => void;
  formatFilter: FormatFilter;
  onChangeFormatFilter: (format: FormatFilter) => void;
  activeSourcesCount: number;
}

export const VacancyFiltersBar: React.FC<VacancyFiltersBarProps> = ({
  hotOnly,
  onToggleHotOnly,
  formatFilter,
  onChangeFormatFilter,
  activeSourcesCount,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      {/* 2 Filters: Hot toggle + Format dropdown */}
      <div className="flex flex-wrap items-center gap-2">
        {/* All / Hot Toggle */}
        <div className="inline-flex p-0.5 bg-surface-2 rounded-control border border-border text-xs">
          <button
            type="button"
            onClick={() => onToggleHotOnly(false)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors min-h-[32px] ${
              !hotOnly
                ? 'bg-surface text-text font-semibold shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Все
          </button>
          <button
            type="button"
            onClick={() => onToggleHotOnly(true)}
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
      </div>

      {/* Right Link to Sources */}
      <Link
        to="/sources"
        className="text-xs text-text-muted hover:text-accent font-medium transition-colors"
        title="Перейти к списку источников"
      >
        Источники: {activeSourcesCount} активных →
      </Link>
    </div>
  );
};
