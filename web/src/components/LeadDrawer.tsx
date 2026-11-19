import React, { useState } from 'react';
import { Lead, LeadStatus, LeadTier } from '../types';
import { useLeadsStore } from '../store/leadsStore';
import { useToastStore } from '../store/toastStore';
import { ScoreBar } from './ScoreBar';
import { formatDate, formatDateTime } from '../lib/time';
import { scoreLeadsWithAi } from '../lib/api';
import {
  X,
  ExternalLink,
  Mail,
  Send,
  Calendar,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Copy,
  Archive,
  RotateCw,
} from 'lucide-react';

interface LeadDrawerProps {
  leadId: string | null;
  onClose: () => void;
  onOpenPitchGenerator: (lead: Lead, initialOpeningAngle?: string) => void;
}

export const LeadDrawer: React.FC<LeadDrawerProps> = ({
  leadId,
  onClose,
  onOpenPitchGenerator,
}) => {
  const lead = useLeadsStore((s) => s.leads.find((l) => l.id === leadId));
  const updateLead = useLeadsStore((s) => s.updateLead);
  const updateLeadStatus = useLeadsStore((s) => s.updateLeadStatus);
  const addFinding = useLeadsStore((s) => s.addFinding);
  const removeFinding = useLeadsStore((s) => s.removeFinding);
  const addTouch = useLeadsStore((s) => s.addTouch);
  const scheduleNextTouch = useLeadsStore((s) => s.scheduleNextTouch);
  const deleteLead = useLeadsStore((s) => s.deleteLead);
  const updateLeadAiScore = useLeadsStore((s) => s.updateLeadAiScore);
  const getAiExamples = useLeadsStore((s) => s.getAiExamples);
  const addToast = useToastStore((s) => s.addToast);

  const [newTimecode, setNewTimecode] = useState('');
  const [newFindingNote, setNewFindingNote] = useState('');
  const [isAiEvaluating, setIsAiEvaluating] = useState(false);

  const [newTouchNote, setNewTouchNote] = useState('');
  const [newTouchChannel, setNewTouchChannel] = useState<'Telegram' | 'Instagram' | 'Email' | 'Other'>('Telegram');
  const [isAddingTouch, setIsAddingTouch] = useState(false);

  if (!lead) return null;

  const handleAddFinding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTimecode.trim() || !newFindingNote.trim()) return;
    addFinding(lead.id, newTimecode.trim(), newFindingNote.trim());
    setNewTimecode('');
    setNewFindingNote('');
    addToast({
      type: 'success',
      message: 'Зацепка добавлена и готова для вставки в сообщение.',
    });
  };

  const handleAddTouchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTouchNote.trim()) return;
    addTouch(lead.id, {
      channel: newTouchChannel,
      note: newTouchNote.trim(),
      replied: false,
    });
    setNewTouchNote('');
    setIsAddingTouch(false);
    addToast({
      type: 'success',
      message: 'Касание сохранено в историю.',
    });
  };

  const handleReevaluateWithAi = async () => {
    setIsAiEvaluating(true);
    try {
      const res = await scoreLeadsWithAi({
        leads: [
          {
            channelId: lead.channelId || lead.id,
            title: lead.name,
            description: lead.notes || '',
            subscribers: lead.subscribers,
            uploadsPerMonth: 2,
            lastVideos: lead.lastVideo
              ? [{ title: lead.lastVideo.title, description: '', publishedAt: lead.lastVideo.publishedAt }]
              : [],
            links: [lead.website, lead.telegram, lead.instagram].filter(Boolean) as string[],
            hasProductKeywords: lead.hasProduct,
          },
        ],
        examples: getAiExamples(),
      });

      if (res.scores && res.scores.length > 0) {
        const sc = res.scores[0];
        updateLeadAiScore(lead.id, {
          fit_score: sc.fit_score,
          reason: sc.reason,
          opening_angle: sc.opening_angle,
          pain_hypotheses: sc.pain_hypotheses,
          is_business: sc.is_business,
          monetization: sc.monetization,
          awareness: sc.awareness,
          cacheKey: `${lead.channelId || lead.id}_${lead.lastVideo?.url || 'last'}`,
        });
        addToast({
          type: 'success',
          title: 'ИИ-оценка обновлена',
          message: `Итоговый скор: ${sc.fit_score}/100. Причина: ${sc.reason}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка ИИ';
      addToast({ type: 'error', title: 'Ошибка оценки', message: msg });
    } finally {
      setIsAiEvaluating(false);
    }
  };

  const handleCopyEmail = () => {
    if (lead.email) {
      navigator.clipboard.writeText(lead.email);
      addToast({ type: 'success', message: 'Email скопирован в буфер' });
    }
  };

  const handleOpenTg = () => {
    if (lead.telegram) {
      const clean = lead.telegram.replace(/^@/, '');
      window.open(`https://t.me/${clean}`, '_blank', 'noopener,noreferrer');
    }
  };

  const statuses: { value: LeadStatus; label: string }[] = [
    { value: 'new', label: 'Новый' },
    { value: 'messaged', label: 'Написал' },
    { value: 'replied', label: 'Ответил' },
    { value: 'followup', label: 'Напоминание (повторно)' },
    { value: 'call', label: 'Созвон/Пробный' },
    { value: 'closed', label: 'Закрыт' },
    { value: 'rejected', label: 'Отказ' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-xl bg-surface border-l border-border h-full flex flex-col z-50 shadow-dropdown overflow-hidden animate-fade-in-scale">
        {/* Header */}
        <div className="p-5 border-b border-border bg-surface-2/40 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {lead.avatar ? (
              <img
                src={lead.avatar}
                alt={lead.name}
                className="w-12 h-12 rounded-full border border-border object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-accent shrink-0">
                {lead.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-text truncate">
                {lead.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <a
                  href={lead.channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline flex items-center gap-1 truncate"
                >
                  <span>Канал на YouTube</span>
                  <ExternalLink size={11} />
                </a>
                <span className="text-border">|</span>
                <span className="text-xs text-text-muted font-mono">
                  {lead.hiddenSubscribers
                    ? 'Скрыто'
                    : `${lead.subscribers.toLocaleString('ru-RU')} сабов`}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-muted hover:text-text p-1.5 rounded-md hover:bg-surface-2 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs text-text-muted">
          {/* Status & Tier Quick Bar */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2/60 rounded-card border border-border">
            <div>
              <label className="block text-[11px] text-muted mb-1 font-medium">
                Статус воронки
              </label>
              <select
                value={lead.status}
                onChange={(e) => updateLeadStatus(lead.id, e.target.value as LeadStatus)}
                className="w-full bg-surface border border-border text-text text-xs rounded-control px-2.5 py-1.5 focus:outline-none focus:border-accent"
              >
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-muted mb-1 font-medium">
                Категория клиента
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => updateLead(lead.id, { tier: t as LeadTier })}
                    className={`flex-1 py-1.5 rounded-control text-xs font-mono font-semibold border transition-all ${
                      lead.tier === t
                        ? 'border-accent bg-accent-soft text-text'
                        : 'border-border bg-surface text-muted hover:bg-surface-2'
                    }`}
                  >
                    T{t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-2/40 p-2.5 rounded-card border border-border">
              <span className="text-[10px] text-muted block">Рейтинг клиента</span>
              <div className="mt-1">
                <ScoreBar score={lead.score} />
              </div>
            </div>
            <div className="bg-surface-2/40 p-2.5 rounded-card border border-border">
              <span className="text-[10px] text-muted block">Сумма сделки</span>
              <div className="flex items-center gap-1 mt-1 font-mono font-bold text-text text-sm">
                <span>{lead.dealValue}</span>
                <span className="text-xs text-accent">{lead.currency}</span>
              </div>
            </div>
            <div className="bg-surface-2/40 p-2.5 rounded-card border border-border">
              <span className="text-[10px] text-muted block">Продукт / Оффер</span>
              <span
                className={`font-semibold text-xs mt-1 block ${
                  lead.hasProduct ? 'text-success' : 'text-muted'
                }`}
              >
                {lead.hasProduct ? 'Есть продукт' : 'Нет продукта'}
              </span>
            </div>
          </div>

          {/* AI Qualification Block */}
          <div className="p-3.5 bg-surface-2/50 rounded-card border border-accent/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                <Sparkles size={14} className="text-accent" />
                <span>ИИ-квалификация клиента</span>
              </div>
              <div className="flex items-center gap-2">
                {lead.aiScore !== undefined ? (
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-accent text-white shadow-subtle">
                    Fit: {lead.aiScore}/100
                  </span>
                ) : (
                  <span className="text-[10px] text-muted font-mono">Не оценён</span>
                )}
                <button
                  type="button"
                  onClick={handleReevaluateWithAi}
                  disabled={isAiEvaluating}
                  className="flex items-center gap-1 px-2 py-1 bg-surface hover:bg-surface-3 text-text rounded-control border border-border text-[11px] font-medium transition-colors disabled:opacity-50"
                  title="Запустить повторный анализ через ИИ"
                >
                  <RotateCw size={11} className={isAiEvaluating ? 'animate-spin text-accent' : ''} />
                  <span>{isAiEvaluating ? 'Оцениваю...' : lead.aiScore !== undefined ? 'Переоценить' : 'Оценить'}</span>
                </button>
              </div>
            </div>

            {lead.aiScore !== undefined ? (
              <div className="space-y-2.5 text-xs">
                {/* Meta tags */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  {lead.aiMonetization && (
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-text font-medium">
                      Монетизация: {lead.aiMonetization === 'product' ? 'Свой продукт' : lead.aiMonetization === 'ads_only' ? 'Только реклама' : 'Не очевидно'}
                    </span>
                  )}
                  {lead.aiAwareness && (
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-muted">
                      Осознанность: {lead.aiAwareness}
                    </span>
                  )}
                  {lead.aiIsBusiness && (
                    <span className="px-2 py-0.5 rounded bg-success-soft text-success border border-success/30 font-medium">
                      Бизнес-автор
                    </span>
                  )}
                </div>

                {/* Reason */}
                {lead.aiReason && (
                  <div className="bg-surface/80 p-2.5 rounded-control border border-border/80">
                    <span className="text-[10px] uppercase font-semibold text-muted block mb-0.5">
                      Почему подходит:
                    </span>
                    <p className="text-text text-xs leading-relaxed">{lead.aiReason}</p>
                  </div>
                )}

                {/* Pain Hypotheses */}
                {lead.aiPainHypotheses && lead.aiPainHypotheses.length > 0 && (
                  <div className="bg-surface/80 p-2.5 rounded-control border border-border/80 space-y-1.5">
                    <span className="text-[10px] uppercase font-semibold text-muted block">
                      Гипотезы болей клиента (до 3):
                    </span>
                    <ul className="space-y-1">
                      {lead.aiPainHypotheses.map((pain, pIdx) => (
                        <li key={pIdx} className="flex items-start gap-1.5 text-text-muted text-[11px] leading-relaxed">
                          <span className="text-accent shrink-0 font-bold">•</span>
                          <span>{pain}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Opening Angle */}
                {lead.aiAngle && (
                  <div className="bg-accent-soft/30 p-2.5 rounded-control border border-accent/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold text-accent block">
                        Идея первой фразы (зацепка):
                      </span>
                    </div>
                    <p className="text-text font-medium text-xs italic bg-surface/90 p-2 rounded border border-border">
                      "{lead.aiAngle}"
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenPitchGenerator(lead, lead.aiAngle)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-accent hover:bg-accent-hover text-white rounded-control font-semibold text-xs transition-colors shadow-subtle"
                    >
                      <Sparkles size={12} />
                      <span>Вставить первой строкой в сообщение</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted italic">
                Лид ещё не оценён нейросетью. Нажмите кнопку "Оценить", чтобы выявить боли автора и получить зацепку для первого сообщения.
              </p>
            )}
          </div>

          {/* Contacts */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-text uppercase tracking-wider flex items-center justify-between">
              <span>Контакты</span>
              {lead.source && (
                <span className="text-[10px] font-normal text-muted lowercase">
                  источник: {lead.source}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between p-2.5 bg-surface-2/50 rounded-control border border-border">
                <span className="flex items-center gap-1.5 text-text">
                  <Send size={13} className="text-accent" />
                  <span className="truncate">{lead.telegram || '—'}</span>
                </span>
                {lead.telegram && (
                  <button
                    onClick={handleOpenTg}
                    className="text-xs text-accent hover:underline shrink-0 ml-1"
                  >
                    Открыть
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 bg-surface-2/50 rounded-control border border-border">
                <span className="flex items-center gap-1.5 text-text">
                  <Mail size={13} className="text-info" />
                  <span className="truncate">{lead.email || '—'}</span>
                </span>
                {lead.email && (
                  <button
                    onClick={handleCopyEmail}
                    className="text-muted hover:text-text p-1 shrink-0 ml-1"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Last Video */}
          {lead.lastVideo && (
            <div className="p-3 bg-surface-2/50 rounded-card border border-border space-y-1">
              <span className="text-[10px] uppercase font-semibold text-text-muted">
                Последний ролик
              </span>
              <a
                href={lead.lastVideo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-text hover:text-accent flex items-center gap-1 transition-colors"
              >
                <span className="line-clamp-1">{lead.lastVideo.title}</span>
                <ExternalLink size={12} className="shrink-0" />
              </a>
              <span className="text-[11px] text-muted font-mono block">
                Опубликован: {formatDate(lead.lastVideo.publishedAt)}
              </span>
            </div>
          )}

          {/* POWER DETAIL BLOCK: Зацепки по ролику */}
          <div className="space-y-3 p-3.5 bg-surface-2/30 rounded-card border border-accent/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                <Sparkles size={14} className="text-accent" />
                <span>Зацепки по ролику (для точечного сообщения)</span>
              </div>
              <span className="text-[10px] text-muted">
                Подставляются в {'{таймкод}'} и {'{проблема}'}
              </span>
            </div>

            {/* List of findings */}
            <div className="space-y-1.5">
              {lead.findings.length === 0 ? (
                <div className="text-[11px] text-muted italic py-1">
                  Нет добавленных находок. Посмотрите первые 2 минуты ролика и найдите слабое место.
                </div>
              ) : (
                lead.findings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 p-2 bg-surface rounded-control border border-border"
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-mono text-accent font-semibold text-xs shrink-0 bg-accent-soft px-1.5 py-0.5 rounded">
                        {f.timecode}
                      </span>
                      <span className="text-text truncate text-xs">{f.note}</span>
                    </div>
                    <button
                      onClick={() => removeFinding(lead.id, f.id)}
                      className="text-muted hover:text-danger p-1 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Form to add finding */}
            <form onSubmit={handleAddFinding} className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="01:25"
                value={newTimecode}
                onChange={(e) => setNewTimecode(e.target.value)}
                className="w-20 bg-surface text-text text-xs rounded-control border border-border px-2 py-1.5 font-mono focus:outline-none focus:border-accent"
              />
              <input
                type="text"
                placeholder="Описание проблемы (например: затянутое интро 40 сек)"
                value={newFindingNote}
                onChange={(e) => setNewFindingNote(e.target.value)}
                className="flex-1 bg-surface text-text text-xs rounded-control border border-border px-2.5 py-1.5 focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-accent-soft text-accent hover:bg-accent/20 rounded-control border border-accent/20 font-medium text-xs transition-colors shrink-0"
              >
                + Находка
              </button>
            </form>
          </div>

          {/* Follow-up / Next Touch Scheduler */}
          <div className="p-3 bg-surface-2/40 rounded-card border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                <Calendar size={13} className="text-accent" />
                <span>Следующее касание</span>
              </span>
              <span className="font-mono text-xs font-semibold text-text">
                {lead.nextTouchAt ? formatDate(lead.nextTouchAt) : 'Не запланировано'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-muted">Перенести:</span>
              <button
                onClick={() => scheduleNextTouch(lead.id, 2)}
                className="px-2 py-1 bg-surface text-text-muted hover:text-text rounded border border-border text-[11px] font-mono transition-colors"
              >
                +2 дня
              </button>
              <button
                onClick={() => scheduleNextTouch(lead.id, 5)}
                className="px-2 py-1 bg-surface text-text-muted hover:text-text rounded border border-border text-[11px] font-mono transition-colors"
              >
                +5 дней
              </button>
              <button
                onClick={() => scheduleNextTouch(lead.id, 7)}
                className="px-2 py-1 bg-surface text-text-muted hover:text-text rounded border border-border text-[11px] font-mono transition-colors"
              >
                +1 неделя
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text flex items-center gap-1.5">
              <span>Заметки по клиенту</span>
            </label>
            <textarea
              rows={3}
              value={lead.notes}
              onChange={(e) => updateLead(lead.id, { notes: e.target.value })}
              placeholder="Добавьте контекст: что любит, какой темп, бюджет, пожелания..."
              className="w-full bg-surface-2 text-text text-xs rounded-control border border-border p-2.5 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Touch History Timeline */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                <Clock size={13} className="text-muted" />
                <span>История касаний ({lead.touches.length})</span>
              </span>
              <button
                onClick={() => setIsAddingTouch(!isAddingTouch)}
                className="text-[11px] text-accent hover:underline flex items-center gap-1"
              >
                <Plus size={12} />
                <span>Зафиксировать касание</span>
              </button>
            </div>

            {isAddingTouch && (
              <form onSubmit={handleAddTouchSubmit} className="p-3 bg-surface rounded-card border border-border space-y-2">
                <div className="flex gap-2">
                  <select
                    value={newTouchChannel}
                    onChange={(e) => setNewTouchChannel(e.target.value as 'Telegram' | 'Instagram' | 'Email' | 'Other')}
                    className="bg-surface-2 border border-border text-text text-xs rounded px-2 py-1"
                  >
                    <option value="Telegram">Telegram</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Email">Email</option>
                    <option value="Other">Другое</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Что отправили / о чем говорили..."
                    value={newTouchNote}
                    onChange={(e) => setNewTouchNote(e.target.value)}
                    className="flex-1 bg-surface-2 border border-border text-text text-xs rounded px-2.5 py-1"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingTouch(false)}
                    className="px-2.5 py-1 text-xs text-muted hover:text-text"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-accent text-white text-xs font-semibold rounded"
                  >
                    Сохранить
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {lead.touches.length === 0 ? (
                <div className="text-[11px] text-muted italic">Касаний пока не было.</div>
              ) : (
                lead.touches.map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 bg-surface-2/40 rounded-control border border-border text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span className="font-semibold text-accent">{t.channel}</span>
                      <span className="font-mono">{formatDateTime(t.at)}</span>
                    </div>
                    <div className="text-text">{t.note}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-2/80 border-t border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => deleteLead(lead.id)}
              title="Удалить лида"
              className="text-muted hover:text-danger p-2 rounded-control hover:bg-surface transition-colors"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => updateLeadStatus(lead.id, 'rejected')}
              title="Перенести в Отказ / Архив"
              className="text-muted hover:text-text p-2 rounded-control hover:bg-surface transition-colors"
            >
              <Archive size={16} />
            </button>
          </div>

          <button
            onClick={() => onOpenPitchGenerator(lead)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control shadow-subtle transition-colors"
          >
            <Sparkles size={14} />
            <span>Сгенерировать сообщение</span>
          </button>
        </div>
      </div>
    </div>
  );
};
