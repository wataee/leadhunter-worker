import React, { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { useLeadsStore } from '../store/leadsStore';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { ingestUpworkJob } from '../lib/api';
import { syncCrmWithCloud } from '../lib/cloudSync';
import {
  parseUpworkPastedText,
  calculateConnectsRoi,
  generateUpworkProposal,
} from '../shared/upwork.js';
import {
  Zap,
  ShieldAlert,
  ShieldCheck,
  Copy,
  Check,
  UserPlus,
  Video,
  Languages,
  Scissors,
  Sparkles,
} from 'lucide-react';

interface UpworkCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_UPWORK_JOB = `YouTube Long-Form Documentary & Tech Video Editor Needed
https://www.upwork.com/jobs/~01demo12345
We are looking for a skilled Premiere Pro & After Effects editor for weekly 15-minute AI/Tech deep-dive episodes.
Payment method verified | 68% hire rate | $14K total spent | $28.50 /hr avg hourly rate paid
Send a proposal for: 16 Connects
Proposals: 5 to 10
You will be asked to answer the following questions:
1. Share links to 2 similar YouTube documentary or tech edits you edited.
2. What is your turnaround time for a 15-minute video?`;

export const UpworkCopilotModal: React.FC<UpworkCopilotModalProps> = ({
  isOpen,
  onClose,
}) => {
  const profile = useSettingsStore((s) => s.profile);
  const addLead = useLeadsStore((s) => s.addLead);
  const mergeNewVacancies = useVacanciesStore((s) => s.mergeNewVacancies);
  const addToast = useToastStore((s) => s.addToast);

  const [rawText, setRawText] = useState('');
  const [connectsOverride, setConnectsOverride] = useState<string>('');
  const [isAnalyzingServer, setIsAnalyzingServer] = useState(false);
  const [translatedRu, setTranslatedRu] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const parsedJob = useMemo(() => {
    const base = parseUpworkPastedText(rawText);
    const numConnects = parseInt(connectsOverride, 10);
    if (!Number.isNaN(numConnects) && numConnects > 0) {
      base.connectsRequired = numConnects;
    }
    return base;
  }, [rawText, connectsOverride]);

  const roi = useMemo(() => calculateConnectsRoi(parsedJob), [parsedJob]);
  const proposal = useMemo(
    () => generateUpworkProposal(parsedJob, { name: profile.name, portfolioUrl: profile.portfolioUrl }),
    [parsedJob, profile.name, profile.portfolioUrl]
  );

  const hasContent = rawText.trim().length >= 15;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      addToast({ type: 'success', message: 'Скопировано в буфер' });
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      addToast({ type: 'error', message: 'Не удалось скопировать' });
    }
  };

  const handleAnalyzeAndSave = async () => {
    if (!hasContent) return;
    setIsAnalyzingServer(true);
    try {
      const res = await ingestUpworkJob({
        ...parsedJob,
        profile: { name: profile.name, portfolioUrl: profile.portfolioUrl },
        saveToFeed: true,
      });

      if (res?.translatedRu) {
        setTranslatedRu(res.translatedRu);
      }
      if (res?.vacancy) {
        mergeNewVacancies([res.vacancy]);
      }

      addToast({
        type: 'success',
        message: 'Заказ проанализирован, переведён на RU и добавлен в ленту!',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Локальный расчёт готов, но серверный перевод не удался.',
      });
    } finally {
      setIsAnalyzingServer(false);
    }
  };

  const handleAddToPipeline = async () => {
    if (!hasContent) return;
    addLead({
      name: `Upwork: ${(parsedJob.title || 'Video Editor').slice(0, 48)}`,
      channelUrl: parsedJob.url || `https://www.upwork.com/nx/find-work/#${Date.now()}`,
      notes: `${translatedRu ? `${translatedRu}\n\n---\n` : ''}${rawText.slice(0, 1200)}`,
      niche: 'Upwork Video Editing',
      source: 'Upwork',
      sourcePlatform: 'upwork',
      region: 'US',
      score: roi.roiScore,
      tier: roi.roiScore >= 75 ? 1 : roi.roiScore >= 50 ? 2 : 3,
      connectsSpent: roi.connectsRequired || 0,
      upworkMeta: {
        roiScore: roi.roiScore,
        recommendation: roi.recommendation,
        connectsRequired: roi.connectsRequired,
        clientHireRate: parsedJob.clientHireRate,
        clientTotalSpent: parsedJob.clientTotalSpent,
      },
      status: 'new',
    });

    await handleCopy(proposal.coverLetter, 'cover');
    syncCrmWithCloud();
    addToast({
      type: 'success',
      title: 'Лид добавлен в воронку!',
      message: `Cover Letter скопирован (${roi.connectsRequired || 0} Connects учтено).`,
    });
  };

  const roiBadgeStyle =
    roi.recommendation === 'apply_now'
      ? 'text-emerald-400 bg-emerald-400/15 border-emerald-400/30'
      : roi.recommendation === 'worth_it'
      ? 'text-sky-400 bg-sky-400/15 border-sky-400/30'
      : roi.recommendation === 'caution'
      ? 'text-amber-300 bg-amber-400/15 border-amber-400/30'
      : 'text-danger bg-danger/15 border-danger/30';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-emerald-400" />
          <span>Upwork Copilot: ROI Connects & 200-симв. Hook</span>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <button
            type="button"
            onClick={() => {
              setRawText(SAMPLE_UPWORK_JOB);
              setTranslatedRu(null);
            }}
            className="text-xs text-accent hover:underline"
          >
            Подставить пример заказа Upwork
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAnalyzeAndSave}
              disabled={!hasContent || isAnalyzingServer}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border transition-colors disabled:opacity-50"
            >
              <Languages size={14} className={isAnalyzingServer ? 'animate-spin' : ''} />
              <span>{isAnalyzingServer ? 'Перевожу...' : 'Перевести и в ленту'}</span>
            </button>

            <button
              type="button"
              onClick={handleAddToPipeline}
              disabled={!hasContent}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-control transition-colors disabled:opacity-50"
            >
              <UserPlus size={14} />
              <span>Копировать + в воронку</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-medium text-text-muted block">
              Вставьте текст вакансии Upwork (вместе с Payment Verified / Hire Rate / Connects / вопросами):
            </label>
            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setTranslatedRu(null);
              }}
              rows={5}
              placeholder="Вставьте описание вакансии со страницы Upwork или используйте Chrome-расширение в 1 клик..."
              className="w-full bg-surface-2 text-text text-xs rounded-control border border-border p-2.5 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-text-muted block">Connects</label>
            <input
              type="number"
              min={0}
              max={100}
              value={connectsOverride}
              onChange={(e) => setConnectsOverride(e.target.value)}
              placeholder={String(parsedJob.connectsRequired || 16)}
              className="w-full bg-surface-2 text-text text-xs rounded-control border border-border px-2.5 py-2 focus:outline-none focus:border-accent font-mono"
            />
            {hasContent && (
              <div className={`p-2.5 rounded-control border text-xs space-y-1 ${roiBadgeStyle}`}>
                <div className="font-bold flex items-center justify-between">
                  <span>ROI Score</span>
                  <span className="font-mono text-sm">{roi.roiScore}/100</span>
                </div>
                <div className="text-[11px] font-semibold">{roi.badgeTextRu}</div>
                <div className="text-[10px] opacity-90">
                  {roi.connectsRequired} Connects (~${roi.connectsCostUsd})
                </div>
              </div>
            )}
          </div>
        </div>

        {hasContent && (
          <>
            {/* Client Quality Flags */}
            {(roi.greenFlags.length > 0 || roi.redFlags.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-surface-2/60 rounded-control border border-border space-y-1">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1">
                    <ShieldCheck size={13} />
                    <span>Плюсы клиента</span>
                  </div>
                  {roi.greenFlags.length === 0 ? (
                    <p className="text-[11px] text-muted">Нет явных плюсов в тексте</p>
                  ) : (
                    roi.greenFlags.map((g, i) => (
                      <div key={i} className="text-[11px] text-text">
                        • {g}
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2.5 bg-surface-2/60 rounded-control border border-border space-y-1">
                  <div className="font-semibold text-danger flex items-center gap-1">
                    <ShieldAlert size={13} />
                    <span>Риски слива Connects</span>
                  </div>
                  {roi.redFlags.length === 0 ? (
                    <p className="text-[11px] text-emerald-400">Красных флагов не обнаружено</p>
                  ) : (
                    roi.redFlags.map((r, i) => (
                      <div key={i} className="text-[11px] text-danger">
                        • {r}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Russian Translation if requested */}
            {translatedRu && (
              <div className="p-3 rounded-control bg-accent/10 border border-accent/25 text-xs space-y-1">
                <div className="font-semibold text-accent flex items-center gap-1">
                  <Languages size={13} />
                  <span>Перевод заказа (RU)</span>
                </div>
                <p className="text-text whitespace-pre-wrap leading-relaxed">{translatedRu}</p>
              </div>
            )}

            {/* Upwork 200-char Hook + Cover Letter */}
            <div className="p-3 bg-surface-2/70 rounded-control border border-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                  <Sparkles size={13} className="text-accent" />
                  <span>Cover Letter + умная ссылка ({proposal.portfolioLabel})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(proposal.coverLetter, 'cover')}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] bg-surface hover:bg-surface-3 border border-border rounded text-text"
                >
                  {copiedKey === 'cover' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedKey === 'cover' ? 'Скопировано' : 'Копировать'}</span>
                </button>
              </div>

              <div className="p-2 bg-surface rounded border border-emerald-500/30 text-[11px]">
                <div className="flex items-center justify-between text-emerald-400 font-semibold mb-1">
                  <span className="flex items-center gap-1">
                    <Scissors size={11} />
                    <span>Превью клиента на Upwork (первые 200 символов):</span>
                  </span>
                  <span className="font-mono">Hook Score: {proposal.previewAnalysis.previewScore}/100</span>
                </div>
                <p className="font-mono text-text">{proposal.previewAnalysis.first200Chars}</p>
              </div>

              <pre className="text-xs text-text-muted whitespace-pre-wrap font-sans bg-surface p-2.5 rounded border border-border/70 leading-relaxed">
                {proposal.coverLetter}
              </pre>
            </div>

            {/* Screening Answers */}
            {proposal.screeningAnswers.length > 0 && (
              <div className="p-3 bg-surface-2/60 rounded-control border border-border space-y-2">
                <div className="text-xs font-semibold text-text">
                  Ответы на вопросы заказчика ({proposal.screeningAnswers.length}):
                </div>
                {proposal.screeningAnswers.map((qa, idx) => (
                  <div key={idx} className="p-2 bg-surface rounded border border-border/70 text-xs space-y-1">
                    <div className="font-medium text-text-muted">Q: {qa.question}</div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-text leading-relaxed">{qa.answer}</p>
                      <button
                        type="button"
                        onClick={() => handleCopy(qa.answer, `q_${idx}`)}
                        className="shrink-0 p-1 text-text-muted hover:text-text"
                        title="Скопировать ответ"
                      >
                        {copiedKey === `q_${idx}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 45s Loom Script */}
            <div className="p-3 bg-surface-2/60 rounded-control border border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
                  <Video size={13} className="text-sky-400" />
                  <span>Сценарий Loom-видео на 45 сек (EN телесуфлёр)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(proposal.loomScript, 'loom')}
                  className="text-[11px] text-accent hover:underline"
                >
                  {copiedKey === 'loom' ? 'Скопировано!' : 'Копировать скрипт'}
                </button>
              </div>
              <pre className="text-[11px] text-text-muted whitespace-pre-wrap font-sans leading-relaxed">
                {proposal.loomScript}
              </pre>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
