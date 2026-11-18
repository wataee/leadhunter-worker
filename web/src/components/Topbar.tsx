import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, AlertCircle } from 'lucide-react';
import { checkApiHealth, HealthStatus } from '../lib/api';

interface TopbarProps {
  onToggleMobile: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleMobile }) => {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    checkApiHealth()
      .then((h) => setHealth(h))
      .catch(() => {});
  }, []);

  const hasTgIssue = health !== null && !health.telegram;

  return (
    <>
      {/* Mobile Topbar */}
      <header className="md:hidden h-14 bg-surface border-b border-border sticky top-0 z-20 flex items-center justify-between px-4">
        <button
          onClick={onToggleMobile}
          aria-label="Открыть меню"
          className="text-text-muted hover:text-text p-2 rounded-control hover:bg-surface-2 transition-colors focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <Menu size={22} />
        </button>

        <div className="font-mono text-base font-bold tracking-tight text-text">
          <span>.lead</span>
          <span className="text-accent">•</span>
          <span className="text-xs uppercase tracking-widest text-muted ml-1 font-sans font-semibold">
            Hunter
          </span>
        </div>

        {hasTgIssue ? (
          <Link
            to="/settings"
            title="Telegram-бот не отвечает"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-danger/10 text-danger border border-danger/20 rounded-full text-xs"
          >
            <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
            <AlertCircle size={14} />
          </Link>
        ) : (
          <div className="w-8" />
        )}
      </header>

      {/* Desktop Alert: shown ONLY when there is a Telegram bot issue */}
      {hasTgIssue && (
        <div className="hidden md:flex fixed top-3 right-6 z-30">
          <Link
            to="/settings"
            title="Telegram-бот не отвечает"
            className="flex items-center gap-2 px-3 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 rounded-control text-xs transition-colors shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-danger animate-ping" />
            <span>Telegram-бот не отвечает</span>
          </Link>
        </div>
      )}
    </>
  );
};
