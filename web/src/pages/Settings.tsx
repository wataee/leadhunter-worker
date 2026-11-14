import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useLeadsStore } from '../store/leadsStore';
import { useVacanciesStore } from '../store/vacanciesStore';
import { useTemplatesStore } from '../store/templatesStore';
import { useToastStore } from '../store/toastStore';
import { checkApiHealth, HealthStatus } from '../lib/api';
import { exportLeadsToCsv } from '../lib/csv';
import { Modal } from '../components/Modal';
import {
  Settings as SettingsIcon,
  User,
  Target,
  Key,
  Database,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const {
    profile,
    dailyGoal,
    followUpIntervals,
    duplicateToTelegram,
    autoRefreshInterval,
    soundEnabled,
    notificationsEnabled,
    useAiQualification,
    aiTopNCount,
    setUseAiQualification,
    setAiTopNCount,
    updateProfile,
    setDailyGoal,
    setFollowUpIntervals,
    setDuplicateToTelegram,
    setAutoRefreshInterval,
    setSoundEnabled,
    setNotificationsEnabled,
    resetQuota,
  } = useSettingsStore();

  const { leads, clearAllLeads, importLeads } = useLeadsStore();
  const { templates, setTemplates } = useTemplatesStore();
  const { clearAllVacancies } = useVacanciesStore();
  const addToast = useToastStore((s) => s.addToast);

  const evaluatedLeadsCount = leads.filter((l) => l.aiScore !== undefined).length;

  const [health, setHealth] = useState<HealthStatus>({
    youtube: false,
    telegram: false,
    ai: false,
  });
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);

  useEffect(() => {
    checkHealth();
  }, []);

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

  const handleExportJson = () => {
    const backupData = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      leads,
      templates,
      settings: {
        profile,
        dailyGoal,
        followUpIntervals,
        duplicateToTelegram,
        autoRefreshInterval,
        soundEnabled,
        notificationsEnabled,
        useAiQualification,
        aiTopNCount,
      },
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadhunter_backup_v2_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    addToast({
      type: 'success',
      title: 'Резервная копия создана (v2)',
      message: `Выгружено ${leads.length} лидов, ${templates.length} шаблонов и все настройки.`,
    });
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Некорректный JSON');
        }

        let importedLeadsCount = 0;
        let importedTemplatesCount = 0;

        // 1. Leads
        if (Array.isArray(parsed.leads)) {
          importLeads(parsed.leads);
          importedLeadsCount = parsed.leads.length;
        }

        // 2. Templates (v2)
        if (Array.isArray(parsed.templates)) {
          setTemplates(parsed.templates);
          importedTemplatesCount = parsed.templates.length;
        }

        // 3. Settings (handles both v2 format and flat v1 format)
        const cfg = parsed.settings || parsed;
        if (cfg.profile) updateProfile(cfg.profile);
        if (typeof cfg.dailyGoal === 'number') setDailyGoal(cfg.dailyGoal);
        if (Array.isArray(cfg.followUpIntervals)) setFollowUpIntervals(cfg.followUpIntervals);
        if (typeof cfg.duplicateToTelegram === 'boolean') setDuplicateToTelegram(cfg.duplicateToTelegram);
        if (typeof cfg.autoRefreshInterval === 'number') setAutoRefreshInterval(cfg.autoRefreshInterval);
        if (typeof cfg.soundEnabled === 'boolean') setSoundEnabled(cfg.soundEnabled);
        if (typeof cfg.notificationsEnabled === 'boolean') setNotificationsEnabled(cfg.notificationsEnabled);
        if (typeof cfg.useAiQualification === 'boolean') setUseAiQualification(cfg.useAiQualification);
        if (typeof cfg.aiTopNCount === 'number') setAiTopNCount(cfg.aiTopNCount);

        addToast({
          type: 'success',
          title: 'Данные успешно импортированы',
          message: `Восстановлено: ${importedLeadsCount} лидов, ${importedTemplatesCount} шаблонов и конфигурация.`,
        });
      } catch {
        addToast({
          type: 'error',
          title: 'Ошибка импорта',
          message: 'Не удалось прочитать JSON файл резервной копии.',
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearAllConfirm = () => {
    clearAllLeads();
    clearAllVacancies();
    resetQuota();
    setClearModalOpen(false);
    addToast({
      type: 'info',
      title: 'Данные очищены',
      message: 'Хранилище браузера успешно очищено.',
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-text flex items-center gap-2">
          <SettingsIcon size={22} className="text-accent" />
          <span>Настройки LeadHunter</span>
        </h1>
        <p className="text-xs md:text-sm text-text-muted mt-0.5">
          Конфигурация профиля видеомонтажёра, нормы касаний и статуса API-ключей.
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-surface rounded-card p-6 border border-border space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <User size={18} className="text-accent" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-text">
            Профиль видеомонтажёра
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Ваше имя (для подстановки в сообщения)
            </label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text focus:outline-none focus:border-accent"
              placeholder="Тимур"
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Специализация / УТП
            </label>
            <input
              type="text"
              value={profile.specialization}
              onChange={(e) => updateProfile({ specialization: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text focus:outline-none focus:border-accent"
              placeholder="Динамичный YouTube-монтаж (MrBeast / Vox style)"
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Telegram username
            </label>
            <input
              type="text"
              value={profile.telegram}
              onChange={(e) => updateProfile({ telegram: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text font-mono focus:outline-none focus:border-accent"
              placeholder="@editor_timur"
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Ссылка на портфолио
            </label>
            <input
              type="text"
              value={profile.portfolioUrl}
              onChange={(e) => updateProfile({ portfolioUrl: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text font-mono focus:outline-none focus:border-accent"
              placeholder="https://fleur-editor.netlify.app/ru/"
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Email для связи
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => updateProfile({ email: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text font-mono focus:outline-none focus:border-accent"
              placeholder="editor.timur@gmail.com"
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Ссылка на сэмпл (ре-эдит для огнемёта)
            </label>
            <input
              type="text"
              value={profile.sampleUrl}
              onChange={(e) => updateProfile({ sampleUrl: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text font-mono focus:outline-none focus:border-accent"
              placeholder="https://youtu.be/sample_edit"
            />
          </div>

          {/* Min Rate and Currency */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-text-muted mb-1 font-medium">
                Мин. ставка (за проект / ролик)
              </label>
              <input
                type="number"
                min="0"
                step="500"
                value={profile.minRate ?? 3000}
                onChange={(e) => updateProfile({ minRate: Number(e.target.value) || 0 })}
                className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text focus:outline-none focus:border-accent font-mono"
                placeholder="3000"
              />
            </div>
            <div>
              <label className="block text-text-muted mb-1 font-medium">
                Валюта ставки
              </label>
              <select
                value={profile.minRateCurrency ?? 'RUB'}
                onChange={(e) => updateProfile({ minRateCurrency: e.target.value as 'RUB' | 'USD' })}
                className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text focus:outline-none focus:border-accent"
              >
                <option value="RUB">RUB (₽)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Formats and Skills */}
        <div className="pt-2 border-t border-border space-y-3 text-xs">
          <div>
            <label className="block text-text-muted mb-1.5 font-medium">
              Целевые форматы видео
            </label>
            <div className="flex flex-wrap gap-2">
              {(['YouTube', 'Shorts/Reels', 'Подкасты', 'Реклама'] as const).map((fmt) => {
                const currentFormats = profile.formats || ['YouTube', 'Shorts/Reels', 'Подкасты'];
                const isSelected = currentFormats.includes(fmt);
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      const updated = isSelected
                        ? currentFormats.filter((f) => f !== fmt)
                        : [...currentFormats, fmt];
                      updateProfile({ formats: updated });
                    }}
                    className={`px-3 py-1.5 rounded-control text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-surface-2 border-border text-text-muted hover:border-accent/40'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}{fmt}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-text-muted mb-1.5 font-medium">
              Используемый софт и навыки (для скоринга вакансий)
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                'Premiere Pro',
                'After Effects',
                'DaVinci Resolve',
                'CapCut',
                'Blender',
                'Photoshop',
                'Final Cut Pro',
              ].map((skill) => {
                const currentSkills = profile.skills || ['Premiere Pro', 'After Effects', 'DaVinci Resolve', 'CapCut'];
                const isSelected = currentSkills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => {
                      const updated = isSelected
                        ? currentSkills.filter((s) => s !== skill)
                        : [...currentSkills, skill];
                      updateProfile({ skills: updated });
                    }}
                    className={`px-3 py-1.5 rounded-control text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-surface-2 border-border text-text-muted hover:border-accent/40'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}{skill}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Target & Follow-ups */}
      <div className="bg-surface rounded-card p-6 border border-border space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Target size={18} className="text-warning" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-text">
            План отправки и график повторных сообщений
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Дневная норма отправки сообщений (в день)
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(Math.max(1, Number(e.target.value)))}
              className="w-full bg-surface-2 border border-border rounded-control p-2.5 text-text font-mono focus:outline-none focus:border-accent"
            />
            <p className="text-[11px] text-muted mt-1">
              Рекомендуемая норма: 15–20 персонализированных сообщений в день.
            </p>
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-medium">
              Интервалы между повторными сообщениями (дней)
            </label>
            <div className="flex items-center gap-2">
              {followUpIntervals.map((val, idx) => (
                <div key={idx} className="flex-1">
                  <span className="text-[10px] text-muted block mb-0.5">
                    Касание #{idx + 1}:
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={val}
                    onChange={(e) => {
                      const copy = [...followUpIntervals];
                      copy[idx] = Number(e.target.value);
                      setFollowUpIntervals(copy);
                    }}
                    className="w-full bg-surface-2 border border-border rounded-control p-2 text-text font-mono text-center"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-1">
              По умолчанию: через 2 дня, еще через 2 дня, затем через 3 дня.
            </p>
          </div>
        </div>
      </div>

      {/* AI Qualification Section */}
      <div className="bg-surface rounded-card p-6 border border-border space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-accent" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-text">
                ИИ-модель и автоматический скоринг
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Автоматическая квалификация каналов: выявление болей, проверка монетизации и генерация первой строки.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Использовать ИИ:</span>
            <button
              type="button"
              onClick={() => setUseAiQualification(!useAiQualification)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                useAiQualification ? 'bg-accent justify-end' : 'bg-surface-2 border border-border justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow" />
            </button>
          </div>
        </div>

        {/* Stats & Batch settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 bg-surface-2/40 rounded-card border border-border flex items-center justify-between">
            <div>
              <span className="text-[11px] text-muted block">Оценено лидов через ИИ</span>
              <span className="font-mono text-lg font-bold text-text mt-0.5 block">
                {evaluatedLeadsCount} <span className="text-xs font-normal text-muted">каналов</span>
              </span>
            </div>
            <div className="p-2.5 rounded-full bg-accent-soft text-accent">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="p-3.5 bg-surface-2/40 rounded-card border border-border space-y-1.5">
            <label className="text-[11px] text-muted block font-medium">
              Топ-N каналов для авто-скоринга в Finder
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={100}
                value={aiTopNCount}
                onChange={(e) => setAiTopNCount(Math.max(1, Number(e.target.value)))}
                className="w-24 bg-surface border border-border rounded-control px-2.5 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent"
              />
              <span className="text-[11px] text-text-muted">
                каналов пачками по 5 (с паузой 2 сек)
              </span>
            </div>
          </div>
        </div>

        {/* AI Providers Status */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-text uppercase tracking-wider block">
            Статус AI-провайдеров (цепочка fallback)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Gemini */}
            <div className="p-3.5 bg-surface-2/40 rounded-card border border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">1. Google Gemini</span>
                {health.providers?.gemini ? (
                  <CheckCircle2 size={16} className="text-success" />
                ) : (
                  <AlertCircle size={16} className="text-muted" />
                )}
              </div>
              <div className="text-[11px] text-muted leading-relaxed">
                {health.providers?.gemini ? (
                  <span className="text-success font-medium">GEMINI_API_KEY активен</span>
                ) : (
                  <span>GEMINI_API_KEY не задан</span>
                )}
              </div>
              <div className="text-[10px] text-muted font-mono truncate">
                Модель: {health.models?.gemini || 'gemini-3.8-flash'}
              </div>
            </div>

            {/* Groq */}
            <div className="p-3.5 bg-surface-2/40 rounded-card border border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">2. Groq (Fallback)</span>
                {health.providers?.groq ? (
                  <CheckCircle2 size={16} className="text-success" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted" />
                )}
              </div>
              <div className="text-[11px] text-muted leading-relaxed">
                {health.providers?.groq ? (
                  <span className="text-success font-medium">GROQ_API_KEY активен</span>
                ) : (
                  <span>GROQ_API_KEY не задан</span>
                )}
              </div>
              <div className="text-[10px] text-muted font-mono truncate">
                Модель: {health.models?.groq || 'llama-3.3-70b-versatile'}
              </div>
            </div>

            {/* OpenRouter */}
            <div className="p-3.5 bg-surface-2/40 rounded-card border border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">3. OpenRouter</span>
                {health.providers?.openrouter ? (
                  <CheckCircle2 size={16} className="text-success" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted" />
                )}
              </div>
              <div className="text-[11px] text-muted leading-relaxed">
                {health.providers?.openrouter ? (
                  <span className="text-success font-medium">OPENROUTER_API_KEY активен</span>
                ) : (
                  <span>OPENROUTER_API_KEY не задан</span>
                )}
              </div>
              <div className="text-[10px] text-muted font-mono truncate">
                Модель: {health.models?.openrouter || 'meta-llama/llama-3.3-70b-instruct:free'}
              </div>
            </div>
          </div>
        </div>

        {/* Guidance if no AI key configured */}
        {!health.providers?.gemini && !health.providers?.groq && !health.providers?.openrouter && (
          <div className="p-3.5 bg-warning-soft/15 border border-warning/30 rounded-card text-xs text-text-muted space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-warning">
              <AlertCircle size={14} />
              <span>Ни один ключ AI-провайдера не настроен</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Для включения функции ИИ-квалификации добавьте переменные окружения в панели Netlify (Site configuration &gt; Environment variables):
            </p>
            <ul className="list-disc list-inside text-[11px] space-y-0.5 font-mono text-text">
              <li>GEMINI_API_KEY (Google AI Studio — бесплатный)</li>
              <li>GROQ_API_KEY (Groq Cloud — быстрый бесплатный)</li>
              <li>OPENROUTER_API_KEY (OpenRouter :free)</li>
            </ul>
          </div>
        )}
      </div>

      {/* API Health & Environment Status */}
      <div className="bg-surface rounded-card p-6 border border-border space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-info" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">
              Статус подключения API (Netlify Environment)
            </h2>
          </div>
          <button
            onClick={checkHealth}
            disabled={isCheckingHealth}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {isCheckingHealth ? 'Проверяю...' : 'Проверить снова'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* YouTube API */}
          <div className="p-3.5 bg-surface-2/40 rounded-card border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text">YouTube Data API v3</span>
              {health.youtube ? (
                <CheckCircle2 size={16} className="text-success" />
              ) : (
                <AlertCircle size={16} className="text-warning" />
              )}
            </div>
            <div className="text-[11px] text-muted leading-relaxed">
              {health.youtube ? (
                <span className="text-success font-medium">Ключ YOUTUBE_API_KEY активен</span>
              ) : (
                <span className="text-warning">
                  Не настроен. Добавьте в Netlify Environment Variables.
                </span>
              )}
            </div>
          </div>

          {/* Telegram Notifications */}
          <div className="p-3.5 bg-surface-2/40 rounded-card border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text">Telegram Bot Alerts</span>
              {health.telegram ? (
                <CheckCircle2 size={16} className="text-success" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-muted" />
              )}
            </div>
            <div className="text-[11px] text-muted leading-relaxed">
              {health.telegram ? (
                <span className="text-success font-medium">Бот подключён</span>
              ) : (
                <span>Опционально (TELEGRAM_BOT_TOKEN и CHAT_ID)</span>
              )}
            </div>
          </div>

          {/* AI Rewrite */}
          <div className="p-3.5 bg-surface-2/40 rounded-card border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text">Claude AI Rewrite</span>
              {health.ai ? (
                <CheckCircle2 size={16} className="text-success" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-muted" />
              )}
            </div>
            <div className="text-[11px] text-muted leading-relaxed">
              {health.ai ? (
                <span className="text-success font-medium">ANTHROPIC_API_KEY активен</span>
              ) : (
                <span>Опционально (кнопка AI рерайтера)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-surface rounded-card p-6 border border-border space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Database size={18} className="text-accent" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-text">
            Управление данными и резервное копирование
          </h2>
        </div>

        <p className="text-xs text-text-muted leading-relaxed">
          Все ваши лиды, заметки и настройки хранятся локально в вашем браузере. Вы можете экспортировать их в файл или восстановить в один клик.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border text-xs font-semibold transition-colors"
          >
            <Download size={14} />
            <span>Экспорт полного JSON</span>
          </button>

          <label className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border text-xs font-semibold transition-colors cursor-pointer">
            <Upload size={14} />
            <span>Импорт JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />
          </label>

          <button
            onClick={() => exportLeadsToCsv(leads)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-2 hover:bg-surface-3 text-text rounded-control border border-border text-xs font-semibold transition-colors"
          >
            <Download size={14} />
            <span>Экспорт лидов в CSV</span>
          </button>

          <button
            onClick={() => setClearModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-danger-soft text-danger hover:bg-danger/20 rounded-control border border-danger/30 text-xs font-semibold transition-colors ml-auto"
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
        maxWidth="md"
        title="Подтверждение удаления"
        footer={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setClearModalOpen(false)}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text"
            >
              Отмена
            </button>
            <button
              onClick={handleClearAllConfirm}
              className="px-4 py-1.5 bg-danger hover:bg-danger/90 text-white text-xs font-semibold rounded-control"
            >
              Да, удалить всё
            </button>
          </div>
        }
      >
        <p className="text-xs text-text-muted leading-relaxed">
          Вы уверены, что хотите удалить всех лидов, историю касаний и сохранённые вакансии? Это действие нельзя будет отменить, если вы предварительно не сделали экспорт в JSON.
        </p>
      </Modal>
    </div>
  );
};
