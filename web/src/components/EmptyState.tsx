import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 bg-surface/50 border border-border border-dashed rounded-card ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted mb-3">
        <Icon size={22} />
      </div>
      <h3 className="text-sm font-semibold text-text mb-1">{title}</h3>
      <p className="text-xs text-text-muted max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-accent bg-accent-soft hover:bg-accent/20 rounded-control border border-accent/20 transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
