import React from 'react';
import { Lead } from '../types';
import { TierBadge } from './TierBadge';
import { ScoreBar } from './ScoreBar';
import { formatDate, isToday, isOverdue } from '../lib/time';
import {
  Send,
  Calendar,
  Sparkles,
  Flame,
} from 'lucide-react';

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
  onOpenPitch: (e: React.MouseEvent) => void;
  isDragging?: boolean;
}

export const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  onClick,
  onOpenPitch,
  isDragging = false,
}) => {
  const overdue = isOverdue(lead.nextTouchAt);
  const todayDue = isToday(lead.nextTouchAt);

  return (
    <div
      onClick={onClick}
      className={`group bg-surface hover:bg-surface-2/70 border border-border hover:border-border-strong rounded-card p-3.5 space-y-3 cursor-pointer transition-all duration-150 select-none shadow-subtle ${
        isDragging ? 'opacity-40 rotate-1 shadow-dropdown border-accent' : ''
      }`}
    >
      {/* Top: Avatar, Name, Tier */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {lead.avatar ? (
            <img
              src={lead.avatar}
              alt={lead.name}
              className="w-8 h-8 rounded-full border border-border object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-accent text-xs shrink-0">
              {lead.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-text truncate group-hover:text-accent transition-colors">
              {lead.name}
            </h4>
            <div className="text-[11px] text-muted font-mono truncate">
              {lead.hiddenSubscribers
                ? 'Скрыто'
                : `${lead.subscribers.toLocaleString('ru-RU')} саб`}
            </div>
          </div>
        </div>

        <TierBadge tier={lead.tier} showLabel={false} />
      </div>

      {/* Score & Niche */}
      <div className="flex items-center justify-between text-[11px] pt-1">
        <span className="text-muted truncate max-w-[120px] bg-surface-2 px-1.5 py-0.5 rounded border border-border/50">
          {lead.niche}
        </span>
        <div className="flex items-center gap-1.5">
          {lead.aiScore !== undefined && (
            <span
              title={lead.aiReason || 'ИИ-оценка клиента'}
              className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-accent-soft text-accent border border-accent/25"
            >
              <Sparkles size={10} />
              <span>ИИ: {lead.aiScore}</span>
            </span>
          )}
          <ScoreBar score={lead.score} showNumber={true} />
        </div>
      </div>

      {/* Findings count & Deal Value */}
      <div className="flex items-center justify-between text-[11px] text-text-muted border-t border-border/40 pt-2">
        <div className="flex items-center gap-2">
          {lead.findings.length > 0 && (
            <span
              title="Найдено зацепок по ролику"
              className="flex items-center gap-1 text-accent font-medium text-[10px] bg-accent-soft px-1.5 py-0.5 rounded"
            >
              <Sparkles size={11} />
              <span>{lead.findings.length}</span>
            </span>
          )}
          {lead.hasProduct && (
            <span
              title="Есть продукт / курс"
              className="flex items-center gap-0.5 text-warning font-medium text-[10px]"
            >
              <Flame size={11} />
              <span>Оффер</span>
            </span>
          )}
        </div>

        <div className="font-mono text-xs font-bold text-text">
          {lead.dealValue ? `${lead.dealValue} ${lead.currency}` : '—'}
        </div>
      </div>

      {/* Bottom Bar: Touch Date & Quick Pitch Trigger */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px]">
        {lead.nextTouchAt ? (
          <span
            className={`flex items-center gap-1 font-mono ${
              overdue
                ? 'text-danger font-semibold'
                : todayDue
                ? 'text-warning font-semibold'
                : 'text-muted'
            }`}
          >
            <Calendar size={11} />
            <span>{formatDate(lead.nextTouchAt)}</span>
            {overdue && <span className="text-[9px] uppercase font-sans">(просрочен)</span>}
          </span>
        ) : (
          <span className="text-muted font-mono">—</span>
        )}

        <button
          onClick={onOpenPitch}
          title="Составить сообщение"
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-accent bg-accent-soft hover:bg-accent/20 rounded border border-accent/20 transition-all"
        >
          <Send size={10} />
          <span>Написать</span>
        </button>
      </div>
    </div>
  );
};
