import React, { useEffect, useState } from 'react';
import { Menu, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { checkApiHealth, HealthStatus } from '../lib/api';

interface TopbarProps {
  onToggleMobile: () => void;
  onOpenShortcuts: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleMobile }) => {
  const { todaySentCount, dailyGoal, incrementSentCount, resetDailyIfNewDay } =
    useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);

  const [health, setHealth] = useState<HealthStatus>({
    youtube: false,
    telegram: false,
    ai: false,
  });

  useEffect(() => {
    resetDailyIfNewDay();
    checkApiHealth()
      .then((h) => setHealth(h))
      .catch(() => {});
  }, [resetDailyIfNewDay]);

  const handleQuickAddSent = () => {
    incrementSentCount();
    addToast({
      type: 'success',
      title: '+1 отправлено!',
      message: `Сегодня отправлено ${todaySentCount + 1} из ${dailyGoal}`,
      duration: 2500,
    });
  };

  const todayStr = new Date().toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-border sticky top-0 z-20 flex items-center justify-between px-4 md:px-6">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobile}
          aria-label="Открыть меню"
          className="md:hidden text-text-muted hover:text-text p-2 rounded-control hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted capitalize">
            {todayStr}
          </span>
          <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-border-strong" />
          <span className="hidden sm:inline-block text-xs font-medium text-text">
            Рабочая сессия
          </span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* API Health indicator pills */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-text-muted bg-surface-2/60 px-2.5 py-1 rounded-full border border-border">
          <span className="flex items-center gap-1">
            {health.youtube ? (
              <CheckCircle2 size={12} className="text-success" />
            ) : (
              <AlertCircle size={12} className="text-warning" />
            )}
            <span>YouTube API</span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1">
            {health.telegram ? (
              <CheckCircle2 size={12} className="text-success" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-muted" />
            )}
            <span>TG Bot</span>
          </span>
        </div>

        {/* Quick +1 Sent Action */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 rounded-control border border-border text-xs">
            <span className="text-text-muted">Норма:</span>
            <span className="font-mono font-semibold text-accent">
              {todaySentCount}/{dailyGoal}
            </span>
          </div>

          <button
            onClick={handleQuickAddSent}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover active:scale-[0.98] text-white text-xs font-semibold rounded-control shadow-subtle transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>+1 отправлено</span>
          </button>
        </div>
      </div>
    </header>
  );
};
