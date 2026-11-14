import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import { Lead, LeadStatus } from '../types';
import { LeadCard } from './LeadCard';

interface KanbanColumnProps {
  status: LeadStatus;
  title: string;
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onOpenPitch: (lead: Lead) => void;
  colorDot?: string;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  title,
  leads,
  onSelectLead,
  onOpenPitch,
  colorDot = '#8B8F9A',
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 min-w-[260px] max-w-[320px] bg-surface-2/30 rounded-card border ${
        isOver ? 'border-accent bg-accent-soft/10' : 'border-border/80'
      } h-full overflow-hidden transition-colors duration-150`}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-border/80 flex items-center justify-between bg-surface-2/40">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: colorDot }}
          />
          <h3 className="text-xs font-semibold text-text tracking-wide truncate">
            {title}
          </h3>
        </div>
        <span className="font-mono text-[11px] font-semibold text-muted bg-surface px-2 py-0.5 rounded-full border border-border">
          {leads.length}
        </span>
      </div>

      {/* Column Cards */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {leads.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-center text-xs text-muted/60 border border-dashed border-border/60 rounded-card">
            Пусто
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onSelectLead(lead)}
              onOpenPitch={(e) => {
                e.stopPropagation();
                onOpenPitch(lead);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface KanbanBoardProps {
  leads: Lead[];
  onMoveLead: (leadId: string, newStatus: LeadStatus) => void;
  onSelectLead: (lead: Lead) => void;
  onOpenPitch: (lead: Lead) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  leads,
  onMoveLead,
  onSelectLead,
  onOpenPitch,
}) => {
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const columns: { status: LeadStatus; title: string; color: string }[] = [
    { status: 'new', title: 'Новый', color: '#60A5FA' },
    { status: 'messaged', title: 'Написал', color: '#8B7CFF' },
    { status: 'replied', title: 'Ответил', color: '#4ADE80' },
    { status: 'followup', title: 'Напоминание', color: '#FBBF24' },
    { status: 'call', title: 'Созвон / Пробный', color: '#A78BFA' },
    { status: 'closed', title: 'Закрыт', color: '#34D399' },
    { status: 'rejected', title: 'Отказ', color: '#F87171' },
  ];

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find((l) => l.id === event.active.id);
    if (lead) setActiveLead(lead);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLead(null);

    if (!over) return;

    const leadId = String(active.id);
    const newStatus = String(over.id) as LeadStatus;

    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.status !== newStatus) {
      onMoveLead(leadId, newStatus);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 h-[calc(100vh-190px)] min-h-[500px]">
        {columns.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            title={col.title}
            colorDot={col.color}
            leads={leads.filter((l) => l.status === col.status)}
            onSelectLead={onSelectLead}
            onOpenPitch={onOpenPitch}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead ? (
          <LeadCard
            lead={activeLead}
            isDragging={true}
            onClick={() => {}}
            onOpenPitch={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
