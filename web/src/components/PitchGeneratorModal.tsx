import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from './Modal';
import { Lead, Vacancy } from '../types';
import { useTemplatesStore } from '../store/templatesStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLeadsStore } from '../store/leadsStore';
import { useToastStore } from '../store/toastStore';
import {
  substituteVariables,
  analyzePitchQuality,
  extractDirectContactHandle,
} from '../lib/templates';
import { rewritePitchWithAi, translateTextWithAi } from '../lib/api';
import { needsRussianTranslation, detectTextLanguage } from '../shared/translate.js';
import { detectVacancyRegion } from '../shared/regions.js';
import {
  PORTFOLIO_CATEGORIES,
  matchPortfolioDeepLink,
  PortfolioCategoryKey,
} from '../shared/portfolioMatcher.js';
import { analyzeUpworkPreviewHook, generateUpworkProposal } from '../shared/upwork.js';
import {
  Sparkles,
  Copy,
  Send,
  ExternalLink,
  Check,
  AlertTriangle,
  Info,
  Split,
  Languages,
  Scissors,
  Link as LinkIcon,
  Video,
} from 'lucide-react';

interface PitchGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead?: Lead | null;
  vacancy?: Vacancy | null;
  initialStrategy?: string;
  initialOpeningAngle?: string;
}

export const PitchGeneratorModal: React.FC<PitchGeneratorModalProps> = ({
  isOpen,
  onClose,
  lead,
  vacancy,
  initialStrategy,
  initialOpeningAngle,
}) => {
  const templates = useTemplatesStore((s) => s.templates);
  const profile = useSettingsStore((s) => s.profile);
  const updateLeadStatus = useLeadsStore((s) => s.updateLeadStatus);
  const addTouch = useLeadsStore((s) => s.addTouch);
  const addToast = useToastStore((s) => s.addToast);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [pitchText, setPitchText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isTranslatingEn, setIsTranslatingEn] = useState<boolean>(false);
  const [showDiffView, setShowDiffView] = useState<boolean>(false);
  const [vacancyTranslationRu, setVacancyTranslationRu] = useState<string | null>(null);
  const [portfolioCategory, setPortfolioCategory] = useState<PortfolioCategoryKey>('auto');
  const [upworkMode, setUpworkMode] = useState<boolean>(false);
  const [loomScript, setLoomScript] = useState<string>('');

  const directVacancyHandle = useMemo(
    () => (vacancy ? extractDirectContactHandle(vacancy.text, vacancy.channel) : null),
    [vacancy]
  );

  const portfolioMatch = useMemo(() => {
    const text = vacancy?.text || `${lead?.niche || ''} ${lead?.notes || ''} ${lead?.lastVideo?.title || ''}`;
    const lang = vacancy ? detectTextLanguage(vacancy.text) : lead?.region === 'KZ' ? 'ru' : 'en';
    const region = vacancy?.region || (lead?.region === 'RU' ? 'US' : lead?.region) || 'US';
    return matchPortfolioDeepLink({
      text,
      channelOrNiche: vacancy?.channel || lead?.niche || '',
      region,
      lang,
      basePortfolioUrl: profile.portfolioUrl || 'https://fleur-editor.netlify.app',
      overrideCategory: portfolioCategory,
    });
  }, [vacancy, lead, profile.portfolioUrl, portfolioCategory]);

  // Pick suitable language & strategy template
  useEffect(() => {
    if (!isOpen) return;

    let target = templates[0];
    if (vacancy) {
      const region = vacancy.region || detectVacancyRegion(vacancy.text, vacancy.channel);
      const lang = detectTextLanguage(vacancy.text);
      const isForeign = region === 'EU' || region === 'US' || (lang !== 'ru' && lang !== 'kk');
      if (isForeign) {
        target =
          templates.find((t) => t.id === 'tpl_shotgun_en') ||
          templates.find((t) => t.type === 'shotgun') ||
          target;
      } else {
        target = templates.find((t) => t.id === 'tpl_shotgun') || templates.find((t) => t.type === 'shotgun') || target;
      }
    } else if (initialStrategy) {
      target = templates.find((t) => t.type === initialStrategy) || target;
    } else if (lead?.status === 'followup') {
      target = templates.find((t) => t.type === 'followup_1') || target;
    } else {
      target = templates.find((t) => t.type === 'sniper') || target;
    }

    const effectiveLead: Partial<Lead> | null = lead
      ? lead
      : vacancy
      ? {
          name: directVacancyHandle ? `@${directVacancyHandle}` : undefined,
        }
      : null;

    if (target) {
      setSelectedTemplateId(target.id);
      const subContext = vacancy
        ? {
            text: vacancy.text,
            channel: vacancy.channel,
            region: vacancy.region || detectVacancyRegion(vacancy.text, vacancy.channel),
            lang: detectTextLanguage(vacancy.text),
            portfolioCategory: 'auto' as PortfolioCategoryKey,
          }
        : undefined;
      let subbed = substituteVariables(target.body, effectiveLead, profile, undefined, subContext);
      const angle = initialOpeningAngle || lead?.aiAngle;
      if (angle) {
        const lines = subbed.split('\n');
        subbed = `${angle}\n\n` + lines.slice(1).join('\n').trim();
      }
      setPitchText(subbed);
    }
    setPortfolioCategory('auto');
    setUpworkMode(Boolean(vacancy?.sourcePlatform === 'upwork' || lead?.sourcePlatform === 'upwork'));
    setLoomScript('');
    setCopied(false);
    setVacancyTranslationRu(vacancy?.translatedText || null);
  }, [isOpen, lead, vacancy, directVacancyHandle, initialStrategy, initialOpeningAngle, templates, profile]);

  // Translate vacancy in diff pane when needed
  useEffect(() => {
    if (!isOpen || !showDiffView || !vacancy || vacancyTranslationRu) return;
    if (!needsRussianTranslation(vacancy.text)) return;

    let cancelled = false;
    translateTextWithAi({ text: vacancy.text, targetLang: 'ru', mode: 'vacancy' })
      .then((res) => {
        if (!cancelled && res.translatedText) setVacancyTranslationRu(res.translatedText);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, showDiffView, vacancy, vacancyTranslationRu]);

  const handleInsertAngle = (angle: string) => {
    const lines = pitchText.split('\n');
    const newText = `${angle}\n\n` + lines.slice(1).join('\n').trim();
    setPitchText(newText);
    addToast({
      type: 'info',
      title: 'Первая строка заменена',
      message: 'Использована ИИ-зацепка без лести.',
    });
  };

  const handleTemplateChange = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const chosen = templates.find((t) => t.id === tplId);
    if (chosen) {
      const effectiveLead: Partial<Lead> | null = lead
        ? lead
        : vacancy && directVacancyHandle
        ? { name: `@${directVacancyHandle}` }
        : null;
      const subContext = vacancy
        ? {
            text: vacancy.text,
            channel: vacancy.channel,
            region: vacancy.region || detectVacancyRegion(vacancy.text, vacancy.channel),
            lang: detectTextLanguage(vacancy.text),
            portfolioCategory,
          }
        : { portfolioCategory };
      const subbed = substituteVariables(chosen.body, effectiveLead, profile, undefined, subContext);
      setPitchText(subbed);
    }
  };

  const handlePortfolioCategoryChange = (nextCategory: PortfolioCategoryKey) => {
    setPortfolioCategory(nextCategory);
    const text = vacancy?.text || `${lead?.niche || ''} ${lead?.notes || ''}`;
    const nextMatch = matchPortfolioDeepLink({
      text,
      channelOrNiche: vacancy?.channel || lead?.niche || '',
      region: vacancy?.region || lead?.region || 'US',
      lang: vacancy ? detectTextLanguage(vacancy.text) : 'en',
      basePortfolioUrl: profile.portfolioUrl || 'https://fleur-editor.netlify.app',
      overrideCategory: nextCategory,
    });
    const nextText = pitchText.replace(/https?:\/\/fleur-editor\.netlify\.app[^\s)]*/gi, nextMatch.url);
    if (nextText !== pitchText) {
      setPitchText(nextText);
    }
  };

  const handleOptimizeForUpwork = () => {
    setUpworkMode(true);
    const bundle = generateUpworkProposal(
      {
        title: lead?.name || (vacancy ? `Video Editor (${vacancy.channel})` : 'YouTube / Shorts Video Editing'),
        description: vacancy?.text || lead?.notes || pitchText,
      },
      { name: profile.name, portfolioUrl: profile.portfolioUrl }
    );
    setPitchText(bundle.coverLetter);
    setLoomScript(bundle.loomScript);
    addToast({
      type: 'success',
      title: 'Сжато под Upwork!',
      message: 'Главная суть и ссылка .fleur перенесены в первые 200 символов + готов 45s Loom-скрипт.',
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pitchText);
      setCopied(true);
      addToast({
        type: 'success',
        title: 'Скопировано в буфер',
        message: 'Текст сообщения скопирован. Готово для отправки.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({
        type: 'error',
        message: 'Не удалось скопировать текст в буфер.',
      });
    }
  };

  const handleOpenTelegram = async () => {
    const encoded = encodeURIComponent(pitchText);

    if (lead?.telegram) {
      const cleanUsername = lead.telegram.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:t\.me)\//, '');
      window.open(`https://t.me/${cleanUsername}?text=${encoded}`, '_blank', 'noopener,noreferrer');
      return;
    }

    if (vacancy && directVacancyHandle) {
      window.open(`https://t.me/${directVacancyHandle}?text=${encoded}`, '_blank', 'noopener,noreferrer');
      return;
    }

    // No direct user handle in vacancy: copy text and open the post URL directly
    await handleCopy();
    if (vacancy?.url) {
      addToast({
        type: 'info',
        message: 'Текст скопирован — откройте пост и отправьте отклик автору.',
      });
      window.open(vacancy.url, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://t.me/share/url?url=&text=${encoded}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleMarkAsSent = () => {
    if (lead) {
      updateLeadStatus(lead.id, 'messaged');
      addTouch(lead.id, {
        channel: lead.telegram ? 'Telegram' : lead.email ? 'Email' : 'Other',
        note: `Сообщение отправлено: "${pitchText.slice(0, 80)}..."`,
        replied: false,
      });
      addToast({
        type: 'success',
        title: 'Касание зафиксировано!',
        message: `Статус изменён на "Написал", следующее касание запланировано через 2 дня.`,
      });
    } else {
      addToast({
        type: 'info',
        message: 'Отклик отмечен',
      });
    }
    onClose();
  };

  const handleTranslateToEnglish = async () => {
    if (!pitchText.trim()) return;
    setIsTranslatingEn(true);
    try {
      const res = await translateTextWithAi({
        text: pitchText,
        targetLang: 'en',
        mode: 'pitch',
      });
      if (res.translatedText) {
        setPitchText(res.translatedText);
        addToast({
          type: 'success',
          title: 'Переведено на английский',
          message: `Провайдер: ${res.provider}`,
        });
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Ошибка перевода',
        message: err instanceof Error ? err.message : 'Не удалось перевести питч.',
      });
    } finally {
      setIsTranslatingEn(false);
    }
  };

  const handleAiImprove = async () => {
    setIsAiLoading(true);
    try {
      const res = await rewritePitchWithAi({
        text: pitchText,
        leadContext: lead
          ? {
              name: lead.name,
              channel: lead.channelUrl,
              niche: lead.niche,
            }
          : vacancy
          ? {
              name: directVacancyHandle ? `@${directVacancyHandle}` : vacancy.channel,
              channel: vacancy.channel,
              niche: vacancy.matchedKeywords?.join(', ') || 'video editing',
            }
          : undefined,
      });

      if (res.rewritten) {
        setPitchText(res.rewritten);
        addToast({
          type: 'success',
          title: 'Текст улучшен AI',
          message: 'Убрана вода и лесть, сохранены факты и вопрос.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка генерации AI';
      addToast({
        type: 'error',
        title: 'AI рерайтер недоступен',
        message:
          msg.includes('ключ') || msg.includes('KEY')
            ? 'Укажите бесплатный ключ Gemini / Groq / OpenRouter в разделе «Настройки».'
            : msg,
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const quality = analyzePitchQuality(pitchText);
  const upworkPreview = analyzeUpworkPreviewHook(pitchText);
  const canOpenTelegram = Boolean(lead?.telegram || vacancy?.url || directVacancyHandle);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div className="flex items-center gap-2">
          <Send size={18} className="text-accent" />
          <span>
            {lead
              ? `Сообщение для: ${lead.name}`
              : vacancy
              ? `Отклик на вакансию (@${vacancy.channel.replace(/^@/, '')})`
              : 'Конструктор сообщения'}
          </span>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="text-xs text-text-muted flex items-center gap-2">
            <span>Символов:</span>
            <span
              className={`font-mono font-semibold ${
                quality.isTooLong ? 'text-danger' : 'text-text'
              }`}
            >
              {quality.length} / 450
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text bg-surface-2 hover:bg-surface-3 rounded-control border border-border transition-colors"
            >
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
            </button>

            {canOpenTelegram && (
              <button
                onClick={handleOpenTelegram}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-info bg-info-soft hover:bg-info/20 rounded-control border border-info/20 transition-colors"
              >
                <ExternalLink size={14} />
                <span>
                  {directVacancyHandle
                    ? `Написать @${directVacancyHandle}`
                    : lead?.telegram
                    ? 'Открыть в Telegram'
                    : 'Открыть пост'}
                </span>
              </button>
            )}

            <button
              onClick={handleMarkAsSent}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control transition-colors"
            >
              <Check size={14} />
              <span>Отметить как отправлено</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Template Selector */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            Стратегия сообщения
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleTemplateChange(tpl.id)}
                className={`px-3 py-2 text-left rounded-control text-xs font-medium border transition-all ${
                  selectedTemplateId === tpl.id
                    ? 'bg-accent-soft text-accent border-accent/40'
                    : 'bg-surface-2/60 text-text-muted border-border hover:bg-surface-2 hover:text-text'
                }`}
              >
                <div className="font-semibold truncate">{tpl.title}</div>
                <div className="text-[10px] text-muted truncate mt-0.5 capitalize">
                  {tpl.type.replace('_', ' ')}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Smart Portfolio Deep-Link + Upwork Hook Toggle */}
        <div className="p-2.5 bg-surface-2/60 rounded-control border border-border flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <LinkIcon size={13} className="text-accent shrink-0" />
            <select
              value={portfolioCategory}
              onChange={(e) => handlePortfolioCategoryChange(e.target.value as PortfolioCategoryKey)}
              className="bg-surface text-text text-xs rounded border border-border px-2 py-1 focus:outline-none focus:border-accent"
              aria-label="Раздел портфолио"
            >
              {PORTFOLIO_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.labelRu}
                </option>
              ))}
            </select>
            <a
              href={portfolioMatch.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-accent hover:underline truncate"
              title={portfolioMatch.url}
            >
              {portfolioMatch.url}
            </a>
          </div>

          <button
            type="button"
            onClick={handleOptimizeForUpwork}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
              upworkMode
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                : 'bg-surface hover:bg-surface-3 text-text-muted border-border'
            }`}
          >
            <Scissors size={11} />
            <span>Под Upwork (200 симв.)</span>
          </button>
        </div>

        {/* Telegram / Upwork Preview Line */}
        <div className="p-3 bg-surface-2/80 rounded-control border border-border">
          <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
            <span className="font-medium">
              {upworkMode
                ? '✂️ Превью клиента на Upwork (первые 200 символов до «More»):'
                : 'Превью в списке чатов Telegram (первые ~60 символов):'}
            </span>
            {upworkMode ? (
              <span
                className={`text-[10px] font-mono font-semibold ${
                  upworkPreview.previewScore >= 80 ? 'text-emerald-400' : 'text-warning'
                }`}
              >
                Hook Score: {upworkPreview.previewScore}/100
              </span>
            ) : (
              quality.genericPreview && (
                <span className="flex items-center gap-1 text-warning text-[10px] font-medium">
                  <AlertTriangle size={12} /> Банальное начало
                </span>
              )
            )}
          </div>
          <div className="font-mono text-xs text-text bg-surface px-2.5 py-1.5 rounded border border-border/80 whitespace-pre-wrap break-words">
            {upworkMode ? upworkPreview.first200Chars || '...' : quality.previewLine || '...'}
          </div>
          {upworkMode && upworkPreview.warnings.length > 0 && (
            <p className="text-[11px] text-warning mt-1.5">
              ⚠️ {upworkPreview.warnings[0]}
            </p>
          )}
        </div>

        {upworkMode && loomScript && (
          <div className="p-2.5 bg-sky-500/10 rounded-control border border-sky-400/25 text-xs space-y-1">
            <div className="flex items-center justify-between font-semibold text-sky-300">
              <span className="flex items-center gap-1">
                <Video size={12} />
                <span>45-сек Loom скрипт (EN)</span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(loomScript);
                  addToast({ type: 'success', message: 'Loom-скрипт скопирован' });
                }}
                className="text-[11px] text-accent hover:underline font-normal"
              >
                Копировать
              </button>
            </div>
            <pre className="text-[11px] text-text-muted whitespace-pre-wrap font-sans leading-relaxed">
              {loomScript}
            </pre>
          </div>
        )}

        {/* AI Opening Angle Suggestion */}
        {lead?.aiAngle && (
          <div className="p-2.5 bg-accent-soft/20 rounded-control border border-accent/25 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-semibold text-accent block">
                ИИ-зацепка:
              </span>
              <span className="text-text truncate block italic text-[11px]">
                "{lead.aiAngle}"
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleInsertAngle(lead.aiAngle!)}
              className="px-2.5 py-1 bg-accent text-white rounded text-[11px] font-semibold hover:bg-accent-hover transition-colors shrink-0 flex items-center gap-1"
            >
              <Sparkles size={11} />
              <span>Вставить в начало</span>
            </button>
          </div>
        )}

        {/* Message Editor */}
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="text-xs font-medium text-text-muted">
              Текст сообщения
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {vacancy && (
                <button
                  type="button"
                  onClick={() => setShowDiffView(!showDiffView)}
                  className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline px-2 py-0.5 rounded bg-accent/10 border border-accent/20 transition-colors"
                >
                  <Split size={12} />
                  <span>{showDiffView ? 'Скрыть оригинал' : 'Сравнить с вакансией'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleTranslateToEnglish}
                disabled={isTranslatingEn}
                className="flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:underline px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 transition-colors disabled:opacity-50"
                title="Перевести черновик на естественный английский"
              >
                <Languages size={12} className={isTranslatingEn ? 'animate-spin' : ''} />
                <span>{isTranslatingEn ? 'Перевожу...' : 'Перевести на EN'}</span>
              </button>
              <button
                type="button"
                onClick={handleAiImprove}
                disabled={isAiLoading}
                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
              >
                <Sparkles size={12} className={isAiLoading ? 'animate-spin' : ''} />
                <span>{isAiLoading ? 'Оптимизирую...' : 'Улучшить с помощью ИИ'}</span>
              </button>
            </div>
          </div>

          {showDiffView && vacancy ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
              <div className="p-3 bg-surface rounded-control border border-border text-xs space-y-2 max-h-56 overflow-y-auto">
                <span className="text-[10px] font-bold text-muted uppercase block">
                  Требования вакансии (@{vacancy.channel.replace(/^@/, '')}):
                </span>
                {vacancyTranslationRu && (
                  <div className="p-2 rounded bg-accent/10 border border-accent/20 text-text leading-relaxed whitespace-pre-wrap font-sans">
                    <span className="text-[10px] font-bold text-accent block mb-1">
                      🌐 Перевод (RU):
                    </span>
                    {vacancyTranslationRu}
                  </div>
                )}
                <p className="text-text-muted leading-relaxed whitespace-pre-wrap font-sans">
                  {vacancy.text}
                </p>
              </div>
              <div>
                <textarea
                  value={pitchText}
                  onChange={(e) => setPitchText(e.target.value)}
                  rows={8}
                  className="w-full bg-surface-2 text-text text-sm rounded-control border border-border p-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors leading-relaxed font-sans resize-y"
                  placeholder="Введите текст сообщения..."
                />
              </div>
            </div>
          ) : (
            <textarea
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
              rows={5}
              className="w-full bg-surface-2 text-text text-sm rounded-control border border-border p-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors leading-relaxed font-sans resize-y"
              placeholder="Введите текст сообщения..."
            />
          )}
        </div>

        {/* Quality Diagnostics Warnings */}
        <div className="space-y-1.5">
          {quality.isTooLong && (
            <div className="flex items-center gap-2 text-xs text-danger bg-danger-soft/60 px-3 py-1.5 rounded-control border border-danger/20">
              <AlertTriangle size={14} className="shrink-0" />
              <span>
                Слишком длинное сообщение ({quality.length} символов). Идеально до 450.
              </span>
            </div>
          )}
          {quality.missingSpecifics && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning-soft/60 px-3 py-1.5 rounded-control border border-warning/20">
              <Info size={14} className="shrink-0" />
              <span>
                Нет конкретики: добавьте таймкод или точную деталь ролика.
              </span>
            </div>
          )}
          {quality.missingQuestion && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning-soft/60 px-3 py-1.5 rounded-control border border-warning/20">
              <Info size={14} className="shrink-0" />
              <span>
                В конце нет вопроса: клиенту легче ответить, когда есть вопрос с нулевым трением.
              </span>
            </div>
          )}
          {quality.hasBannedPhrases && (
            <div className="flex items-center gap-2 text-xs text-danger bg-danger-soft/60 px-3 py-1.5 rounded-control border border-danger/20">
              <AlertTriangle size={14} className="shrink-0" />
              <span>
                Обнаружено клише («услуги монтажа» / «editing services»). Замените на конкретную пользу или ре-эдит.
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
