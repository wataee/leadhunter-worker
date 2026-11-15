import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Lead, Vacancy } from '../types';
import { useTemplatesStore } from '../store/templatesStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLeadsStore } from '../store/leadsStore';
import { useToastStore } from '../store/toastStore';
import {
  substituteVariables,
  analyzePitchQuality,
} from '../lib/templates';
import { rewritePitchWithAi } from '../lib/api';
import {
  Sparkles,
  Copy,
  Send,
  ExternalLink,
  Check,
  AlertTriangle,
  Info,
  Split,
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
  const [showDiffView, setShowDiffView] = useState<boolean>(false);

  // Pick suitable template
  useEffect(() => {
    if (!isOpen) return;

    let target = templates[0];
    if (vacancy) {
      target = templates.find((t) => t.type === 'shotgun') || target;
    } else if (initialStrategy) {
      target = templates.find((t) => t.type === initialStrategy) || target;
    } else if (lead?.status === 'followup') {
      target = templates.find((t) => t.type === 'followup_1') || target;
    } else {
      target = templates.find((t) => t.type === 'sniper') || target;
    }

    if (target) {
      setSelectedTemplateId(target.id);
      let subbed = substituteVariables(target.body, lead || null, profile);
      const angle = initialOpeningAngle || lead?.aiAngle;
      if (angle) {
        const lines = subbed.split('\n');
        // Replace generic greeting with the AI opening angle
        subbed = `${angle}\n\n` + lines.slice(1).join('\n').trim();
      }
      setPitchText(subbed);
    }
    setCopied(false);
  }, [isOpen, lead, vacancy, initialStrategy, initialOpeningAngle, templates, profile]);

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
      const subbed = substituteVariables(chosen.body, lead || null, profile);
      setPitchText(subbed);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pitchText);
      setCopied(true);
      addToast({
        type: 'success',
        title: 'Скопировано в буфер',
        message: 'Текст сообщения скопирован. Готово для отправки вручную.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({
        type: 'error',
        message: 'Не удалось скопировать текст в буфер.',
      });
    }
  };

  const handleOpenTelegram = () => {
    const rawTg = lead?.telegram || (vacancy ? vacancy.channel : '');
    const cleanUsername = rawTg.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:t\.me)\//, '');

    const encoded = encodeURIComponent(pitchText);
    const tgUrl = cleanUsername
      ? `https://t.me/${cleanUsername}?text=${encoded}`
      : `https://t.me/share/url?url=&text=${encoded}`;

    window.open(tgUrl, '_blank', 'noopener,noreferrer');
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
        message: 'Отклик отправлен',
      });
    }
    onClose();
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
        message: msg.includes('ANTHROPIC_API_KEY')
          ? 'Для работы рерайтера укажите ANTHROPIC_API_KEY в переменных Netlify.'
          : msg,
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const quality = analyzePitchQuality(pitchText);
  const targetUsername = lead?.telegram || (vacancy ? `@${vacancy.channel}` : null);

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
              ? `Отклик на вакансию (@${vacancy.channel})`
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

            {targetUsername && (
              <button
                onClick={handleOpenTelegram}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-info bg-info-soft hover:bg-info/20 rounded-control border border-info/20 transition-colors"
              >
                <ExternalLink size={14} />
                <span>Открыть в Telegram</span>
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

        {/* Telegram Chat Preview Line */}
        <div className="p-3 bg-surface-2/80 rounded-control border border-border">
          <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
            <span className="font-medium">
              Превью в списке чатов Telegram (первые ~60 символов):
            </span>
            {quality.genericPreview && (
              <span className="flex items-center gap-1 text-warning text-[10px] font-medium">
                <AlertTriangle size={12} /> Банальное начало
              </span>
            )}
          </div>
          <div className="font-mono text-xs text-text bg-surface px-2.5 py-1.5 rounded border border-border/80 truncate">
            {quality.previewLine || '...'}
          </div>
        </div>

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
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-muted">
              Текст сообщения
            </label>
            <div className="flex items-center gap-2">
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
              <div className="p-3 bg-surface rounded-control border border-border text-xs space-y-1.5 max-h-48 overflow-y-auto">
                <span className="text-[10px] font-bold text-muted uppercase block">
                  Требования вакансии (@{vacancy.channel}):
                </span>
                <p className="text-text-muted leading-relaxed whitespace-pre-wrap font-sans">
                  {vacancy.text}
                </p>
              </div>
              <div>
                <textarea
                  value={pitchText}
                  onChange={(e) => setPitchText(e.target.value)}
                  rows={7}
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
                Обнаружено клише "услуги монтажа". Замените на конкретную пользу или ре-эдит.
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
