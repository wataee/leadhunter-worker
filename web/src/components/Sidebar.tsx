import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  Radio,
  Kanban,
  FileText,
  Settings,
  HelpCircle,
  Database,
} from 'lucide-react';
import { useLeadsStore } from '../store/leadsStore';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useSettingsStore } from '../store/settingsStore';

interface SidebarProps {
  onOpenShortcuts: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenShortcuts,
  mobileOpen,
  onCloseMobile,
}) => {
  const leads = useLeadsStore((s) => s.leads);
  const vacancies = useVacanciesStore((s) => s.vacancies);
  const sessionQuotaUsed = useSettingsStore((s) => s.sessionQuotaUsed);

  const activeLeadsCount = leads.filter((l) => l.status !== 'rejected').length;
  const unseenVacanciesCount = vacancies.filter((v) => !v.seen && !v.hidden).length;

  const navItems = [
    {
      to: '/',
      label: 'Дашборд',
      icon: LayoutDashboard,
      shortcut: 'g d',
    },
    {
      to: '/finder',
      label: 'Поиск каналов',
      icon: Search,
      shortcut: 'g f',
    },
    {
      to: '/vacancies',
      label: 'Монитор вакансий',
      icon: Radio,
      badge: unseenVacanciesCount > 0 ? unseenVacanciesCount : undefined,
      badgeVariant: 'danger' as const,
      shortcut: 'g v',
    },
    {
      to: '/leads',
      label: 'Воронка клиентов',
      icon: Kanban,
      badge: activeLeadsCount > 0 ? activeLeadsCount : undefined,
      shortcut: 'g l',
    },
    {
      to: '/templates',
      label: 'Шаблоны сообщений',
      icon: FileText,
      shortcut: 'g t',
    },
    {
      to: '/settings',
      label: 'Настройки',
      icon: Settings,
      shortcut: 'g s',
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-surface border-r border-border select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-border/80">
        <NavLink
          to="/"
          onClick={onCloseMobile}
          className="flex items-center gap-2 group focus:outline-none"
        >
          <div className="flex items-baseline font-mono text-xl font-bold tracking-tight text-text">
            <span>.lead</span>
            <span className="text-accent group-hover:scale-125 transition-transform duration-150">
              •
            </span>
            <span className="text-xs uppercase tracking-widest text-muted ml-1.5 font-sans font-semibold">
              Hunter
            </span>
          </div>
        </NavLink>
        <span className="text-[10px] font-mono text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border">
          v1.0
        </span>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[11px] font-medium text-text-muted/60 uppercase tracking-wider px-3 mb-2">
          Навигация
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-control text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-accent-soft text-accent border border-accent/20'
                    : 'text-text-muted hover:text-text hover:bg-surface-2 border border-transparent'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <Icon size={16} />
                <span>{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {item.badge !== undefined && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                      item.badgeVariant === 'danger'
                        ? 'bg-danger text-white animate-pulse'
                        : 'bg-surface-2 text-text-muted border border-border'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Actions & Quota */}
      <div className="p-3 border-t border-border space-y-2 bg-surface">
        {/* Quota widget */}
        <div className="px-3 py-2 bg-surface-2/60 rounded-control border border-border/60 text-[11px]">
          <div className="flex items-center justify-between text-text-muted mb-1">
            <span className="flex items-center gap-1">
              <Database size={11} /> Квота сессии
            </span>
            <span className="font-mono text-text">
              {sessionQuotaUsed} / 10 000
            </span>
          </div>
          <div className="w-full h-1 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (sessionQuotaUsed / 10000) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Shortcuts button */}
        <button
          onClick={onOpenShortcuts}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-2 rounded-control transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <HelpCircle size={13} />
            <span>Горячие клавиши</span>
          </span>
          <kbd className="font-mono text-[10px] bg-surface-2 px-1.5 py-0.5 rounded border border-border text-muted">
            ?
          </kbd>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-[240px] md:flex-col shrink-0 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 md:hidden backdrop-blur-sm"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] md:hidden transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};
