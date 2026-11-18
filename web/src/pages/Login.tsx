import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import { loginWithPassword } from '../lib/api';

export const Login: React.FC = () => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setError(null);
    setLoading(true);

    try {
      await loginWithPassword(password.trim());
      // Полная замена локации гарантирует мгновенную инициализацию сессии и отсутствие черного экрана
      window.location.replace('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка авторизации';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 selection:bg-accent selection:text-white">
      <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-7 shadow-2xl relative">
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="font-mono text-[11px] tracking-wider text-text-muted uppercase">LEADHUNTER // AUTH</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                ONLINE
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-text">Вход в панель</h1>
            <p className="text-xs text-text-muted leading-relaxed">
              Мониторинг заказов и вакансий видеомонтажа (EU / US / KZ).
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded bg-error/10 border border-error/25 text-error text-xs"
            >
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="app-password"
                className="block font-mono text-[11px] uppercase tracking-wider text-text-muted"
              >
                Пароль доступа
              </label>
              <input
                id="app-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
                required
                className="w-full px-3.5 py-2.5 bg-surface-2 border border-border focus:border-accent rounded text-sm text-text placeholder-text-muted/40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold uppercase tracking-wider rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Проверка пароля...</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Войти в систему</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="pt-2 border-t border-border text-center font-mono text-[11px] text-text-muted flex items-center justify-center gap-1.5">
            <ShieldCheck size={13} className="text-accent" />
            <span>Защищённый рабочий сеанс</span>
          </div>
        </div>
      </div>
    </div>
  );
};
