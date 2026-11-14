import React from 'react';
import { useToastStore } from '../store/toastStore';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  const icons = {
    success: <CheckCircle2 size={18} className="text-success shrink-0" />,
    error: <AlertCircle size={18} className="text-danger shrink-0" />,
    warning: <AlertTriangle size={18} className="text-warning shrink-0" />,
    info: <Info size={18} className="text-info shrink-0" />,
  };

  const borders = {
    success: 'border-success/30',
    error: 'border-danger/30',
    warning: 'border-warning/30',
    info: 'border-info/30',
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 bg-surface border ${
            borders[toast.type]
          } rounded-card shadow-dropdown animate-fade-in-scale`}
        >
          {icons[toast.type]}
          <div className="flex-1 min-w-0">
            {toast.title && (
              <div className="text-xs font-semibold text-text mb-0.5">
                {toast.title}
              </div>
            )}
            <div className="text-xs text-text-muted leading-relaxed break-words">
              {toast.message}
            </div>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            aria-label="Закрыть уведомление"
            className="text-muted hover:text-text p-1 rounded hover:bg-surface-2 transition-colors -mr-1 -mt-1"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
