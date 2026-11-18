import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  Radio,
  Kanban,
  FileText,
  Settings,
  Database,
  LogOut,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useLeadsStore } from '../store/leadsStore';
import { useToastStore } from '../store/toastStore';
import { logout } from '../lib/api';
import { syncCrmWithCloud } from '../lib/cloudSync';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mobileOpen,
  onCloseMobile,
}) => {
  const vacancies = useVacanciesStore((s) => s.vacancies);
  const unseenVacanciesCount = vacancies.filter((v) => !v.seen && !v.hidden).length;
  const isSyncingCloud = useLeadsStore((s) => s.isSyncingCloud);
  const lastCloudSyncAt = useLeadsStore((s) => s.lastCloudSyncAt);
  const addToast = useToastStore((s) => s.addToast);

  const handleManualSync = async () => {
    const res = await syncCrmWithCloud();
    if (res?.ok) {
      addToast({
        type: 'success',
        message: res.redisConfigured
          ? `CRM синхронизирована с облаком (${res.state.leads.length} лидов)`
          : 'Облачная синхронизация выполнена (локальный сервер)',
      });
    } else {
      addToast({
        type: 'error',
        message: 'Не удалось синхронизировать CRM (проверьте сессию или Upstash Redis)',
      });
    }
  };

  const navItems = [
    {
      to: '/',
      label: 'Дашборд',
      icon: LayoutDashboard,
    },
    {
      to: '/finder',
      label: 'Поиск каналов',
      icon: Search,
    },
    {
      to: '/vacancies',
      label: 'Вакансии',
      icon: Radio,
      badge: unseenVacanciesCount > 0 ? unseenVacanciesCount : undefined,
    },
    {
      to: '/sources',
      label: 'Источники',
      icon: Database,
    },
    {
      to: '/leads',
      label: 'Воронка',
      icon: Kanban,
    },
    {
      to: '/templates',
      label: 'Шаблоны',
      icon: FileText,
    },
    {
      to: '/settings',
      label: 'Настройки',
      icon: Settings,
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
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
              {item.badge !== undefined && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-danger text-white">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Action: Cloud Sync & Logout */}
      <div className="p-3 border-t border-border bg-surface space-y-1.5">
        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncingCloud}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-muted hover:text-accent hover:bg-accent/10 rounded-control transition-colors disabled:opacity-60"
          title={
            lastCloudSyncAt
              ? `Последняя синхронизация: ${new Date(lastCloudSyncAt).toLocaleTimeString('ru-RU')}`
              : 'Синхронизировать CRM между телефоном и ПК'
          }
        >
          <span className="flex items-center gap-2">
            {isSyncingCloud ? (
              <RefreshCw size={14} className="animate-spin text-accent" />
            ) : (
              <Cloud size={14} className="text-emerald-400" />
            )}
            <span>Синхр. (ПК ↔ Тел)</span>
          </span>
          {lastCloudSyncAt && (
            <span className="text-[10px] font-mono text-emerald-400">OK</span>
          )}
        </button>

        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
          title="Выйти из системы"
        >
          <LogOut size={15} />
          <span>Выйти</span>
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
