import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLeadsStore } from '../store/leadsStore';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { Lead, Vacancy } from '../types';
import { PitchGeneratorModal } from '../components/PitchGeneratorModal';
import { UpworkCopilotModal } from '../components/UpworkCopilotModal';
import { SystemHealthModal } from '../components/SystemHealthModal';
import { syncCrmWithCloud } from '../lib/cloudSync';
import { isOverdue, isToday } from '../lib/time';
import {
  Clock,
  Radio,
  Briefcase,
  Send,
  ArrowRight,
  Activity,
  Sparkles,
  Flame,
  Zap,
  Cloud,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const leads = useLeadsStore((s) => s.leads);
  const setSelectedLeadId = useLeadsStore((s) => s.setSelectedLeadId);
  const addLead = useLeadsStore((s) => s.addLead);
  const scheduleNextTouch = useLeadsStore((s) => s.scheduleNextTouch);

  const vacancies = useVacanciesStore((s) => s.vacancies);
  const markSeen = useVacanciesStore((s) => s.markSeen);
  const profile = useSettingsStore((s) => s.profile);
  const addToast = useToastStore((s) => s.addToast);

  const [activePitchLead, setActivePitchLead] = useState<Lead | null>(null);
  const [activePitchVacancy, setActivePitchVacancy] = useState<Vacancy | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<string | undefined>(undefined);
  const [activeOpeningAngle, setActiveOpeningAngle] = useState<string | undefined>(undefined);
  const [showSystemHealth, setShowSystemHealth] = useState(false);
  const [showUpworkCopilot, setShowUpworkCopilot] = useState(false);

  const redditVacanciesCount = vacancies.filter((v) => !v.hidden && v.sourcePlatform === 'reddit').length;
  const upworkVacanciesCount = vacancies.filter((v) => !v.hidden && v.sourcePlatform === 'upwork').length;
  const upworkLeads = leads.filter((l) => l.sourcePlatform === 'upwork' || l.source === 'Upwork');
  const totalConnectsSpent = upworkLeads.reduce((sum, l) => sum + (l.connectsSpent || 0), 0);

  // Автоматический подсчёт откликов за сегодня из воронки
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const responsesToday = leads.filter(
    (l) =>
      l.touches?.some((t) => t.at?.startsWith(todayPrefix)) ||
      (l.status === 'messaged' && (l.firstTouchAt?.startsWith(todayPrefix) || l.createdAt?.startsWith(todayPrefix)))
  ).length;

  // 1. Кому написать сегодня (напоминания и просроченные)
  const followUpLeads = leads.filter(
    (l) =>
      l.status !== 'closed' &&
      l.status !== 'rejected' &&
      (isOverdue(l.nextTouchAt) || isToday(l.nextTouchAt))
  );

  // 2. Что нового сегодня (свежие нескрытые вакансии EU / US / KZ)
  const freshVacancies = vacancies.filter((v) => !v.hidden && v.region !== 'RU').slice(0, 6);

  // 3. Что в работе
  const inProgressLeads = leads.filter((l) =>
    ['messaged', 'replied', 'call'].includes(l.status)
  );

  const handleDoneTouch = (lead: Lead) => {
    scheduleNextTouch(lead.id, 2);
    addToast({
      type: 'success',
      title: 'Касание сделано',
      message: `Следующее касание с ${lead.name} через 2 дня.`,
    });
  };

  const handleConvertToLead = (vac: Vacancy) => {
    addLead({
      name: `@${vac.channel.replace(/^@/, '')}`,
      channelUrl: vac.url,
      notes: vac.text,
      status: 'new',
    });
    addToast({
      type: 'success',
      title: 'Сохранено в лиды',
      message: `Заказ из @${vac.channel} добавлен в воронку.`,
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text">
            Дашборд
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Откликов сегодня:{' '}
            <strong className="text-text font-mono text-sm">{responsesToday}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSystemHealth(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text text-xs font-medium rounded-control border border-border transition-colors min-h-[36px]"
            title="Проверить статус воркера и бота"
          >
            <Activity size={14} className="text-emerald-400" />
            <span>Всё ли работает?</span>
          </button>

          <Link
            to="/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text text-xs font-medium rounded-control border border-border transition-colors min-h-[36px]"
          >
            <span>Настройки</span>
          </Link>
        </div>
      </div>

      {/* Multi-Source & Upwork Connects Economics Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-surface rounded-card border border-border p-3.5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] text-text-muted">Мульти-источники</div>
            <div className="text-xs font-semibold text-text mt-0.5">
              TG: {freshVacancies.length} · Reddit: {redditVacanciesCount} · Upwork: {upworkVacanciesCount}
            </div>
          </div>
          <Link
            to="/vacancies?platform=reddit"
            className="text-[11px] font-medium text-text-muted hover:text-text shrink-0"
          >
            Reddit →
          </Link>
        </div>

        <div className="bg-surface rounded-card border border-border p-3.5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] text-text-muted">Экономика Upwork Connects</div>
            <div className="text-xs font-semibold text-text mt-0.5">
              {totalConnectsSpent} Connects (~${(totalConnectsSpent * 0.15).toFixed(2)}) · {upworkLeads.length} лидов
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowUpworkCopilot(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-2 hover:bg-surface-3 text-text border border-border rounded-control text-[11px] font-medium shrink-0"
          >
            <Zap size={12} className="text-text-muted" />
            <span>Upwork Copilot</span>
          </button>
        </div>

        <div className="bg-surface rounded-card border border-border p-3.5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] text-text-muted">Облако ПК ↔ Телефон</div>
            <div className="text-xs font-semibold text-text mt-0.5">
              {leads.length} лидов в единой воронке
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const res = await syncCrmWithCloud();
              addToast({
                type: res?.ok ? 'success' : 'error',
                message: res?.ok ? 'Воронка синхронизирована!' : 'Не удалось синхронизировать с облаком',
              });
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-2 hover:bg-surface-3 text-text border border-border rounded text-[11px] font-medium shrink-0"
          >
            <Cloud size={12} className="text-emerald-400" />
            <span>Синхронизировать</span>
          </button>
        </div>
      </div>

      {/* Grid: 3 Main Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Кому написать сегодня */}
        <div className="bg-surface rounded-card border border-border flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-warning" />
              <h2 className="text-sm font-semibold text-text">Кому написать</h2>
            </div>
            <span className="font-mono text-xs font-semibold text-muted bg-surface-2 px-2 py-0.5 rounded border border-border">
              {followUpLeads.length}
            </span>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-2.5 max-h-[420px]">
            {followUpLeads.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-muted">
                На сегодня нет горящих напоминаний.
              </div>
            ) : (
              followUpLeads.map((lead) => {
                const overdue = isOverdue(lead.nextTouchAt);
                return (
                  <div
                    key={lead.id}
                    className={`p-3 rounded-card border ${
                      overdue ? 'border-danger/40 bg-danger-soft/10' : 'border-border bg-surface-2/40'
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text truncate">
                        {lead.name}
                      </span>
                      <span
                        className={`text-[10px] font-mono ${
                          overdue ? 'text-danger font-bold' : 'text-warning'
                        }`}
                      >
                        {overdue ? 'Просрочен' : 'Сегодня'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActivePitchLead(lead);
                          setActiveStrategy('followup_1');
                          setActiveOpeningAngle(undefined);
                        }}
                        className="flex-1 py-1 px-2 text-xs text-bg bg-text hover:bg-white rounded-control font-medium transition-colors flex items-center justify-center gap-1 min-h-[30px]"
                      >
                        <Send size={11} />
                        <span>Написать</span>
                      </button>
                      <button
                        onClick={() => handleDoneTouch(lead)}
                        title="Отметить выполненным (+2 дня)"
                        className="py-1 px-2.5 text-xs text-text bg-surface-2 hover:bg-surface-3 rounded-control border border-border transition-colors font-medium min-h-[30px]"
                      >
                        +2д
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 2. Что нового сегодня */}
        <div className="bg-surface rounded-card border border-border flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-accent" />
              <h2 className="text-sm font-semibold text-text">Что нового</h2>
            </div>
            <Link
              to="/vacancies"
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <span>Лента</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-2.5 max-h-[420px]">
            {freshVacancies.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-muted">
                Пока нет новых вакансий.
              </div>
            ) : (
              freshVacancies.map((vac) => {
                const isHot = Date.now() - new Date(vac.postedAt).getTime() < 20 * 60 * 1000;
                return (
                  <div
                    key={vac.id}
                    className="p-3 rounded-card bg-surface-2/40 border border-border hover:border-border-strong space-y-1.5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-xs text-text truncate">
                        @{vac.channel.replace(/^@/, '')}
                      </span>
                      {isHot && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-danger bg-danger/10 px-1.5 py-0.2 rounded-control border border-danger/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-danger inline-block" /> Горячее
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                      {vac.text}
                    </p>

                    <div className="flex items-center justify-between pt-1 gap-2">
                      <button
                        onClick={() => {
                          markSeen(vac.id);
                          setActivePitchVacancy(vac);
                        }}
                        className="py-1 px-2.5 text-xs font-medium text-bg bg-text hover:bg-white rounded-control transition-colors min-h-[30px]"
                      >
                        Откликнуться
                      </button>
                      <button
                        onClick={() => handleConvertToLead(vac)}
                        className="py-1 px-2 text-xs text-text-muted hover:text-text bg-surface-2 hover:bg-surface-3 rounded-control border border-border transition-colors min-h-[30px]"
                      >
                        В лиды
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 3. Что в работе */}
        <div className="bg-surface rounded-card border border-border flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-text">В работе</h2>
            </div>
            <Link
              to="/leads"
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <span>Воронка</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-2.5 max-h-[420px]">
            {inProgressLeads.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-muted">
                В работе пока нет активных сделок. Откликнитесь на свежие вакансии.
              </div>
            ) : (
              inProgressLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    navigate('/leads');
                  }}
                  className="p-3 rounded-card bg-surface-2/40 border border-border hover:border-accent/40 cursor-pointer space-y-1 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-text truncate">
                      {lead.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">
                      {lead.status === 'messaged'
                        ? 'Написал'
                        : lead.status === 'replied'
                        ? 'Ответил'
                        : 'Созвон'}
                    </span>
                  </div>
                  {lead.notes && (
                    <p className="text-[11px] text-muted line-clamp-1">{lead.notes}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <PitchGeneratorModal
        isOpen={Boolean(activePitchLead || activePitchVacancy)}
        onClose={() => {
          setActivePitchLead(null);
          setActivePitchVacancy(null);
          setActiveStrategy(undefined);
          setActiveOpeningAngle(undefined);
        }}
        lead={activePitchLead || undefined}
        vacancy={activePitchVacancy || undefined}
        initialStrategy={activeStrategy}
        initialOpeningAngle={activeOpeningAngle}
      />


      <SystemHealthModal
        isOpen={showSystemHealth}
        onClose={() => setShowSystemHealth(false)}
      />

      <UpworkCopilotModal
        isOpen={showUpworkCopilot}
        onClose={() => setShowUpworkCopilot(false)}
      />
    </div>
  );
};
