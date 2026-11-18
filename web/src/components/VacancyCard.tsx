import React, { useState, useMemo, useEffect } from 'react';
import { Vacancy } from '../types';
import { formatRelativeTime } from '../lib/time';
import { BudgetBadge } from './BudgetBadge';
import { RegionBadge } from './RegionBadge';
import { getProfileFitLevel } from '../lib/profileFit';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { rewritePitchWithAi, translateTextWithAi } from '../lib/api';
import { extractDirectContactHandle } from '../lib/templates';
import { parseStructuredVacancy } from '../shared/vacancyParser';
import { detectVacancyRegion } from '../shared/regions.js';
import { detectTextLanguage, needsRussianTranslation, LANG_LABELS } from '../shared/translate.js';
import { matchPortfolioDeepLink } from '../shared/portfolioMatcher.js';
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
  Languages,
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
  const autoTranslate = useSettingsStore((s) => s.autoTranslateVacancies ?? true);
  const addToast = useToastStore((s) => s.addToast);

  const [showRateCalculator, setShowRateCalculator] = useState(false);
  const [showClientBrief, setShowClientBrief] = useState(false);
  const [isExpandedText, setIsExpandedText] = useState(false);

  // Translation state
  const detectedLang = useMemo(
    () => (vacancy.detectedLang as any) || detectTextLanguage(vacancy.text),
    [vacancy.detectedLang, vacancy.text]
  );
  const shouldOfferTranslation = useMemo(
    () => needsRussianTranslation(vacancy.text),
    [vacancy.text]
  );
  const [translatedRu, setTranslatedRu] = useState<string | null>(
    vacancy.translatedText || null
  );
  const [translationProvider, setTranslationProvider] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showOriginalText, setShowOriginalText] = useState(false);

  // Synchronize prop-backed translation or run automatic free translation when enabled
  useEffect(() => {
    setTranslatedRu(vacancy.translatedText || null);
    setShowOriginalText(false);
  }, [vacancy.id, vacancy.translatedText]);

  useEffect(() => {
    if (!autoTranslate || !shouldOfferTranslation || translatedRu) return;

    let cancelled = false;
    setIsTranslating(true);
    translateTextWithAi({
      text: vacancy.text,
      targetLang: 'ru',
      sourceLang: detectedLang,
      mode: 'vacancy',
    })
      .then((res) => {
        if (!cancelled && res.translatedText) {
          setTranslatedRu(res.translatedText);
          setTranslationProvider(res.provider || 'free');
        }
      })
      .catch(() => {
        // Silent fail on background auto-translate; user can trigger manually
      })
      .finally(() => {
        if (!cancelled) setIsTranslating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [autoTranslate, shouldOfferTranslation, translatedRu, vacancy.text, detectedLang]);

  const handleManualTranslate = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (translatedRu) {
      setShowOriginalText((prev) => !prev);
      return;
    }
    setIsTranslating(true);
    try {
      const res = await translateTextWithAi({
        text: vacancy.text,
        targetLang: 'ru',
        sourceLang: detectedLang,
        mode: 'vacancy',
      });
      if (res.translatedText) {
        setTranslatedRu(res.translatedText);
        setTranslationProvider(res.provider || 'free');
        setShowOriginalText(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка перевода';
      addToast({ type: 'error', message: msg });
    } finally {
      setIsTranslating(false);
    }
  };

  // Structured info & region
  const structured = useMemo(() => parseStructuredVacancy(vacancy.text), [vacancy.text]);
  const region = useMemo(() => {
    const r = vacancy.region || detectVacancyRegion(vacancy.text, vacancy.channel);
    return r === 'RU' ? 'US' : r;
  }, [vacancy.region, vacancy.text, vacancy.channel]);

  const fit = useMemo(() => getProfileFitLevel(vacancy, profile), [vacancy, profile]);

  const diffMs = Date.now() - new Date(vacancy.postedAt).getTime();
  const isHot = !structured.isClosed && diffMs < 20 * 60 * 1000;
  const isNew = !isHot && diffMs < 2 * 60 * 60 * 1000;

  // Quick draft & handle extraction
  const directHandle = useMemo(
    () => extractDirectContactHandle(vacancy.text, vacancy.channel),
    [vacancy.text, vacancy.channel]
  );

  const [copied, setCopied] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [customDraft, setCustomDraft] = useState<string | null>(null);
  const [isDraftCollapsed, setIsDraftCollapsed] = useState(false);

  const portfolioMatch = useMemo(
    () =>
      matchPortfolioDeepLink({
        text: vacancy.text,
        channelOrNiche: vacancy.channel,
        region,
        lang: detectedLang,
        basePortfolioUrl: profile.portfolioUrl,
      }),
    [vacancy.text, vacancy.channel, region, detectedLang, profile.portfolioUrl]
  );

  const initialDraft = useMemo(() => {
    const ch = vacancy.channel.startsWith('@') ? vacancy.channel : `@${vacancy.channel}`;
    const isForeignPost = region === 'EU' || region === 'US' || (detectedLang !== 'ru' && detectedLang !== 'kk');

    if (isForeignPost) {
      const skillsPartEn = profile.skills?.length ? ` (${profile.skills.slice(0, 3).join(', ')})` : '';
      return `Hi! Saw your post in ${ch} for a video editor. I specialize in retention-focused ${profile.specialization || 'YouTube & Shorts editing'}${skillsPartEn}. Portfolio (${portfolioMatch.labelEn}): ${portfolioMatch.url}. Happy to cut a quick 30-sec sample - are you still hiring?`;
    }

    const skillsPart = profile.skills?.length ? `Работаю в ${profile.skills.slice(0, 3).join(', ')}.` : '';
    return `Привет! Увидел заказ в ${ch}. Специализируюсь на ${profile.specialization || 'динамичном видеомонтаже'}. ${skillsPart} Подборка работ (${portfolioMatch.labelRu}): ${portfolioMatch.url}. Готов сделать тестовый 30-сек фрагмент - еще актуально?`;
  }, [vacancy.channel, profile, region, detectedLang, portfolioMatch]);

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
    if (directHandle) {
      const targetUrl = `https://t.me/${directHandle}?text=${encodeURIComponent(activeDraft)}`;
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } else {
      addToast({
        type: 'info',
        message: 'Текст скопирован - откройте пост и напишите автору в комментарии или ЛС.',
      });
      window.open(vacancy.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleGenerateAiDraft = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsGeneratingAi(true);
    try {
      const res = await rewritePitchWithAi({
        text: activeDraft,
        leadContext: {
          name: directHandle ? `@${directHandle}` : vacancy.channel,
          channel: vacancy.channel,
          niche: `Telegram (${vacancy.matchedKeywords?.join(', ') || 'video editing'})`,
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
  const isReddit = vacancy.sourcePlatform === 'reddit' || vacancy.channel.startsWith('r/');
  const isUpwork = vacancy.sourcePlatform === 'upwork' || vacancy.channel === 'Upwork';
  const displaySourceLabel = isReddit || isUpwork ? vacancy.channel : `@${cleanChannel}`;
  const langLabel = LANG_LABELS[detectedLang as keyof typeof LANG_LABELS] || detectedLang?.toUpperCase();

  return (
    <div
      className={`group bg-surface hover:bg-surface-2/40 border ${
        isHot ? 'border-danger/30' : isUpwork ? 'border-emerald-500/25' : isReddit ? 'border-orange-500/25' : 'border-border'
      } rounded-card p-4 space-y-3 transition-all duration-150`}
    >
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {isReddit && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-300 bg-orange-500/15 px-1.5 py-0.2 rounded border border-orange-500/30">
              Reddit [Hiring]
            </span>
          )}
          {isUpwork && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.2 rounded border border-emerald-500/30">
              Upwork
            </span>
          )}
          <a
            href={vacancy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 truncate"
          >
            <span>{displaySourceLabel}</span>
            <ExternalLink size={11} />
          </a>
          <span className="text-border">|</span>
          <span className="text-[11px] text-muted font-mono">
            {formatRelativeTime(vacancy.postedAt)}
          </span>
          <BudgetBadge budget={vacancy.budget} />

          {/* Region Badge */}
          <RegionBadge region={region} />

          {/* Language Pill + Manual Translate Trigger */}
          {shouldOfferTranslation && (
            <button
              type="button"
              onClick={handleManualTranslate}
              disabled={isTranslating}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 px-1.5 py-0.2 rounded border border-amber-400/30 transition-colors"
              title={
                translatedRu
                  ? showOriginalText
                    ? 'Показать перевод на русский'
                    : 'Показать оригинал'
                  : 'Перевести на русский бесплатно'
              }
            >
              <Languages size={11} className={isTranslating ? 'animate-spin' : ''} />
              <span>
                {isTranslating
                  ? 'Перевод...'
                  : translatedRu
                  ? showOriginalText
                    ? `${langLabel} (Показать RU)`
                    : `${langLabel} → RU`
                  : `Перевести (${langLabel})`}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {vacancy.upworkMeta && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                vacancy.upworkMeta.roiScore >= 75
                  ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
                  : vacancy.upworkMeta.roiScore >= 55
                  ? 'text-sky-300 bg-sky-500/15 border-sky-500/30'
                  : vacancy.upworkMeta.roiScore >= 38
                  ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                  : 'text-danger bg-danger/15 border-danger/30'
              }`}
              title={vacancy.upworkMeta.verdictRu}
            >
              ROI {vacancy.upworkMeta.roiScore}/100 · {vacancy.upworkMeta.connectsRequired || 0}C
            </span>
          )}

          {isHot ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-danger bg-danger/10 px-2 py-0.5 rounded-control border border-danger/20">
              <span className="w-1.5 h-1.5 rounded-full bg-danger inline-block" />
              <span>Горячее</span>
            </span>
          ) : isNew ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-text-muted bg-surface-2 px-2 py-0.5 rounded-control border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim inline-block" />
              <span>Новое</span>
            </span>
          ) : null}

          {fit.level === 'great' ? (
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-text bg-surface-2 px-2 py-0.5 rounded-control border border-border cursor-help"
              title={fit.reason}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              <span>Подходит</span>
            </span>
          ) : fit.level === 'fair' ? (
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-text-muted bg-surface-2 px-2 py-0.5 rounded-control border border-border cursor-help"
              title={fit.reason}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim inline-block" />
              <span>Возможно</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Structured info chips */}
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

      {/* Translated or Original Text */}
      <div className="space-y-2">
        {translatedRu && !showOriginalText ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-accent font-semibold">
              <span className="flex items-center gap-1">
                <Languages size={12} />
                <span>Перевод на русский ({translationProvider || 'AI / NMT'})</span>
              </span>
              <button
                type="button"
                onClick={() => setShowOriginalText(true)}
                className="text-text-muted hover:text-text underline underline-offset-2 font-normal"
              >
                Показать оригинал ({langLabel})
              </button>
            </div>
            <div
              className={`text-xs text-text leading-relaxed whitespace-pre-wrap select-text font-sans ${
                !isExpandedText ? 'line-clamp-6' : ''
              }`}
            >
              {translatedRu}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {translatedRu && showOriginalText && (
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>Оригинал ({langLabel})</span>
                <button
                  type="button"
                  onClick={() => setShowOriginalText(false)}
                  className="text-accent hover:underline"
                >
                  Вернуть русский перевод
                </button>
              </div>
            )}
            <div
              className={`text-xs text-text leading-relaxed whitespace-pre-wrap select-text font-sans ${
                !isExpandedText ? 'line-clamp-6' : ''
              }`}
            >
              {vacancy.text}
            </div>
          </div>
        )}

        {(translatedRu || vacancy.text).length > 250 && (
          <button
            type="button"
            onClick={() => setIsExpandedText(!isExpandedText)}
            className="text-[11px] text-accent hover:underline font-medium pt-0.5"
          >
            {isExpandedText ? 'Свернуть' : 'Показать полностью'}
          </button>
        )}
      </div>

      {/* Skills and Format */}
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

      {/* Quick Pitch Draft for Hot Vacancies */}
      {isHot && (
        <div className="bg-surface-2/70 border border-danger/30 rounded-control p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-danger">
              <Flame size={14} className="animate-pulse" />
              <span>Быстрый отклик {directHandle ? `→ @${directHandle}` : ''}</span>
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
                  <span>{directHandle ? `Написать @${directHandle}` : 'Скопировать и открыть пост'}</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action Footer */}
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
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-bg bg-text hover:bg-white rounded-control transition-colors min-h-[36px]"
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
