import React, { useState } from 'react';
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
      window.location.replace('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Неверный пароль';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 selection:bg-accent selection:text-bg">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        {error && (
          <div
            role="alert"
            className="text-xs text-danger text-center py-2 px-3 rounded-control bg-surface-2 border border-border"
          >
            {error}
          </div>
        )}

        <input
          id="app-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          autoFocus
          required
          className="w-full h-10 px-3 bg-surface border border-border focus:border-text rounded-control text-sm text-text placeholder-text-muted transition-colors focus:outline-none"
        />

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="w-full h-10 flex items-center justify-center px-4 bg-text hover:bg-white text-bg text-xs font-semibold uppercase tracking-wider rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'ПРОВЕРКА...' : 'ВОЙТИ В СИСТЕМУ'}
        </button>
      </form>
    </div>
  );
};
