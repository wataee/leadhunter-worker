import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ToastContainer } from './components/ToastContainer';
import { ShortcutsModal } from './components/ShortcutsModal';
import { CardSkeleton } from './components/Skeleton';
import { fetchInbox, ackInbox } from './lib/api';
import { useLeadsStore } from './store/leadsStore';
import { useToastStore } from './store/toastStore';
import { RefreshCw } from 'lucide-react';

// Lazy loaded pages for high performance & Lighthouse 90+
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Finder = lazy(() => import('./pages/Finder').then(m => ({ default: m.Finder })));
const Vacancies = lazy(() => import('./pages/Vacancies').then(m => ({ default: m.Vacancies })));
const Sources = lazy(() => import('./pages/Sources').then(m => ({ default: m.Sources })));
const Leads = lazy(() => import('./pages/Leads').then(m => ({ default: m.Leads })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

const PageLoadingFallback: React.FC = () => (
  <div className="p-6 max-w-6xl mx-auto space-y-4">
    <div className="h-8 w-48 bg-surface-2 animate-pulse rounded-md" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  </div>
);

// Inner component with keyboard shortcut listeners
const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [lastKeyPressed, setLastKeyPressed] = useState<{ key: string; time: number } | null>(null);
  const [hasChunkError, setHasChunkError] = useState(false);

  const addLead = useLeadsStore((s) => s.addLead);
  const addToast = useToastStore((s) => s.addToast);

  // 1.6 Обработка ошибок загрузки чанков и Service Worker
  useEffect(() => {
    const handleChunkError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = 'message' in e ? e.message : String((e as any).reason || '');
      if (/Failed to fetch dynamically imported module/i.test(msg) || /Loading chunk/i.test(msg)) {
        setHasChunkError(true);
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    // Регистрация Service Worker
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  // 1.5 Опрос /api/inbox при открытии и по таймеру (раз в 60 с)
  useEffect(() => {
    let active = true;

    const checkInbox = async () => {
      try {
        const data = await fetchInbox();
        if (!active || !data || !Array.isArray(data.items) || data.items.length === 0) return;

        const incoming = data.items;
        const currentLeads = useLeadsStore.getState().leads;
        const existingIds = new Set(currentLeads.map((l) => l.id));

        let addedCount = 0;
        for (const item of incoming) {
          if (!existingIds.has(item.id)) {
            addLead({
              id: item.id,
              name: item.channel ? `@${item.channel.replace(/^@/, '')}` : 'Лид из Telegram',
              channelUrl: item.url,
              notes: item.text,
              status: 'new',
            });
            existingIds.add(item.id);
            addedCount++;
          }
        }

        // Подтверждаем получение в Redis
        const idsToAck = incoming.map((i) => i.id);
        await ackInbox(idsToAck);

        if (addedCount > 0) {
          addToast({
            type: 'success',
            message: `${addedCount} ${addedCount === 1 ? 'новый лид' : 'новых лидов'} из Telegram добавлен в воронку!`,
          });
        }
      } catch {
        // Ошибка сети или отсутствие сессии
      }
    };

    checkInbox();
    const interval = setInterval(checkInbox, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [addLead, addToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts inside text inputs or textareas
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        if (location.pathname !== '/finder') {
          navigate('/finder');
        }
        // Focus first search input if available
        setTimeout(() => {
          const input = document.querySelector('input[type="text"]') as HTMLInputElement;
          input?.focus();
        }, 100);
        return;
      }

      if (isInput) return;

      const now = Date.now();
      if (e.key === 'g') {
        setLastKeyPressed({ key: 'g', time: now });
        return;
      }

      if (lastKeyPressed && lastKeyPressed.key === 'g' && now - lastKeyPressed.time < 1200) {
        if (e.key === 'd') {
          e.preventDefault();
          navigate('/');
        } else if (e.key === 'f') {
          e.preventDefault();
          navigate('/finder');
        } else if (e.key === 'v') {
          e.preventDefault();
          navigate('/vacancies');
        } else if (e.key === 'c') {
          e.preventDefault();
          navigate('/sources');
        } else if (e.key === 'l') {
          e.preventDefault();
          navigate('/leads');
        } else if (e.key === 't') {
          e.preventDefault();
          navigate('/templates');
        } else if (e.key === 's') {
          e.preventDefault();
          navigate('/settings');
        }
        setLastKeyPressed(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, location.pathname, lastKeyPressed]);

  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-bg text-text antialiased">
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-bg text-text antialiased">
      {/* Left Sidebar */}
      <Sidebar
        onOpenShortcuts={() => setShortcutsOpen(true)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-[240px] min-w-0 min-h-screen">
        <Topbar
          onToggleMobile={() => setMobileSidebarOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />

        {hasChunkError && (
          <div className="bg-accent/20 border-b border-accent/40 text-text px-4 py-2.5 flex items-center justify-between gap-3 text-xs z-50">
            <span>Доступна новая версия приложения. Обновите страницу, чтобы загрузить обновления.</span>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-accent text-white rounded font-medium flex items-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
            >
              <RefreshCw size={13} />
              Обновить
            </button>
          </div>
        )}

        <main className="flex-1 pb-16">
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/finder" element={<Finder />} />
              <Route path="/vacancies" element={<Vacancies />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Global Notifications and Shortcuts Modal */}
      <ToastContainer />
      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};
