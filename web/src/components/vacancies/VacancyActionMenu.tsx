import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, EyeOff, Ban, Calculator, FileQuestion, CheckCircle2, RotateCcw } from 'lucide-react';

interface VacancyActionMenuProps {
  channel: string;
  isSeen?: boolean;
  onToggleSeen?: () => void;
  onHide: () => void;
  onHideChannel?: () => void;
  onOpenCalculator: () => void;
  onOpenBrief: () => void;
}

export const VacancyActionMenu: React.FC<VacancyActionMenuProps> = ({
  channel,
  isSeen = false,
  onToggleSeen,
  onHide,
  onHideChannel,
  onOpenCalculator,
  onOpenBrief,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const cleanChannel = channel.replace(/^@/, '');

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Дополнительные действия"
        aria-expanded={isOpen}
        className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded-control border border-border transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center focus:outline-none"
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 w-52 bg-surface border border-border rounded-control shadow-xl z-30 py-1 text-xs">
          {onToggleSeen && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleSeen();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-text-muted hover:text-text hover:bg-surface-2 text-left transition-colors"
            >
              {isSeen ? (
                <>
                  <RotateCcw size={14} className="text-amber-400" />
                  <span>Вернуть в непросмотренные</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>Отметить как просмотренное</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onHide();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-text-muted hover:text-text hover:bg-surface-2 text-left transition-colors"
          >
            <EyeOff size={14} />
            <span>Скрыть вакансию</span>
          </button>

          {onHideChannel && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onHideChannel();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-text-muted hover:text-danger hover:bg-danger/10 text-left transition-colors"
            >
              <Ban size={14} />
              <span className="truncate">Скрыть канал @{cleanChannel}</span>
            </button>
          )}

          <div className="h-px bg-border my-1" />

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenCalculator();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-text-muted hover:text-accent hover:bg-surface-2 text-left transition-colors"
          >
            <Calculator size={14} />
            <span>Калькулятор ставки</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenBrief();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-text-muted hover:text-accent hover:bg-surface-2 text-left transition-colors"
          >
            <FileQuestion size={14} />
            <span>Вопросы для брифа</span>
          </button>
        </div>
      )}
    </div>
  );
};
