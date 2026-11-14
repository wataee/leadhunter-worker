import React from 'react';
import { Vacancy } from '../types';
import { formatRelativeTime } from '../lib/time';
import { Badge } from './Badge';
import {
  ExternalLink,
  Send,
  UserPlus,
  EyeOff,
  Flame,
  Eye,
} from 'lucide-react';

interface VacancyCardProps {
  vacancy: Vacancy;
  onApply: () => void;
  onConvertToLead: () => void;
  onHide: () => void;
  highlightWords?: string[];
}

export const VacancyCard: React.FC<VacancyCardProps> = ({
  vacancy,
  onApply,
  onConvertToLead,
  onHide,
  highlightWords = [],
}) => {
  const isHot =
    Date.now() - new Date(vacancy.postedAt).getTime() < 20 * 60 * 1000;

  // Render text with highlighted keywords
  const renderHighlightedText = (text: string) => {
    if (!highlightWords || highlightWords.length === 0) {
      return text;
    }

    const pattern = new RegExp(
      `(${highlightWords
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')})`,
      'gi'
    );

    const parts = text.split(pattern);

    return parts.map((part, i) =>
      highlightWords.some((w) => w.toLowerCase() === part.toLowerCase()) ? (
        <mark
          key={i}
          className="bg-accent/20 text-accent font-semibold px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      className={`group bg-surface hover:bg-surface-2/60 border ${
        isHot ? 'border-danger/40 shadow-[0_0_15px_rgba(248,113,113,0.08)]' : 'border-border'
      } rounded-card p-4 space-y-3 transition-all duration-150`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={vacancy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 truncate"
          >
            <span>{vacancy.channel.startsWith('@') ? vacancy.channel : `@${vacancy.channel}`}</span>
            <ExternalLink size={11} />
          </a>
          <span className="text-border">|</span>
          <span className="text-[11px] text-muted font-mono">
            {formatRelativeTime(vacancy.postedAt)}
          </span>
          {vacancy.views && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted font-mono">
              <Eye size={11} />
              <span>{vacancy.views}</span>
            </span>
          )}
          {vacancy.budget && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
              💰 {vacancy.budget.currency === 'NEGOTIABLE'
                ? 'По договорённости'
                : `${vacancy.budget.min != null ? vacancy.budget.min.toLocaleString('ru-RU') : ''}${
                    vacancy.budget.min != null && vacancy.budget.max != null && vacancy.budget.min !== vacancy.budget.max ? ' - ' : ''
                  }${
                    vacancy.budget.max != null && vacancy.budget.max !== vacancy.budget.min ? vacancy.budget.max.toLocaleString('ru-RU') : ''
                  } ${vacancy.budget.currency === 'RUB' ? '₽' : vacancy.budget.currency === 'USD' ? '$' : vacancy.budget.currency === 'EUR' ? '€' : vacancy.budget.currency === 'KZT' ? '₸' : vacancy.budget.currency}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Quality Tier Badge */}
          {vacancy.qualityTier === 'great' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-success-soft px-2 py-0.5 rounded border border-success/20">
              🟢 Отличная
            </span>
          )}
          {vacancy.qualityTier === 'fair' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded border border-warning/20">
              🟡 Приемлемая
            </span>
          )}
          {vacancy.qualityTier === 'shady' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger bg-danger-soft px-2 py-0.5 rounded border border-danger/20">
              🔴 Сомнительная
            </span>
          )}

          {/* Format Tag */}
          {vacancy.formatTag === 'short' && (
            <span className="text-[10px] font-mono text-accent bg-accent-soft px-2 py-0.5 rounded border border-accent/20">
              #короткийформат
            </span>
          )}
          {vacancy.formatTag === 'long' && (
            <span className="text-[10px] font-mono text-info bg-info-soft px-2 py-0.5 rounded border border-info/20">
              #длинныйформат
            </span>
          )}
          {vacancy.formatTag === 'both' && (
            <span className="text-[10px] font-mono text-text-muted bg-surface-2 px-2 py-0.5 rounded border border-border">
              #short & long
            </span>
          )}

          {isHot && (
            <Badge variant="danger" size="sm" dot={true} pulsing={true}>
              <Flame size={12} className="text-danger inline" />
              <span>Горячая</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Post Text */}
      <div className="text-xs text-text leading-relaxed whitespace-pre-wrap line-clamp-5 select-text font-sans">
        {renderHighlightedText(vacancy.text)}
      </div>

      {/* Matched Keywords Tags */}
      {vacancy.matchedKeywords && vacancy.matchedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {vacancy.matchedKeywords.map((kw, idx) => (
            <span
              key={idx}
              className="text-[10px] text-text-muted bg-surface-2 px-2 py-0.5 rounded-full border border-border"
            >
              #{kw}
            </span>
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <div className="flex items-center gap-1">
          <button
            onClick={onHide}
            title="Скрыть вакансию"
            className="text-muted hover:text-text p-1.5 rounded-control hover:bg-surface-2 transition-colors text-xs flex items-center gap-1"
          >
            <EyeOff size={13} />
            <span className="hidden sm:inline">Скрыть</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onConvertToLead}
            title="Создать лида в воронке"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text bg-surface-2 hover:bg-surface-3 rounded-control border border-border transition-colors"
          >
            <UserPlus size={13} />
            <span>В лиды</span>
          </button>

          <button
            onClick={onApply}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control shadow-subtle transition-colors"
          >
            <Send size={13} />
            <span>Откликнуться</span>
          </button>
        </div>
      </div>
    </div>
  );
};
