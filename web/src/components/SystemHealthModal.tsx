import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { fetchHealth, HealthStatus } from '../lib/api';
import { formatRelativeTime } from '../lib/time';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  Server,
  Bot,
  Database,
  Zap,
} from 'lucide-react';

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WorkerDiagnostics {
  running: boolean;
  uptimeSec?: number;
  lastPingMs?: number;
  message?: string;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [workerInfo, setWorkerInfo] = useState<WorkerDiagnostics | null>(null);
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);

  const checkAll = async () => {
    setLoading(true);
    const start = performance.now();

    try {
      const h = await fetchHealth();
      setHealth(h);
      const latency = Math.round(performance.now() - start);
      setApiLatencyMs(latency);

      // D3: Check real worker health via /api/tg-feed ping
      const feedRes = await fetch('/api/tg-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping' }),
      }).catch(() => null);

      let isWorkerActive = false;
      if (feedRes && feedRes.ok) {
        const feedData = await feedRes.json().catch(() => null);
        isWorkerActive = Boolean(feedData?.workerActive);
      }

      const isOnline = isWorkerActive || h.worker?.status === 'ok';

      setWorkerInfo({
        running: isOnline,
        uptimeSec: h.worker?.uptimeSeconds,
        lastPingMs: Date.now(),
        message: isOnline ? undefined : (h.worker?.message || 'Воркер не отвечает на пинг'),
      });
    } catch {
      setWorkerInfo({ running: false, message: 'Ошибка связи с сервером' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkAll();
    }
  }, [isOpen]);

  const isWorkerOffline = workerInfo && !workerInfo.running;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Диагностика: Всё ли работает?">
      <div className="space-y-5 text-text">
        {/* Worker Alert if offline */}
        {isWorkerOffline && (
          <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-control flex items-start gap-2.5 text-xs text-red-300">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Telegram-воркер не отвечает на запросы</span>
              <span>{workerInfo?.message || 'Проверьте статус сервиса на Render или SESSION_STRING.'}</span>
            </div>
          </div>
        )}

        {/* Diagnostics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Worker Status */}
          <div className="p-3.5 bg-surface-2 rounded-control border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Server size={14} className="text-accent" />
                Telegram Воркер
              </span>
              {workerInfo?.running ? (
                <span className="text-[10px] text-emerald-400 font-mono font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> онлайн
                </span>
              ) : (
                <span className="text-[10px] text-danger font-mono font-medium flex items-center gap-1">
                  <XCircle size={12} /> оффлайн
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted space-y-1 font-mono">
              <div>Пинг: {workerInfo?.lastPingMs ? formatRelativeTime(new Date(workerInfo.lastPingMs).toISOString()) : 'не проверен'}</div>
              <div>Аптайм: {workerInfo?.uptimeSec ? `${Math.floor(workerInfo.uptimeSec / 60)} мин` : (workerInfo?.running ? 'активен' : 'нет связи')}</div>
            </div>
          </div>

          {/* Telegram Bot */}
          <div className="p-3.5 bg-surface-2 rounded-control border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Bot size={14} className="text-accent" />
                Telegram Бот
              </span>
              {health?.telegramBot?.status === 'ok' ? (
                <span className="text-[10px] text-emerald-400 font-mono font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> {health.telegramBot.username || 'подключён'}
                </span>
              ) : health?.telegramBot?.status === 'not_configured' ? (
                <span className="text-[10px] text-muted font-mono font-medium flex items-center gap-1">
                  не настроен
                </span>
              ) : (
                <span className="text-[10px] text-amber-400 font-mono font-medium flex items-center gap-1">
                  <AlertTriangle size={12} /> ошибка токена
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted space-y-1 font-mono">
              <div>Вебхук: {health?.telegramWebhook?.status === 'ok' ? 'установлен' : 'не настроен'}</div>
              <div>Очередь бота: {health?.telegramWebhook?.pendingUpdates ?? 0} шт</div>
            </div>
          </div>

          {/* Upstash Redis */}
          <div className="p-3.5 bg-surface-2 rounded-control border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Database size={14} className="text-accent" />
                База данных (Redis)
              </span>
              {health?.redis?.status === 'ok' ? (
                <span className="text-[10px] text-emerald-400 font-mono font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> {health.redis.latencyMs} мс
                </span>
              ) : health?.redis?.status === 'not_configured' ? (
                <span className="text-[10px] text-muted font-mono font-medium flex items-center gap-1">
                  файловый режим
                </span>
              ) : (
                <span className="text-[10px] text-danger font-mono font-medium flex items-center gap-1">
                  <XCircle size={12} /> сбой сети
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted space-y-1 font-mono">
              <div>Статус: {health?.redis?.status === 'ok' ? 'Upstash Redis активен' : (health?.redis?.message || 'Офлайн')}</div>
              <div>Воронка бота: {health?.redis?.status === 'ok' ? 'подключена' : 'память'}</div>
            </div>
          </div>

          {/* Infrastructure */}
          <div className="p-3.5 bg-surface-2 rounded-control border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Zap size={14} className="text-accent" />
                Инфраструктура Netlify
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-medium flex items-center gap-1">
                <CheckCircle2 size={12} /> 200 OK
              </span>
            </div>
            <div className="text-[11px] text-muted space-y-1 font-mono">
              <div>Задержка API: {apiLatencyMs ? `${apiLatencyMs} мс` : 'быстро'}</div>
              <div>Авторизация: {health?.config?.authConfigured ? 'настроена' : 'не настроена'}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <button
            type="button"
            onClick={checkAll}
            disabled={loading}
            className="px-3.5 py-1.5 bg-surface-2 hover:bg-surface-3 text-text text-xs font-medium rounded-control flex items-center gap-1.5 transition-colors"
          >
            <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
            Перепроверить
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  );
};
