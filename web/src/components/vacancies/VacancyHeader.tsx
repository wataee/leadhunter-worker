import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface VacancyHeaderProps {
  count: number;
  lastRefreshedAt: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  lastError?: string | null;
}

export const VacancyHeader: React.FC<VacancyHeaderProps> = ({
  count,
  lastRefreshedAt,
  isLoading,
  onRefresh,
  lastError,
}) => {
  const formatUpdatedTime = () => {
    if (!lastRefreshedAt) return 'только что';
    const diffMin = Math.round((Date.now() - new Date(lastRefreshedAt).getTime()) / 60000);
    if (diffMin <= 1) return 'только что';
    return `${diffMin} мин назад`;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-xl md:text-2xl font-bold text-text">Вакансии</h1>
        <span className="text-sm font-mono text-text-muted">{count}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
        {lastError ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-danger font-medium max-w-xs truncate"
            title={`Ошибка обновления: ${lastError}`}
          >
            <AlertCircle size={13} className="shrink-0 text-danger" />
            <span className="truncate">Ошибка: {lastError}</span>
          </span>
        ) : (
          <span className="text-xs text-muted">обновлено {formatUpdatedTime()}</span>
        )}

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text text-xs font-semibold rounded-control border border-border transition-colors disabled:opacity-50 min-h-[36px]"
          title="Проверить новые вакансии в Telegram"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          <span>{isLoading ? 'Проверка...' : 'Обновить'}</span>
        </button>
      </div>
    </div>
  );
};
