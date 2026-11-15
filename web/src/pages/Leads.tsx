import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeadsStore } from '../store/leadsStore';
import { useToastStore } from '../store/toastStore';
import { Lead, LeadStatus, LeadTier } from '../types';
import { KanbanBoard } from '../components/KanbanBoard';
import { LeadDrawer } from '../components/LeadDrawer';
import { PitchGeneratorModal } from '../components/PitchGeneratorModal';
import { TierBadge } from '../components/TierBadge';
import { ScoreBar } from '../components/ScoreBar';
import { exportLeadsToCsv } from '../lib/csv';
import { formatDate, isOverdue, isToday } from '../lib/time';
import { EmptyState } from '../components/EmptyState';
import {
  Kanban,
  Table as TableIcon,
  Search,
  Download,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export const Leads: React.FC = () => {
  const {
    leads,
    selectedLeadId,
    setSelectedLeadId,
    updateLeadStatus,
    bulkUpdateStatus,
    bulkUpdateTier,
    deleteLeads,
  } = useLeadsStore();

  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterTouch, setFilterTouch] = useState<string>('all'); // all, today, overdue
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [pitchLead, setPitchLead] = useState<Lead | null>(null);
  const [pitchOpeningAngle, setPitchOpeningAngle] = useState<string | undefined>(undefined);

  // 3.11 Загрузка недели (в работе: call, replied, followup)
  const activeWorkloadHours = useMemo(() => {
    const inProgressCount = leads.filter(
      (l) => l.status === 'call' || l.status === 'replied' || l.status === 'followup'
    ).length;
    return inProgressCount * 8;
  }, [leads]);

  const maxWeeklyHours = 40;
  const isOverloaded = activeWorkloadHours > maxWeeklyHours;

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = lead.name.toLowerCase().includes(q);
      const matchNiche = lead.niche.toLowerCase().includes(q);
      const matchNotes = (lead.notes || '').toLowerCase().includes(q);
      const matchTags = (lead.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchNiche && !matchNotes && !matchTags) return false;
    }

    // Status filter
    if (filterStatus !== 'all' && lead.status !== filterStatus) {
      return false;
    }

    // Tier filter
    if (filterTier !== 'all' && String(lead.tier) !== filterTier) {
      return false;
    }

    // Touch filter
    if (filterTouch === 'today' && !isToday(lead.nextTouchAt)) {
      return false;
    }
    if (filterTouch === 'overdue' && !isOverdue(lead.nextTouchAt)) {
      return false;
    }

    return true;
  });

  const handleExportCsv = () => {
    if (leads.length === 0) {
      addToast({ type: 'info', message: 'Нет лидов для экспорта' });
      return;
    }
    exportLeadsToCsv(filteredLeads, `leadhunter_leads_${Date.now()}.csv`);
    addToast({
      type: 'success',
      title: 'CSV файл скачан',
      message: `${filteredLeads.length} лидов экспортировано с поддержкой кириллицы (UTF-8 BOM).`,
    });
  };

  const handleBulkStatusChange = (status: LeadStatus) => {
    if (selectedIds.length === 0) return;
    bulkUpdateStatus(selectedIds, status);
    addToast({
      type: 'success',
      message: `Статус ${selectedIds.length} лидов изменен на "${status}"`,
    });
    setSelectedIds([]);
  };

  const handleBulkTierChange = (tier: LeadTier) => {
    if (selectedIds.length === 0) return;
    bulkUpdateTier(selectedIds, tier);
    addToast({
      type: 'success',
      message: `Категория ${selectedIds.length} клиентов изменена на "T${tier}"`,
    });
    setSelectedIds([]);
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    deleteLeads(selectedIds);
    addToast({
      type: 'info',
      message: `${selectedIds.length} лидов удалено из воронки`,
    });
    setSelectedIds([]);
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text flex items-center gap-2">
            <Kanban size={22} className="text-accent" />
            <span>Воронка клиентов</span>
          </h1>
          <p className="text-xs md:text-sm text-text-muted mt-0.5">
            Управление контактами, статусами и первыми сообщениями по каждому клиенту.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border text-xs font-medium transition-colors"
          >
            <Download size={14} />
            <span>Экспорт CSV</span>
          </button>

          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded-control overflow-hidden bg-surface">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <Kanban size={14} />
              <span>Канбан</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <TableIcon size={14} />
              <span>Таблица</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3.11 Загрузка недели & Follow-up правила 1-2-3 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface rounded-card border border-border text-xs">
        <div className="flex items-center gap-2">
          <Clock size={16} className={isOverloaded ? 'text-danger' : 'text-accent'} />
          <span>
            <strong className="text-text">Загрузка недели:</strong>{' '}
            <span className={isOverloaded ? 'text-danger font-bold' : 'text-text font-medium'}>
              {activeWorkloadHours} / {maxWeeklyHours} ч
            </span>
          </span>
          {isOverloaded && (
            <span className="px-2 py-0.5 rounded bg-danger/20 text-danger text-[10px] font-semibold border border-danger/30 flex items-center gap-1">
              <AlertTriangle size={11} /> Перегрузка недели! Повышайте ставку
            </span>
          )}
        </div>

        <div className="text-[11px] text-muted flex items-center gap-1">
          <span>Правило фоллоу-апов:</span>
          <span className="font-mono text-text">1-й через 2 дня • 2-й через 2 дня • 3-й через 3 дня</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface rounded-card p-3.5 border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder="Поиск по имени, нише, тегам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-2 text-text text-xs rounded-control border border-border pl-8 pr-3 py-1.5 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-surface-2 text-text text-xs rounded-control border border-border px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">Все статусы</option>
            <option value="new">Новый</option>
            <option value="messaged">Написал</option>
            <option value="replied">Ответил</option>
            <option value="followup">Напоминание (повторно)</option>
            <option value="call">Созвон</option>
            <option value="closed">Закрыт</option>
            <option value="rejected">Отказ</option>
          </select>

          {/* Tier Filter */}
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="bg-surface-2 text-text text-xs rounded-control border border-border px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">Все категории</option>
            <option value="1">Топ-клиент (VIP)</option>
            <option value="2">Перспективный</option>
            <option value="3">Обычный</option>
          </select>

          {/* Touch Filter */}
          <select
            value={filterTouch}
            onChange={(e) => setFilterTouch(e.target.value)}
            className="bg-surface-2 text-text text-xs rounded-control border border-border px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">Все касания</option>
            <option value="today">На сегодня</option>
            <option value="overdue">Просроченные</option>
          </select>
        </div>

        {/* Count */}
        <div className="font-mono text-muted text-xs shrink-0">
          Показано: <strong>{filteredLeads.length}</strong> из {leads.length}
        </div>
      </div>

      {/* Bulk action bar (if any selected) */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-accent-soft border border-accent/30 rounded-card flex items-center justify-between gap-3 text-xs animate-fade-in-scale">
          <span className="font-semibold text-accent">
            Выбрано лидов: {selectedIds.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkStatusChange('messaged')}
              className="px-2.5 py-1 bg-surface text-text rounded border border-border hover:bg-surface-2"
            >
              Статус: Написал
            </button>
            <button
              onClick={() => handleBulkStatusChange('closed')}
              className="px-2.5 py-1 bg-surface text-text rounded border border-border hover:bg-surface-2"
            >
              Статус: Закрыт
            </button>
            <button
              onClick={() => handleBulkTierChange(1)}
              className="px-2.5 py-1 bg-surface text-warning rounded border border-border hover:bg-surface-2"
            >
              В VIP (T1)
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-2.5 py-1 bg-danger-soft text-danger rounded border border-danger/30 hover:bg-danger/20"
            >
              Удалить
            </button>
          </div>
        </div>
      )}

      {/* Main View: Kanban or Table */}
      {leads.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title="База клиентов пока пуста"
          description="Ищите подходящие каналы в разделе «Поиск каналов» или добавляйте найденных клиентов в воронку."
          actionText="Перейти к поиску"
          onAction={() => navigate('/finder')}
        />
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          leads={filteredLeads}
          onMoveLead={(id, status) => updateLeadStatus(id, status)}
          onSelectLead={(l) => setSelectedLeadId(l.id)}
          onOpenPitch={(l) => setPitchLead(l)}
        />
      ) : (
        /* Table View */
        <div className="bg-surface rounded-card border border-border overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2/60 border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.length === filteredLeads.length && filteredLeads.length > 0
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(filteredLeads.map((l) => l.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="rounded bg-surface-2 border-border text-accent focus:ring-accent"
                  />
                </th>
                <th className="p-3">Клиент / Канал</th>
                <th className="p-3">Ниша</th>
                <th className="p-3">Класс & Балл</th>
                <th className="p-3">Статус</th>
                <th className="p-3">Касаний</th>
                <th className="p-3">След. касание</th>
                <th className="p-3">Сумма</th>
                <th className="p-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredLeads.map((lead) => {
                const isSelected = selectedIds.includes(lead.id);
                const overdue = isOverdue(lead.nextTouchAt);

                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="hover:bg-surface-2/30 cursor-pointer transition-colors"
                  >
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds([...selectedIds, lead.id]);
                          } else {
                            setSelectedIds(selectedIds.filter((id) => id !== lead.id));
                          }
                        }}
                        className="rounded bg-surface-2 border-border text-accent focus:ring-accent"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        {lead.avatar ? (
                          <img
                            src={lead.avatar}
                            alt=""
                            className="w-7 h-7 rounded-full border border-border object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-accent text-xs">
                            {lead.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-text truncate max-w-[200px]">
                            {lead.name}
                          </div>
                          <div className="text-[10px] text-muted font-mono">
                            {lead.hiddenSubscribers
                              ? 'Сабы скрыты'
                              : `${lead.subscribers.toLocaleString()} саб`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-text-muted">{lead.niche}</td>
                    <td className="p-3">
                      <div className="space-y-1">
                        <TierBadge tier={lead.tier} showLabel={false} />
                        <ScoreBar score={lead.score} />
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-text capitalize">
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-muted">
                      {lead.touchesCount || 0}
                    </td>
                    <td className="p-3 font-mono">
                      {lead.nextTouchAt ? (
                        <span className={overdue ? 'text-danger font-semibold' : 'text-text'}>
                          {formatDate(lead.nextTouchAt)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 font-mono font-bold text-text">
                      {lead.dealValue ? `${lead.dealValue} ${lead.currency}` : '—'}
                    </td>
                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setPitchLead(lead)}
                        className="px-2.5 py-1 bg-accent text-white rounded text-xs font-semibold hover:bg-accent-hover transition-colors"
                      >
                        Написать
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lead Drawer */}
      <LeadDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onOpenPitchGenerator={(l, angle) => {
          setSelectedLeadId(null);
          setPitchLead(l);
          setPitchOpeningAngle(angle);
        }}
      />

      {/* Pitch Generator Modal */}
      <PitchGeneratorModal
        isOpen={Boolean(pitchLead)}
        onClose={() => {
          setPitchLead(null);
          setPitchOpeningAngle(undefined);
        }}
        lead={pitchLead}
        initialOpeningAngle={pitchOpeningAngle}
      />
    </div>
  );
};
