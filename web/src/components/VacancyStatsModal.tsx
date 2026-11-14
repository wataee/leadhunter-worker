import React, { useMemo } from 'react';
import { Vacancy } from '../types';
import {
  X,
  TrendingUp,
  DollarSign,
  Tv,
  BarChart2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
} from 'recharts';

interface VacancyStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vacancies: Vacancy[];
}

export const VacancyStatsModal: React.FC<VacancyStatsModalProps> = ({
  isOpen,
  onClose,
  vacancies,
}) => {
  const stats = useMemo(() => {
    let totalWithBudget = 0;
    let sumBudgetShort = 0;
    let countBudgetShort = 0;
    let sumBudgetLong = 0;
    let countBudgetLong = 0;

    const channelCounts: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};

    for (const v of vacancies) {
      // Channel counts
      const ch = v.channel.replace(/^@/, '');
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;

      // Day counts
      const day = v.postedAt ? v.postedAt.slice(5, 10) : 'Сегодня';
      dayCounts[day] = (dayCounts[day] || 0) + 1;

      // Budget stats
      if (v.budget && typeof v.budget.min === 'number' && v.budget.min > 0) {
        totalWithBudget++;
        let amountInRub = v.budget.min;
        if (v.budget.currency === 'USD') amountInRub *= 95;
        else if (v.budget.currency === 'EUR') amountInRub *= 102;
        else if (v.budget.currency === 'KZT') amountInRub *= 0.2;

        if (v.formatTag === 'short') {
          sumBudgetShort += amountInRub;
          countBudgetShort++;
        } else if (v.formatTag === 'long') {
          sumBudgetLong += amountInRub;
          countBudgetLong++;
        }
      }
    }

    const avgShort = countBudgetShort > 0 ? Math.round(sumBudgetShort / countBudgetShort) : 3500;
    const avgLong = countBudgetLong > 0 ? Math.round(sumBudgetLong / countBudgetLong) : 15000;

    // Top channels
    const topChannels = Object.entries(channelCounts)
      .map(([name, count]) => ({ name: `@${name}`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Days timeline sorted chronologically
    const timeline = Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    return {
      total: vacancies.length,
      totalWithBudget,
      avgShort,
      avgLong,
      topChannels,
      timeline,
    };
  }, [vacancies]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg border border-border rounded-modal p-6 max-w-2xl w-full space-y-6 shadow-modal animate-scale-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-control bg-accent/10 text-accent">
              <BarChart2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Статистика вакансий монтажа</h2>
              <p className="text-xs text-text-muted">
                Аналитика ставок, форматов и активности каналов по {stats.total} вакансиям
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-text rounded-control min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="Закрыть модальное окно"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top metrics cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-surface rounded-card border border-border space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Средняя ставка Reels</span>
              <Tv size={14} className="text-accent" />
            </div>
            <div className="text-lg font-bold text-text">~{stats.avgShort.toLocaleString('ru-RU')} ₽</div>
            <div className="text-[10px] text-muted">за ролик / проект</div>
          </div>

          <div className="p-3 bg-surface rounded-card border border-border space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Средняя ставка YouTube</span>
              <DollarSign size={14} className="text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-text">~{stats.avgLong.toLocaleString('ru-RU')} ₽</div>
            <div className="text-[10px] text-muted">длинный выпуск / шоу</div>
          </div>

          <div className="p-3 bg-surface rounded-card border border-border space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Всего в ленте</span>
              <TrendingUp size={14} className="text-info" />
            </div>
            <div className="text-lg font-bold text-text">{stats.total} вакансий</div>
            <div className="text-[10px] text-muted">{stats.totalWithBudget} с явным бюджетом</div>
          </div>
        </div>

        {/* Dynamics Chart */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
            <TrendingUp size={14} className="text-accent" />
            <span>Динамика вакансий по дням</span>
          </h3>
          <div className="h-44 w-full bg-surface p-2 rounded-card border border-border">
            {stats.timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.timeline}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B7CFF" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8B7CFF" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#14161C',
                      borderColor: '#262933',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#8B7CFF"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                    name="Вакансий"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                Недостаточно данных для графика
              </div>
            )}
          </div>
        </div>

        {/* Top Channels Chart */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
            <BarChart2 size={14} className="text-emerald-400" />
            <span>Топ каналов по числу вакансий</span>
          </h3>
          <div className="h-44 w-full bg-surface p-2 rounded-card border border-border">
            {stats.topChannels.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topChannels} layout="vertical">
                  <XAxis type="number" stroke="#6b7280" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={10} width={110} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#14161C',
                      borderColor: '#262933',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} name="Вакансий" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                Каналы пока не добавили вакансий
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-control text-xs font-semibold shadow-subtle min-h-[40px]"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
