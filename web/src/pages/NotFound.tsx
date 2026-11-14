import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, AlertCircle } from 'lucide-react';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 text-accent">
        <AlertCircle size={32} />
      </div>
      <h1 className="text-3xl font-bold text-text mb-2">404 — Страница не найдена</h1>
      <p className="text-sm text-text-muted max-w-md mb-6">
        Запрашиваемый адрес не существует или был перемещён. Проверьте правильность ссылки или вернитесь к поиску лидов.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text text-xs font-semibold rounded-control border border-border transition-colors min-h-[44px]"
        >
          <ArrowLeft size={16} />
          <span>Назад</span>
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control shadow-subtle transition-colors min-h-[44px]"
        >
          <Home size={16} />
          <span>На главную</span>
        </button>
      </div>
    </div>
  );
};
