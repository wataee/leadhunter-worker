import React, { useState, useMemo } from 'react';
import { Vacancy } from '../types';
import { formatRelativeTime } from '../lib/time';
import { BudgetBadge } from './BudgetBadge';
import { getProfileFitLevel } from '../lib/profileFit';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { rewritePitchWithAi } from '../lib/api';
import { parseStructuredVacancy } from '../shared/vacancyParser';
import { RateCalculatorModal } from './RateCalculatorModal';
import { ClientBriefModal } from './ClientBriefModal';
import { VacancyActionMenu } from './vacancies/VacancyActionMenu';
import {
  ExternalLink,
  Send,
  UserPlus,
  Flame,
  Sparkles,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface VacancyCardProps {
  vacancy: Vacancy;
  onApply: () => void;
  onConvertToLead: () => void;
  onHide: () => void;
  onHideChannel?: (channel: string) => void;
  highlightWords?: string[];
}

export const VacancyCard: React.FC<VacancyCardProps> = ({
  vacancy,
  onApply,
  onConvertToLead,
  onHide,
  onHideChannel,
}) => {
  const profile = useSettingsStore((s) => s.profile);
  const addToast = useToastStore((s) => s.addToast);
  const [showRateCalculator, setShowRateCalculator] = useState(false);
  const [showClientBrief, setShowClientBrief] = useState(false);
  const [isExpandedText, setIsExpandedText] = useState(false);

  // Структурированный парсинг вакансии (софт, дедлайн, хронометраж)
  const structured = useMemo(() => parseStructuredVacancy(vacancy.text), [vacancy.text]);

  // Расчёт понятного уровня соответствия (Подходит / Возможно / Мимо)
  const fit = useMemo(() => getProfileFitLevel(vacancy, profile), [vacancy, profile]);

  const diffMs = Date.now() - new Date(vacancy.postedAt).getTime();
  const isHot = !structured.isClosed && diffMs < 20 * 60 * 1000;
  const isNew = !isHot && diffMs < 2 * 60 * 60 * 1000;

  // Черновик отклика
  const [copied, setCopied] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [customDraft, setCustomDraft] = useState<string | null>(null);
  const [isDraftCollapsed, setIsDraftCollapsed] = useState(false);

  const initialDraft = useMemo(() => {
    const ch = vacancy.channel.startsWith('@') ? vacancy.channel : `@${vacancy.channel}`;
    const skillsPart = profile.skills?.length ? `Работаю в ${profile.skills.slice(0, 2).join(', ')}.` : '';
    const portfolio = profile.portfolioUrl || 'https://fleur-editor.netlify.app';
    return `Здравствуйте! Увидел вакансию в ${ch}. Занимаюсь ${profile.specialization || 'видеомонтажом'}. ${skillsPart} Моё портфолио: ${portfolio}. Готов обсудить детали!`;
  }, [vacancy.channel, profile]);

  const activeDraft = customDraft ?? initialDraft;

  const handleCopyDraft = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(activeDraft);
      setCopied(true);
      addToast({ type: 'success', message: 'Черновик скопирован' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({ type: 'error', message: 'Не удалось скопировать' });
    }
  };

  const handleCopyAndOpen = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await handleCopyDraft();
    window.open(vacancy.url, '_blank', 'noopener,noreferrer');
  };

  const handleGenerateAiDraft = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsGeneratingAi(true);
    try {
      const res = await rewritePitchWithAi({
        text: activeDraft,
        leadContext: {
          name: vacancy.channel,
          channel: vacancy.channel,
          niche: `Telegram-вакансия (${vacancy.matchedKeywords?.join(', ') || 'монтаж'})`,
        },
      });
      if (res.rewritten) {
        setCustomDraft(res.rewritten);
        addToast({ type: 'success', message: 'AI подготовил персонализированный отклик' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка генерации AI. Проверьте API ключ.';
      addToast({ type: 'error', message: msg });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const cleanChannel = vacancy.channel.replace(/^@/, '');

  return (
    <div
      className={`group bg-surface hover:bg-surface-2/40 border ${
        isHot ? 'border-danger/30' : 'border-border'
      } rounded-card p-4 space-y-3 transition-all duration-150`}
    >
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <a
            href={vacancy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 truncate"
          >
            <span>@{cleanChannel}</span>
            <ExternalLink size={11} />
          </a>
          <span className="text-border">|</span>
          <span className="text-[11px] text-muted font-mono">
            {formatRelativeTime(vacancy.postedAt)}
          </span>
          <BudgetBadge budget={vacancy.budget} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Single status badge: Hot OR New */}
          {isHot ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger/15 px-2 py-0.5 rounded border border-danger/30">
              <Flame size={12} />
              <span>Горячее</span>
            </span>
          ) : isNew ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded border border-accent/30">
              <Sparkles size={12} />
              <span>Новое</span>
            </span>
          ) : null}

          {/* 3-level fit badge: Подходит / Возможно */}
          {fit.level === 'great' ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/25 cursor-help"
              title={fit.reason}
            >
              <span>Подходит</span>
            </span>
          ) : fit.level === 'fair' ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted bg-surface-2 px-2 py-0.5 rounded border border-border cursor-help"
              title={fit.reason}
            >
              <span>Возможно</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Structured info chips (if present) */}
      {(structured.isClosed || structured.deadline || structured.duration) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {structured.isClosed && (
            <span className="inline-flex items-center gap-1 font-bold text-danger bg-danger/15 px-2 py-0.5 rounded border border-danger/30">
              <AlertTriangle size={12} />
              <span>Похоже, закрыта</span>
            </span>
          )}
          {structured.deadline && (
            <span className="font-medium text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/25">
              {structured.deadline}
            </span>
          )}
          {structured.duration && (
            <span className="font-medium text-blue-300 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/25">
              ⏱️ {structured.duration}
            </span>
          )}
        </div>
      )}

      {/* Post Text: 6 lines clamp with toggle */}
      <div className="space-y-1">
        <div
          className={`text-xs text-text leading-relaxed whitespace-pre-wrap select-text font-sans ${
            !isExpandedText ? 'line-clamp-6' : ''
          }`}
        >
          {vacancy.text}
        </div>
        {vacancy.text.length > 250 && (
          <button
            type="button"
            onClick={() => setIsExpandedText(!isExpandedText)}
            className="text-[11px] text-accent hover:underline font-medium pt-0.5"
          >
            {isExpandedText ? 'Свернуть' : 'Показать полностью'}
          </button>
        )}
      </div>

      {/* Useful Chips: Soft/Skills and Format only */}
      {(vacancy.skills && vacancy.skills.length > 0) || vacancy.formatTag ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {vacancy.formatTag && (
            <span className="text-[10px] font-medium text-text-muted bg-surface-2 px-2 py-0.5 rounded border border-border">
              {vacancy.formatTag === 'short'
                ? 'Shorts / Reels'
                : vacancy.formatTag === 'long'
                ? 'YouTube'
                : 'Любой формат'}
            </span>
          )}
          {vacancy.skills?.map((skill, idx) => (
            <span
              key={idx}
              className="text-[10px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      {/* Quick Pitch Draft for Hot Vacancies (<20 min) */}
      {isHot && (
        <div className="bg-surface-2/70 border border-danger/30 rounded-control p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-danger">
              <Flame size={14} className="animate-pulse" />
              <span>Быстрый отклик</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleGenerateAiDraft}
                disabled={isGeneratingAi}
                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-hover px-2 py-0.5 rounded hover:bg-accent/10 transition-colors disabled:opacity-50"
                title="Улучшить текст через AI"
              >
                <Sparkles size={12} className={isGeneratingAi ? 'animate-spin' : ''} />
                <span>{isGeneratingAi ? '...' : 'AI-версия'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDraftCollapsed(!isDraftCollapsed)}
                className="text-muted hover:text-text p-1"
                aria-label={isDraftCollapsed ? 'Развернуть' : 'Свернуть'}
              >
                {isDraftCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>

          {!isDraftCollapsed && (
            <>
              <p className="text-xs text-text bg-surface/80 p-2.5 rounded border border-border/60 leading-relaxed font-sans select-text">
                {activeDraft}
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyDraft}
                  className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-3 text-text rounded border border-border transition-colors text-xs font-medium min-h-[30px]"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copied ? 'Скопировано' : 'Копировать'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyAndOpen}
                  className="flex items-center gap-1 px-3 py-1 bg-accent hover:bg-accent-hover text-white rounded text-xs font-semibold transition-colors min-h-[30px]"
                >
                  <span>Скопировать и в чат</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action Footer: 1 Primary + 1 Secondary + ⋯ Menu */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <VacancyActionMenu
          channel={vacancy.channel}
          onHide={onHide}
          onHideChannel={onHideChannel ? () => onHideChannel(vacancy.channel) : undefined}
          onOpenCalculator={() => setShowRateCalculator(true)}
          onOpenBrief={() => setShowClientBrief(true)}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={onConvertToLead}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text bg-surface-2 hover:bg-surface-3 rounded-control border border-border transition-colors min-h-[36px]"
          >
            <UserPlus size={13} />
            <span>В лиды</span>
          </button>

          <button
            onClick={onApply}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control shadow-subtle transition-colors min-h-[36px]"
          >
            <Send size={13} />
            <span>Откликнуться</span>
          </button>
        </div>
      </div>

      {/* Auxiliary Modals */}
      <RateCalculatorModal
        isOpen={showRateCalculator}
        onClose={() => setShowRateCalculator(false)}
        vacancyBudget={vacancy.budget?.max ?? vacancy.budget?.min ?? null}
        vacancyCurrency={vacancy.budget?.currency}
      />

      <ClientBriefModal
        isOpen={showClientBrief}
        onClose={() => setShowClientBrief(false)}
        leadTitle={`@${cleanChannel}`}
        videoType={structured.duration || 'YouTube'}
      />
    </div>
  );
};
