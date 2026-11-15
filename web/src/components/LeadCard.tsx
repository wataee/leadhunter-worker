import React from 'react';
import { Lead } from '../types';
import { formatDate, isToday, isOverdue } from '../lib/time';
import { Send, Calendar } from 'lucide-react';

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
      className={`group bg-surface hover:bg-surface-2/70 border border-border hover:border-accent/40 rounded-card p-3 space-y-2 cursor-pointer transition-all select-none shadow-subtle ${
        isDragging ? 'opacity-40 rotate-1 shadow-dropdown border-accent' : ''
      }`}
    >
      {/* Name and Niche */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-text truncate group-hover:text-accent transition-colors">
            {lead.name}
          </h4>
          <div className="text-[11px] text-muted truncate">
            {lead.niche || 'Видеомонтаж'}
          </div>
        </div>

        {lead.dealValue ? (
          <span className="font-mono text-[11px] font-bold text-accent shrink-0">
            {lead.dealValue} {lead.currency}
          </span>
        ) : null}
      </div>

      {lead.notes && (
        <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
          {lead.notes}
        </p>
      )}

      {/* Bottom Bar: Touch Date + Quick Pitch */}
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
          <span className="text-muted font-mono">Касаний: {lead.touchesCount || 0}</span>
        )}

        <button
          onClick={onOpenPitch}
          title="Составить сообщение"
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-accent bg-accent/10 hover:bg-accent/20 rounded transition-colors"
        >
          <Send size={10} />
          <span>Написать</span>
        </button>
      </div>
    </div>
  );
};
