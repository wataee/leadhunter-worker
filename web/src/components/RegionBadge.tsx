import React from 'react';

interface RegionBadgeProps {
  region?: 'EU' | 'US' | 'KZ' | string;
  className?: string;
  showText?: boolean;
}

export const FlagKZ: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-2.5 shrink-0 rounded-[1px]' }) => (
  <svg viewBox="0 0 16 11" className={className} aria-label="Флаг Казахстана" fill="none">
    <rect width="16" height="11" fill="#00AFCA" />
    <circle cx="8" cy="5.5" r="2.2" fill="#FEC50C" />
    <path
      d="M5.5 7.8C6.6 7.2 9.4 7.2 10.5 7.8C9.5 8.3 6.5 8.3 5.5 7.8Z"
      fill="#FEC50C"
    />
    <path
      d="M1.2 1.5H2V9.5H1.2V1.5Z"
      fill="#FEC50C"
      opacity="0.8"
    />
  </svg>
);

export const FlagEU: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-2.5 shrink-0 rounded-[1px]' }) => (
  <svg viewBox="0 0 16 11" className={className} aria-label="Флаг ЕС" fill="none">
    <rect width="16" height="11" fill="#003399" />
    <circle cx="8" cy="5.5" r="3" stroke="#FFCC00" strokeWidth="0.8" strokeDasharray="0.6 0.95" fill="none" />
  </svg>
);

export const FlagUS: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-2.5 shrink-0 rounded-[1px]' }) => (
  <svg viewBox="0 0 16 11" className={className} aria-label="Флаг США" fill="none">
    <rect width="16" height="11" fill="#B22234" />
    <rect y="1.7" width="16" height="1.7" fill="#FFFFFF" />
    <rect y="5.1" width="16" height="1.7" fill="#FFFFFF" />
    <rect y="8.5" width="16" height="1.7" fill="#FFFFFF" />
    <rect width="7" height="6" fill="#3C3B6E" />
  </svg>
);

export const RegionBadge: React.FC<RegionBadgeProps> = ({
  region,
  className = '',
  showText = true,
}) => {
  const reg = (region || 'US').toUpperCase();

  if (reg === 'KZ') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-text bg-surface-2 px-1.5 py-0.5 rounded-control border border-border ${className}`}
        title="Казахстан (KZ)"
      >
        <FlagKZ />
        {showText && <span className="font-mono">KZ</span>}
      </span>
    );
  }

  if (reg === 'EU') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-text bg-surface-2 px-1.5 py-0.5 rounded-control border border-border ${className}`}
        title="Европа / UK (EU)"
      >
        <FlagEU />
        {showText && <span className="font-mono">EU</span>}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-text bg-surface-2 px-1.5 py-0.5 rounded-control border border-border ${className}`}
      title="США / Международный (US)"
    >
      <FlagUS />
      {showText && <span className="font-mono">US</span>}
    </span>
  );
};
