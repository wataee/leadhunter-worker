import React, { useState, useMemo } from 'react';
import { Vacancy } from '../types';
import { formatRelativeTime } from '../lib/time';
import { BudgetBadge } from './BudgetBadge';
import { computeProfileFit } from '../lib/profileFit';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { rewritePitchWithAi } from '../lib/api';
import {
  ExternalLink,
  Send,
  UserPlus,
  EyeOff,
  Flame,
  Eye,
  Sparkles,
  AlertTriangle,
  Star,
  Ban,
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
  onToggleFavorite?: () => void;
  onHideChannel?: (channel: string) => void;
  highlightWords?: string[];
}

export const VacancyCard: React.FC<VacancyCardProps> = ({
  vacancy,
  onApply,
  onConvertToLead,
  onHide,
  onToggleFavorite,
  onHideChannel,
  highlightWords = [],
}) => {
  const profile = useSettingsStore((s) => s.profile);
  const addToast = useToastStore((s) => s.addToast);
  const fitScore = vacancy.profileFit ?? computeProfileFit(vacancy, profile);
  const isHot = vacancy.statusBadge === 'hot' || Date.now() - new Date(vacancy.postedAt).getTime() < 15 * 60 * 1000;

  const [copied, setCopied] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [customDraft, setCustomDraft] = useState<string | null>(null);
  const [isDraftCollapsed, setIsDraftCollapsed] = useState(false);

  const initialDraft = useMemo(() => {
    const ch = vacancy.channel.startsWith('@') ? vacancy.channel : `@${vacancy.channel}`;
    const skillsPart = profile.skills?.length ? `Работаю в ${profile.skills.slice(0, 2).join(', ')}.` : '';
    const portfolio = profile.portfolioUrl || 'https://fleur-editor.netlify.app';
    return `Здравствуйте! Увидел вакансию в ${ch}. Занимаюсь ${profile.specialization || 'видеомонтажом'}. ${skillsPart} Моё портфолио: ${portfolio}. Готов оперативно обсудить задачу!`;
  }, [vacancy.channel, profile]);

  const activeDraft = customDraft ?? initialDraft;

  const handleCopyDraft = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(activeDraft);
      setCopied(true);
      addToast({ type: 'success', message: 'Черновик скопирован в буфер обмена' });
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
        addToast({ type: 'success', message: 'AI подготовил персонализированный отклик!' });
      }
    } catch {
      addToast({ type: 'error', message: 'Ошибка генерации AI. Проверьте настройки ключей.' });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Render text with highlighted keywords
  const renderHighlightedText = (text: string) => {
    if (!highlightWords || highlightWords.length === 0) {
      return text;
    }

    const pattern = new RegExp(
      `(${highlightWords
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')})`,
      'gi'
    );

    const parts = text.split(pattern);

    return parts.map((part, i) =>
      highlightWords.some((w) => w.toLowerCase() === part.toLowerCase()) ? (
        <mark
          key={i}
          className="bg-accent/20 text-accent font-semibold px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      className={`group bg-surface hover:bg-surface-2/60 border ${
        vacancy.statusBadge === 'hot' || isHot
          ? 'border-danger/40 shadow-[0_0_15px_rgba(248,113,113,0.08)]'
          : vacancy.isFavorite
          ? 'border-amber-400/40 bg-amber-400/5'
          : 'border-border'
      } rounded-card p-4 space-y-3 transition-all duration-150`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <a
            href={vacancy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 truncate"
          >
            <span>{vacancy.channel.startsWith('@') ? vacancy.channel : `@${vacancy.channel}`}</span>
            <ExternalLink size={11} />
          </a>
          <span className="text-border">|</span>
          <span className="text-[11px] text-muted font-mono">
            {formatRelativeTime(vacancy.postedAt)}
          </span>
          {vacancy.views && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted font-mono">
              <Eye size={11} />
              <span>{vacancy.views}</span>
            </span>
          )}
          <BudgetBadge budget={vacancy.budget} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status Badges: Hot / New / Shady */}
          {vacancy.statusBadge === 'hot' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger/15 px-2 py-0.5 rounded border border-danger/30 animate-pulse">
              <Flame size={12} />
              <span>Горячее</span>
            </span>
          )}
          {vacancy.statusBadge === 'new' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded border border-accent/30">
              <Sparkles size={12} />
              <span>Новое</span>
            </span>
          )}
          {(vacancy.statusBadge === 'shady' || (vacancy.risks && vacancy.risks.length > 0)) && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold text-warning bg-warning/15 px-2 py-0.5 rounded border border-warning/30 cursor-help"
              title={`⚠️ Риск-факторы:\n${(vacancy.risks || ['Сомнительные условия сотрудничества']).map((r) => `• ${r}`).join('\n')}`}
            >
              <AlertTriangle size={12} />
              <span>Сомнительно</span>
            </span>
          )}

          {/* Fit score badge */}
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${
              fitScore >= 75
                ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
                : fitScore >= 50
                ? 'text-amber-400 bg-amber-400/10 border-amber-400/30'
                : 'text-muted bg-surface-2 border-border'
            }`}
            title={`Совпадение с вашим профилем: ${fitScore}%`}
          >
            <span>🎯 {fitScore}%</span>
            <span className="hidden sm:inline">совпадение</span>
          </span>

          {/* Favorite toggle button */}
          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              className={`p-1.5 rounded transition-colors ${
                vacancy.isFavorite
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-muted hover:text-text'
              }`}
              title={vacancy.isFavorite ? 'В избранном' : 'Добавить в избранное'}
              aria-label="Переключить избранное"
            >
              <Star size={14} className={vacancy.isFavorite ? 'fill-amber-400' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Post Text */}
      <div className="text-xs text-text leading-relaxed whitespace-pre-wrap line-clamp-5 select-text font-sans">
        {renderHighlightedText(vacancy.text)}
      </div>

      {/* 5.4 Risk Warning Callout */}
      {vacancy.risks && vacancy.risks.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-warning-soft/30 border border-warning/30 rounded-control text-[11px] text-text">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
          <div className="space-y-0.5">
            <span className="font-semibold text-warning">Подозрительные условия:</span>
            <ul className="list-disc list-inside space-y-0.5 text-text-muted text-[11px]">
              {vacancy.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 5.3 Quick Pitch Draft for Hot Vacancies (<15 min) */}
      {isHot && (
        <div className="bg-surface-2/70 border border-danger/30 rounded-control p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-danger">
              <Flame size={14} className="animate-pulse" />
              <span>Черновик быстрого отклика (&lt;15 мин)</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleGenerateAiDraft}
                disabled={isGeneratingAi}
                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-hover px-2 py-0.5 rounded hover:bg-accent/10 transition-colors disabled:opacity-50"
                title="Улучшить черновик через AI под контекст вакансии"
              >
                <Sparkles size={12} className={isGeneratingAi ? 'animate-spin' : ''} />
                <span>{isGeneratingAi ? 'Генерирую...' : 'AI-версия'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDraftCollapsed(!isDraftCollapsed)}
                className="text-muted hover:text-text p-1"
                aria-label={isDraftCollapsed ? 'Развернуть черновик' : 'Свернуть черновик'}
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
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                <span className="text-[10px] text-text-muted italic">
                  *Сообщения не отправляются автоматически. Скопируйте и отправьте вручную.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDraft}
                    className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-3 text-text rounded border border-border transition-colors font-medium min-h-[30px]"
                  >
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyAndOpen}
                    className="flex items-center gap-1 px-3 py-1 bg-accent hover:bg-accent-hover text-white rounded font-semibold transition-colors min-h-[30px]"
                  >
                    <span>Скопировать и в чат</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Skills & Software Tags */}
      {vacancy.skills && vacancy.skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] text-muted uppercase font-semibold">Софт:</span>
          {vacancy.skills.map((skill, idx) => (
            <span
              key={idx}
              className="text-[10px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Matched Keywords Tags */}
      {vacancy.matchedKeywords && vacancy.matchedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vacancy.matchedKeywords.map((kw, idx) => (
            <span
              key={idx}
              className="text-[10px] text-text-muted bg-surface-2 px-2 py-0.5 rounded-full border border-border"
            >
              #{kw}
            </span>
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <div className="flex items-center gap-2">
          <button
            onClick={onHide}
            title="Скрыть вакансию"
            className="text-muted hover:text-text p-1.5 rounded-control hover:bg-surface-2 transition-colors text-xs flex items-center gap-1 min-h-[36px]"
            aria-label="Скрыть вакансию"
          >
            <EyeOff size={13} />
            <span className="hidden sm:inline">Скрыть</span>
          </button>

          {onHideChannel && (
            <button
              onClick={() => onHideChannel(vacancy.channel)}
              title={`Скрыть все вакансии из @${vacancy.channel}`}
              className="text-muted hover:text-danger p-1.5 rounded-control hover:bg-surface-2 transition-colors text-xs flex items-center gap-1 min-h-[36px]"
              aria-label={`Скрыть все вакансии из @${vacancy.channel}`}
            >
              <Ban size={13} />
              <span className="hidden sm:inline">Скрыть канал</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onConvertToLead}
            title="Создать лида в воронке"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text bg-surface-2 hover:bg-surface-3 rounded-control border border-border transition-colors min-h-[36px] focus-visible:ring-2 focus-visible:ring-accent"
          >
            <UserPlus size={13} />
            <span>В лиды</span>
          </button>

          <button
            onClick={onApply}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control shadow-subtle transition-colors min-h-[36px] focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Send size={13} />
            <span>Откликнуться</span>
          </button>
        </div>
      </div>
    </div>
  );
};
