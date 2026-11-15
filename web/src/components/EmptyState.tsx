import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-8 px-4 bg-surface/40 border border-border/60 rounded-card ${className}`}
    >
      <h3 className="text-xs text-text-muted mb-2 font-medium">{title}</h3>
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control transition-colors min-h-[36px]"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
