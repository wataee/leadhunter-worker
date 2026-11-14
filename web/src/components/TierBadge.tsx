import React from 'react';
import { LeadTier } from '../types';

interface TierBadgeProps {
  tier: LeadTier;
  showLabel?: boolean;
  className?: string;
}

export const TierBadge: React.FC<TierBadgeProps> = ({
  tier,
  showLabel = true,
  className = '',
}) => {
  const configs = {
    1: {
      color: '#FBBF24',
      bg: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(251, 191, 36, 0.25)',
      text: 'Топ-клиент (VIP)',
      short: 'T1',
    },
    2: {
      color: '#8B7CFF',
      bg: 'rgba(139, 124, 255, 0.12)',
      border: 'rgba(139, 124, 255, 0.25)',
      text: 'Перспективный',
      short: 'T2',
    },
    3: {
      color: '#8B8F9A',
      bg: 'rgba(139, 143, 154, 0.12)',
      border: 'rgba(139, 143, 154, 0.25)',
      text: 'Обычный',
      short: 'T3',
    },
  };

  const cfg = configs[tier] || configs[3];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${className}`}
      style={{
        color: cfg.color,
        backgroundColor: cfg.bg,
        borderColor: cfg.border,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: cfg.color }}
      />
      {showLabel ? cfg.text : cfg.short}
    </span>
  );
};
