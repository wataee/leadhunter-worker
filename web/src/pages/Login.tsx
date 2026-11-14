import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { loginWithPassword } from '../lib/api';

export const Login: React.FC = () => {
  const navigate = useNavigate();
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
      navigate('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка авторизации';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 selection:bg-accent selection:text-white">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-accent/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* Logo / Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/15 border border-accent/30 text-accent mb-2">
              <Lock size={22} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text">LeadHunter</h1>
            <p className="text-sm text-text-muted">
              Вход в личный кабинет поиска заказов и вакансий монтажа
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-control bg-error/10 border border-error/25 text-error text-xs"
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
                className="block text-xs font-medium text-text-muted"
              >
                Пароль администратора
              </label>
              <input
                id="app-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
                required
                className="w-full px-3.5 py-2.5 bg-surface-2 border border-border focus:border-accent rounded-control text-sm text-text placeholder-text-muted/40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full h-11 flex items-center justify-center gap-2 px-4 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-control shadow-subtle transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Вход...</span>
                </>
              ) : (
                <>
                  <span>Войти в систему</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="pt-2 border-t border-border/60 text-center text-[11px] text-text-muted flex items-center justify-center gap-1.5">
            <Sparkles size={12} className="text-accent" />
            <span>Однопользовательский защищённый доступ</span>
          </div>
        </div>
      </div>
    </div>
  );
};
