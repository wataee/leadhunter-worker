import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useLeadsStore } from '../store/leadsStore';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useToastStore } from '../store/toastStore';
import { checkApiHealth, HealthStatus, rewritePitchWithAi } from '../lib/api';
import { exportLeadsToCsv } from '../lib/csv';
import { Modal } from '../components/Modal';
import {
  User,
  Bell,
  Link as LinkIcon,
  Database,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const {
    profile,
    updateProfile,
    duplicateToTelegram,
    setDuplicateToTelegram,
    soundEnabled,
    setSoundEnabled,
    notificationsEnabled,
    setNotificationsEnabled,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
    setQuietHours,
    customAiApiKey,
    setCustomAiApiKey,
  } = useSettingsStore();

  const { leads, clearAllLeads } = useLeadsStore();
  const { clearAllVacancies } = useVacanciesStore();
  const addToast = useToastStore((s) => s.addToast);

  const [health, setHealth] = useState<HealthStatus>({
    youtube: false,
    telegram: false,
    ai: false,
  });
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);

  // Form profile state
  const [name, setName] = useState(profile.name || '');
  const [specialization, setSpecialization] = useState(profile.specialization || '');
  const [portfolioUrl, setPortfolioUrl] = useState(profile.portfolioUrl || '');
  const [telegram, setTelegram] = useState(profile.telegram || '');
  const [minRate, setMinRate] = useState(profile.minRate ? String(profile.minRate) : '');
  const [skillsStr, setSkillsStr] = useState((profile.skills || []).join(', '));

  const checkHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const h = await checkApiHealth();
      setHealth(h);
    } catch {
      // ignore
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedSkills = skillsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    updateProfile({
      name: name.trim(),
      specialization: specialization.trim() || 'Видеомонтажёр',
      portfolioUrl: portfolioUrl.trim(),
      telegram: telegram.trim(),
      minRate: minRate ? parseInt(minRate, 10) : undefined,
      skills: parsedSkills,
    });

    addToast({
      type: 'success',
      title: 'Профиль сохранён',
      message: 'Данные профиля обновлены для авто-откликов.',
    });
  };

  const handleTestAiKey = async () => {
    setIsTestingKey(true);
    try {
      const res = await rewritePitchWithAi({
        text: 'Привет, я монтажер. Смонтирую тестовый ролик.',
      });
      if (res.rewritten) {
        addToast({ type: 'success', message: 'API-ключ проверен! ИИ отвечает.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка проверки ключа';
      addToast({ type: 'error', message: `Ошибка AI: ${msg}` });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleExportCsv = () => {
    if (leads.length === 0) {
      addToast({ type: 'info', message: 'В воронке нет клиентов для экспорта.' });
      return;
    }
    exportLeadsToCsv(leads);
    addToast({ type: 'success', message: 'CSV файл успешно скачан.' });
  };

  const handleConfirmClear = () => {
    clearAllLeads();
    clearAllVacancies();
    setClearModalOpen(false);
    addToast({
      type: 'info',
      title: 'Данные очищены',
      message: 'Все лиды и кэш вакансий удалены.',
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="pb-3 border-b border-border">
        <h1 className="text-xl md:text-2xl font-bold text-text">Настройки</h1>
      </div>

      {/* 1. Раздел: Профиль */}
      <div className="bg-surface rounded-card p-5 border border-border space-y-4">
        <div className="flex items-center gap-2 text-text font-semibold text-sm">
          <User size={16} className="text-accent" />
          <h2>Профиль видеомонтажёра</h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-text-muted mb-1 font-medium">Ваше имя</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван"
                className="w-full bg-surface-2 text-text rounded-control border border-border px-3 py-2 focus:outline-none focus:border-accent min-h-[38px]"
              />
            </div>

            <div>
              <label className="block text-text-muted mb-1 font-medium">Специализация</label>
              <input
                type="text"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="YouTube-ролики, Reels, подкасты"
                className="w-full bg-surface-2 text-text rounded-control border border-border px-3 py-2 focus:outline-none focus:border-accent min-h-[38px]"
              />
            </div>

            <div>
              <label className="block text-text-muted mb-1 font-medium">Ссылка на портфолио</label>
              <input
                type="text"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://t.me/your_channel или ссылка на диск"
                className="w-full bg-surface-2 text-text rounded-control border border-border px-3 py-2 focus:outline-none focus:border-accent min-h-[38px]"
              />
            </div>

            <div>
              <label className="block text-text-muted mb-1 font-medium">Контакт в Telegram</label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
                className="w-full bg-surface-2 text-text rounded-control border border-border px-3 py-2 focus:outline-none focus:border-accent min-h-[38px]"
              />
            </div>

            <div>
              <label className="block text-text-muted mb-1 font-medium">Минимальная ставка (₽ за ролик)</label>
              <input
                type="number"
                value={minRate}
                onChange={(e) => setMinRate(e.target.value)}
                placeholder="3000"
                className="w-full bg-surface-2 text-text rounded-control border border-border px-3 py-2 focus:outline-none focus:border-accent min-h-[38px]"
              />
            </div>

            <div>
              <label className="block text-text-muted mb-1 font-medium">Стек программ (через запятую)</label>
              <input
                type="text"
                value={skillsStr}
                onChange={(e) => setSkillsStr(e.target.value)}
                placeholder="Premiere Pro, After Effects, DaVinci"
                className="w-full bg-surface-2 text-text rounded-control border border-border px-3 py-2 focus:outline-none focus:border-accent min-h-[38px]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-control font-semibold transition-colors min-h-[36px]"
            >
              Сохранить профиль
            </button>
          </div>
        </form>
      </div>

      {/* 2. Раздел: Уведомления */}
      <div className="bg-surface rounded-card p-5 border border-border space-y-4">
        <div className="flex items-center gap-2 text-text font-semibold text-sm">
          <Bell size={16} className="text-warning" />
          <h2>Уведомления</h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 bg-surface-2/40 rounded-control border border-border">
            <div>
              <div className="font-semibold text-text">Браузерные push-уведомления</div>
              <div className="text-text-muted text-[11px]">Оповещать о новых горячих заказах</div>
            </div>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-accent focus:ring-accent"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-surface-2/40 rounded-control border border-border">
            <div>
              <div className="font-semibold text-text">Звуковой сигнал</div>
              <div className="text-text-muted text-[11px]">Короткий звук при появлении горячей вакансии</div>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-accent focus:ring-accent"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-surface-2/40 rounded-control border border-border">
            <div>
              <div className="font-semibold text-text">Дублировать лиды в личный Telegram</div>
              <div className="text-text-muted text-[11px]">Отправлять уведомления через подключённого бота</div>
            </div>
            <input
              type="checkbox"
              checked={duplicateToTelegram}
              onChange={(e) => setDuplicateToTelegram(e.target.checked)}
              className="w-4 h-4 rounded text-accent focus:ring-accent"
            />
          </div>

          <div className="p-3 bg-surface-2/40 rounded-control border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-text">Тихие часы</div>
                <div className="text-text-muted text-[11px]">Не присылать уведомления в указанное время</div>
              </div>
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHours(e.target.checked, quietHoursStart, quietHoursEnd)}
                className="w-4 h-4 rounded text-accent focus:ring-accent"
              />
            </div>
            {quietHoursEnabled && (
              <div className="flex items-center gap-2 pt-1 font-mono text-xs">
                <span>с</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={quietHoursStart}
                  onChange={(e) => setQuietHours(true, parseInt(e.target.value, 10) || 0, quietHoursEnd)}
                  className="bg-surface px-2 py-1 rounded border border-border text-text w-16"
                />
                <span>до</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={quietHoursEnd}
                  onChange={(e) => setQuietHours(true, quietHoursStart, parseInt(e.target.value, 10) || 0)}
                  className="bg-surface px-2 py-1 rounded border border-border text-text w-16"
                />
                <span>:00</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Раздел: Подключения */}
      <div className="bg-surface rounded-card p-5 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-text font-semibold text-sm">
            <LinkIcon size={16} className="text-emerald-400" />
            <h2>Подключения и API</h2>
          </div>
          <button
            type="button"
            onClick={checkHealth}
            disabled={isCheckingHealth}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text px-2 py-1 rounded border border-border transition-colors disabled:opacity-50"
          >
            <RotateCw size={12} className={isCheckingHealth ? 'animate-spin' : ''} />
            <span>Проверить</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-surface-2/40 rounded-control border border-border flex items-center justify-between">
            <span className="font-medium text-text">Telegram-бот:</span>
            {health.telegram ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle2 size={13} /> Работает
              </span>
            ) : (
              <span className="flex items-center gap-1 text-danger font-semibold">
                <AlertCircle size={13} /> Не отвечает
              </span>
            )}
          </div>

          <div className="p-3 bg-surface-2/40 rounded-control border border-border flex items-center justify-between">
            <span className="font-medium text-text">YouTube API:</span>
            {health.youtube ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle2 size={13} /> Подключён
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning font-semibold">
                <AlertCircle size={13} /> Нет ключа
              </span>
            )}
          </div>

          <div className="p-3 bg-surface-2/40 rounded-control border border-border flex items-center justify-between">
            <span className="font-medium text-text">Gemini AI:</span>
            {health.ai ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle2 size={13} /> Активен
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning font-semibold">
                <AlertCircle size={13} /> Недоступен
              </span>
            )}
          </div>
        </div>

        {/* Custom AI Key input */}
        <div className="pt-2 border-t border-border space-y-2 text-xs">
          <label className="block text-text-muted font-medium">Свой ключ Gemini API (опционально)</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={customAiApiKey || ''}
              onChange={(e) => setCustomAiApiKey(e.target.value.trim())}
              placeholder="AIzaSy..."
              className="flex-1 bg-surface-2 text-text font-mono rounded-control border border-border px-3 py-2 focus:outline-none focus:border-accent min-h-[38px]"
            />
            <button
              type="button"
              onClick={handleTestAiKey}
              disabled={isTestingKey || !customAiApiKey}
              className="px-3.5 py-2 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border font-medium transition-colors disabled:opacity-50 min-h-[38px]"
            >
              {isTestingKey ? 'Проверка...' : 'Проверить'}
            </button>
          </div>
        </div>
      </div>

      {/* 4. Раздел: Данные */}
      <div className="bg-surface rounded-card p-5 border border-border space-y-4">
        <div className="flex items-center gap-2 text-text font-semibold text-sm">
          <Database size={16} className="text-blue-400" />
          <h2>Управление данными</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border font-medium transition-colors min-h-[38px]"
          >
            <Download size={14} />
            <span>Экспорт лидов в CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setClearModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-danger hover:bg-danger/10 rounded-control border border-danger/30 font-medium transition-colors min-h-[38px]"
          >
            <Trash2 size={14} />
            <span>Очистить все данные</span>
          </button>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      <Modal
        isOpen={clearModalOpen}
        onClose={() => setClearModalOpen(false)}
        title="Подтверждение очистки данных"
      >
        <div className="space-y-4 text-xs">
          <p className="text-text-muted leading-relaxed">
            Вы уверены? Это действие безвозвратно удалит всех сохранённых лидов и кэш вакансий из локального хранилища браузера.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setClearModalOpen(false)}
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text rounded border border-border transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleConfirmClear}
              className="px-3.5 py-1.5 bg-danger hover:bg-danger/80 text-white rounded font-semibold transition-colors"
            >
              Да, удалить
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
