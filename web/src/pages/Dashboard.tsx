import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeadsStore } from '../store/leadsStore';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { Lead, Vacancy } from '../types';
import { StatCard } from '../components/StatCard';
import { ProgressRing } from '../components/ProgressRing';
import { TierBadge } from '../components/TierBadge';
import { ScoreBar } from '../components/ScoreBar';
import { LeadDrawer } from '../components/LeadDrawer';
import { PitchGeneratorModal } from '../components/PitchGeneratorModal';
import { EmptyState } from '../components/EmptyState';
import { formatDate, isOverdue, isToday, addDays } from '../lib/time';
import {
  Users,
  MessageCircle,
  Briefcase,
  CheckCircle,
  Plus,
  Send,
  Radio,
  Calendar,
  Sparkles,
  ArrowRight,
  Clock,
  Flame,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const leads = useLeadsStore((s) => s.leads);
  const setSelectedLeadId = useLeadsStore((s) => s.setSelectedLeadId);
  const selectedLeadId = useLeadsStore((s) => s.selectedLeadId);
  const scheduleNextTouch = useLeadsStore((s) => s.scheduleNextTouch);
  const updateLeadStatus = useLeadsStore((s) => s.updateLeadStatus);

  const vacancies = useVacanciesStore((s) => s.vacancies);
  const profile = useSettingsStore((s) => s.profile);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  const todaySentCount = useSettingsStore((s) => s.todaySentCount);
  const incrementSentCount = useSettingsStore((s) => s.incrementSentCount);
  const addToast = useToastStore((s) => s.addToast);

  const [activePitchLead, setActivePitchLead] = useState<Lead | null>(null);
  const [activePitchVacancy, setActivePitchVacancy] = useState<Vacancy | null>(null);
  const [activeOpeningAngle, setActiveOpeningAngle] = useState<string | undefined>(undefined);

  // Metrics calculation
  const totalLeads = leads.length;
  const messagedCount = leads.filter(
    (l) => l.status !== 'new'
  ).length;
  const repliedCount = leads.filter(
    (l) => ['replied', 'call', 'closed'].includes(l.status)
  ).length;
  const inProgressCount = leads.filter((l) =>
    ['messaged', 'followup', 'call'].includes(l.status)
  ).length;
  const closedCount = leads.filter((l) => l.status === 'closed').length;

  const replyRate = messagedCount > 0 ? Math.round((repliedCount / messagedCount) * 100) : 0;

  // Follow-ups for today or overdue
  const followUpLeads = leads.filter(
    (l) =>
      l.status !== 'closed' &&
      l.status !== 'rejected' &&
      (isOverdue(l.nextTouchAt) || isToday(l.nextTouchAt))
  );

  // Latest 5 vacancies
  const freshVacancies = vacancies.filter((v) => !v.hidden).slice(0, 5);

  // Funnel data
  const funnelStages = [
    { label: 'Новый', count: leads.filter((l) => l.status === 'new').length, color: '#60A5FA' },
    { label: 'Написал', count: leads.filter((l) => l.status === 'messaged').length, color: '#8B7CFF' },
    { label: 'Ответил', count: leads.filter((l) => l.status === 'replied').length, color: '#4ADE80' },
    { label: 'Созвон', count: leads.filter((l) => l.status === 'call').length, color: '#A78BFA' },
    { label: 'Закрыт', count: closedCount, color: '#34D399' },
  ];

  // 14 days chart data
  const chartData = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const dayLabel = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    // Count touches on that day
    const dayIsoPrefix = d.toISOString().slice(0, 10);
    let count = 0;
    for (const l of leads) {
      for (const t of l.touches) {
        if (t.at.startsWith(dayIsoPrefix)) count++;
      }
    }
    // For today, include todaySentCount if greater
    if (i === 13) {
      count = Math.max(count, todaySentCount);
    }
    return { day: dayLabel, sent: count };
  });

  const handleDoneTouch = (lead: Lead) => {
    scheduleNextTouch(lead.id, 2);
    addToast({
      type: 'success',
      title: 'Касание сделано',
      message: `Следующее касание с ${lead.name} через 2 дня.`,
    });
  };

  const handlePostponeTouch = (lead: Lead) => {
    scheduleNextTouch(lead.id, 3);
    addToast({
      type: 'info',
      message: `Касание отложено на 3 дня.`,
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Greeting Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text">
            Привет, {profile.name || 'Мастер'}! 🚀
          </h1>
          <p className="text-xs md:text-sm text-text-muted mt-0.5">
            Держи воронку в движении. Конверсия начинается с персонализированного первого контакта.
          </p>
        </div>

        <button
          onClick={() => navigate('/finder')}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control shadow-subtle self-start sm:self-auto transition-colors"
        >
          <Sparkles size={14} />
          <span>Найти новых клиентов на YouTube</span>
        </button>
      </div>

      {/* Daily Goal & Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Daily Quota Card */}
        <div className="bg-surface rounded-card p-5 border border-border flex items-center justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs text-text-muted font-medium block">
              Дневная норма
            </span>
            <div className="text-sm font-semibold text-text">
              {todaySentCount >= dailyGoal ? (
                <span className="text-success flex items-center gap-1">
                  <CheckCircle size={15} /> Норма выполнена!
                </span>
              ) : (
                <span>
                  Осталось отправить:{' '}
                  <strong className="font-mono text-accent">
                    {Math.max(0, dailyGoal - todaySentCount)}
                  </strong>
                </span>
              )}
            </div>
            <button
              onClick={incrementSentCount}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border text-xs font-medium transition-colors"
            >
              <Plus size={13} />
              <span>+1 отправлено</span>
            </button>
          </div>

          <ProgressRing current={todaySentCount} total={dailyGoal} size={74} />
        </div>

        {/* 4 Metrics Cards */}
        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Всего лидов"
            value={totalLeads}
            diffPercent={14}
            icon={Users}
            accentColor="#60A5FA"
          />
          <StatCard
            label="Конверсия в ответ"
            value={`${replyRate}%`}
            subValue={`${repliedCount} из ${messagedCount}`}
            diffPercent={8}
            icon={MessageCircle}
            accentColor="#4ADE80"
          />
          <StatCard
            label="В работе"
            value={inProgressCount}
            diffPercent={5}
            icon={Briefcase}
            accentColor="#8B7CFF"
          />
          <StatCard
            label="Закрытые сделки"
            value={closedCount}
            diffPercent={25}
            icon={CheckCircle}
            accentColor="#FBBF24"
          />
        </div>
      </div>

      {/* Main Grid: Follow-ups & Fresh Vacancies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Follow-ups on today */}
        <div className="bg-surface rounded-card border border-border flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-warning" />
              <h2 className="text-sm font-semibold text-text">
                Напоминания на сегодня (повторно)
              </h2>
            </div>
            <span className="font-mono text-xs font-semibold text-muted bg-surface-2 px-2 py-0.5 rounded border border-border">
              {followUpLeads.length}
            </span>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-2.5 max-h-[380px]">
            {followUpLeads.length === 0 ? (
              <EmptyState
                icon={CheckCircle}
                title="Все напоминания отправлены!"
                description="На сегодня нет горящих повторных сообщений. Отличный момент найти новых клиентов в поиске."
              />
            ) : (
              followUpLeads.map((lead) => {
                const overdue = isOverdue(lead.nextTouchAt);
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center justify-between p-3 rounded-card border ${
                      overdue
                        ? 'border-danger/40 bg-danger-soft/10'
                        : 'border-border bg-surface-2/40'
                    } gap-3`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-text truncate">
                          {lead.name}
                        </span>
                        <TierBadge tier={lead.tier} showLabel={false} />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted font-mono mt-0.5">
                        <span
                          className={overdue ? 'text-danger font-semibold' : 'text-warning'}
                        >
                          {overdue ? 'Просрочен!' : 'Сегодня'} ({formatDate(lead.nextTouchAt || '')})
                        </span>
                        <span>•</span>
                        <span>Касаний: {lead.touchesCount || 0}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="px-2.5 py-1 text-xs text-text bg-surface-2 hover:bg-surface-3 rounded border border-border transition-colors"
                      >
                        Открыть
                      </button>
                      <button
                        onClick={() => handleDoneTouch(lead)}
                        title="Сделано: перенести на +2 дня"
                        className="px-2.5 py-1 text-xs text-accent bg-accent-soft hover:bg-accent/20 rounded border border-accent/20 font-medium transition-colors"
                      >
                        +2 дня
                      </button>
                      <button
                        onClick={() => handlePostponeTouch(lead)}
                        title="Отложить на 3 дня"
                        className="px-2 py-1 text-xs text-muted hover:text-text rounded border border-border transition-colors"
                      >
                        Отложить
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Fresh Vacancies from Monitor */}
        <div className="bg-surface rounded-card border border-border flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-accent" />
              <h2 className="text-sm font-semibold text-text">
                Свежие вакансии из Telegram
              </h2>
            </div>
            <button
              onClick={() => navigate('/vacancies')}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <span>Лента вакансий</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-2.5 max-h-[380px]">
            {freshVacancies.length === 0 ? (
              <EmptyState
                icon={Radio}
                title="Нет активных вакансий"
                description="Подключите Telegram-каналы в разделе Монитор или загрузите демо-данные."
                actionText="Перейти к монитору"
                onAction={() => navigate('/vacancies')}
              />
            ) : (
              freshVacancies.map((vac) => {
                const isHot =
                  Date.now() - new Date(vac.postedAt).getTime() < 20 * 60 * 1000;
                return (
                  <div
                    key={vac.id}
                    className="p-3 rounded-card bg-surface-2/40 border border-border hover:border-border-strong space-y-1.5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-xs text-accent truncate">
                          @{vac.channel}
                        </span>
                        {isHot && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-danger bg-danger-soft px-1.5 py-0.2 rounded border border-danger/20">
                            <Flame size={10} /> Горячая
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted font-mono">
                        {new Date(vac.postedAt).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                      {vac.text}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="font-mono text-[10px] text-muted">
                        Релевантность: {vac.relevance}%
                      </span>
                      <button
                        onClick={() => setActivePitchVacancy(vac)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-control transition-colors"
                      >
                        <Send size={11} />
                        <span>Откликнуться</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Analytics: 14 Days Chart & Funnel Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 14 Days Bar Chart */}
        <div className="lg:col-span-2 bg-surface rounded-card p-5 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text">
                Отправлено сообщений за 14 дней
              </h3>
              <p className="text-xs text-muted">Динамика ежедневной активности</p>
            </div>
            <span className="text-xs font-mono text-accent bg-accent-soft px-2.5 py-0.5 rounded border border-accent/20">
              Цель: {dailyGoal}/день
            </span>
          </div>

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  stroke="#5E6370"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#23262F' }}
                />
                <YAxis
                  stroke="#5E6370"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#23262F' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#14161C',
                    borderColor: '#23262F',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#E8E9ED',
                  }}
                  cursor={{ fill: 'rgba(139, 124, 255, 0.08)' }}
                />
                <Bar dataKey="sent" fill="#8B7CFF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel breakdown */}
        <div className="bg-surface rounded-card p-5 border border-border flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-text">Воронка лидов</h3>
            <p className="text-xs text-muted">Распределение клиентов по этапам</p>
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-center">
            {funnelStages.map((stg) => {
              const maxVal = Math.max(totalLeads, 1);
              const pct = Math.round((stg.count / maxVal) * 100);
              return (
                <div key={stg.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text font-medium">{stg.label}</span>
                    <span className="font-mono text-text-muted">
                      {stg.count} <span className="text-[10px]">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden border border-border/40">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: stg.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => navigate('/leads')}
            className="w-full py-2 bg-surface-2 hover:bg-surface-3 rounded-control text-xs font-semibold text-text text-center border border-border transition-colors"
          >
            Открыть канбан-доску
          </button>
        </div>
      </div>

      {/* Lead Drawer */}
      <LeadDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onOpenPitchGenerator={(l, angle) => {
          setSelectedLeadId(null);
          setActivePitchLead(l);
          setActiveOpeningAngle(angle);
        }}
      />

      {/* Pitch Generator Modal */}
      <PitchGeneratorModal
        isOpen={Boolean(activePitchLead || activePitchVacancy)}
        onClose={() => {
          setActivePitchLead(null);
          setActivePitchVacancy(null);
          setActiveOpeningAngle(undefined);
        }}
        lead={activePitchLead}
        vacancy={activePitchVacancy}
        initialOpeningAngle={activeOpeningAngle}
      />
    </div>
  );
};
