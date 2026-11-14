import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  diffPercent?: number; // e.g. +12 or -5
  diffLabel?: string;
  icon?: LucideIcon;
  accentColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  diffPercent,
  diffLabel = 'к прошлой неделе',
  icon: Icon,
  accentColor = '#8B7CFF',
}) => {
  const isPositive = (diffPercent ?? 0) >= 0;

  return (
    <div className="bg-surface rounded-card p-4 border border-border flex flex-col justify-between hover:border-border-strong transition-colors duration-150">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-text-muted font-medium tracking-wide">
          {label}
        </span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${accentColor}18`,
              color: accentColor,
            }}
          >
            <Icon size={16} />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 my-1">
        <span className="font-mono text-2xl font-bold text-text">
          {value}
        </span>
        {subValue && (
          <span className="font-mono text-xs text-muted">
            {subValue}
          </span>
        )}
      </div>

      {diffPercent !== undefined && (
        <div className="flex items-center gap-1.5 text-[11px] mt-1 pt-1.5 border-t border-border/50">
          <span
            className={`inline-flex items-center gap-0.5 font-mono font-medium ${
              isPositive ? 'text-success' : 'text-danger'
            }`}
          >
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isPositive ? `+${diffPercent}%` : `${diffPercent}%`}
          </span>
          <span className="text-text-muted/70 truncate">{diffLabel}</span>
        </div>
      )}
    </div>
  );
};
