import React from 'react';

interface ScoreBarProps {
  score: number;
  showNumber?: boolean;
  className?: string;
}

export const ScoreBar: React.FC<ScoreBarProps> = ({
  score,
  showNumber = true,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  const getBarColor = (val: number) => {
    if (val >= 70) return '#FBBF24'; // Tier 1 gold
    if (val >= 45) return '#8B7CFF'; // Tier 2 accent
    return '#8B8F9A'; // Tier 3 muted
  };

  const barColor = getBarColor(clamped);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden border border-border/60">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${clamped}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      {showNumber && (
        <span
          className="font-mono text-xs font-medium"
          style={{ color: barColor }}
        >
          {clamped}
        </span>
      )}
    </div>
  );
};
