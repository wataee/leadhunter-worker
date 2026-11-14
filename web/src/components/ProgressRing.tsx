import React from 'react';

interface ProgressRingProps {
  current: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  current,
  total,
  size = 76,
  strokeWidth = 6,
  className = '',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(Math.max(current / safeTotal, 0), 1);
  const strokeDashoffset = circumference - ratio * circumference;

  const isCompleted = current >= total && total > 0;
  const strokeColor = isCompleted ? '#4ADE80' : '#8B7CFF';

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#23262F"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Active progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-sm font-semibold text-text">
          {current}
        </span>
        <span className="font-mono text-[10px] text-muted -mt-0.5">
          /{total}
        </span>
      </div>
    </div>
  );
};
