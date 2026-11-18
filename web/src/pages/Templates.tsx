import React, { useState } from 'react';
import { useTemplatesStore } from '../store/templatesStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { TemplateType } from '../types';
import {
  substituteVariables,
  analyzePitchQuality,
} from '../lib/templates';
import { rewritePitchWithAi } from '../lib/api';
import {
  Plus,
  Copy,
  Trash2,
  Sparkles,
  RotateCcw,
  Eye,
} from 'lucide-react';

export const Templates: React.FC = () => {
  const {
    templates,
    addTemplate,
    updateTemplate,
    duplicateTemplate,
    deleteTemplate,
    resetToDefaults,
  } = useTemplatesStore();

  const profile = useSettingsStore((s) => s.profile);
  const addToast = useToastStore((s) => s.addToast);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || ''
  );
  const [filterType, setFilterType] = useState<string>('all');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Active template
  const activeTemplate =
    templates.find((t) => t.id === selectedTemplateId) || templates[0];

  // Dummy lead for live preview
  const dummyLead = {
    name: 'Алексей Смирнов',
    channelUrl: 'https://youtube.com/@smirnov_realty',
    lastVideo: {
      title: 'ТОП-5 районов Дубая для инвестиций в 2026',
      url: 'https://youtube.com/watch?v=sample',
      publishedAt: new Date().toISOString(),
    },
    findings: [
      { id: '1', timecode: '01:25', note: 'статичная таблица висит 8 секунд без зума' },
    ],
  };

  const previewText = activeTemplate
    ? substituteVariables(activeTemplate.body, dummyLead as any, profile)
    : '';

  const quality = analyzePitchQuality(previewText);

  const handleCreateNew = () => {
    addTemplate({
      title: 'Новый шаблон сообщения',
      type: 'direct',
      body: 'Привет! Увидел вакансию на монтаж. Мое портфолио: {ссылка_портфолио}. Могу сделать тестовый фрагмент на 30 секунд сегодня. Актуально?',
    });
    addToast({ type: 'success', message: 'Новый шаблон создан' });
  };

  const handleAiOptimize = async () => {
    if (!activeTemplate) return;
    setIsAiLoading(true);
    try {
      const res = await rewritePitchWithAi({
        text: activeTemplate.body,
      });
      if (res.rewritten) {
        updateTemplate(activeTemplate.id, { body: res.rewritten });
        addToast({
          type: 'success',
          title: 'Шаблон улучшен AI',
          message: 'Текст стал короче, конкретнее и без лести.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка AI';
      addToast({
        type: 'error',
        title: 'AI рерайтер недоступен',
        message: msg.includes('ANTHROPIC_API_KEY')
          ? 'Укажите ANTHROPIC_API_KEY в переменных окружения Netlify.'
          : msg,
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const filteredTemplates = templates.filter((t) =>
    filterType === 'all' ? true : t.type === filterType
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text">
            Шаблоны сообщений
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-muted hover:text-text rounded-control border border-border text-xs transition-colors"
          >
            <RotateCcw size={13} />
            <span>Сбросить к исходным</span>
          </button>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control shadow-subtle transition-colors"
          >
            <Plus size={14} />
            <span>+ Создать шаблон</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Templates List & Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Template Selector & Types (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          {/* Type filter */}
          <div className="bg-surface rounded-card p-3 border border-border">
            <label className="block text-[11px] text-muted mb-1 font-semibold uppercase tracking-wider">
              Категория
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-surface-2 border border-border text-text text-xs rounded-control px-2.5 py-1.5 focus:outline-none"
            >
              <option value="all">Все шаблоны ({templates.length})</option>
              <option value="direct">Отклик в Telegram</option>
              <option value="youtube">YouTube</option>
              <option value="shorts">Reels / Shorts</option>
              <option value="podcast">Подкасты</option>
              <option value="test">Тестовый монтаж</option>
              <option value="audit">Идея по видео</option>
              <option value="en_youtube">English: YouTube</option>
              <option value="en_shorts">English: Shorts</option>
              <option value="followup_1">Напоминание (Follow-up)</option>
              <option value="followup_2">Финальное напоминание</option>
            </select>
          </div>

          {/* Templates List */}
          <div className="space-y-2">
            {filteredTemplates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => setSelectedTemplateId(tpl.id)}
                className={`p-3.5 rounded-card border cursor-pointer transition-all ${
                  selectedTemplateId === tpl.id
                    ? 'bg-surface-2 border-text/40 shadow-sm'
                    : 'bg-surface hover:bg-surface-2 border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-text truncate">
                      {tpl.title}
                    </h3>
                  </div>
                  {tpl.isCustom && (
                    <span className="text-[9px] bg-surface-2 text-muted px-1.5 py-0.2 rounded border border-border">
                      Свой
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted line-clamp-2 mt-1.5 leading-relaxed">
                  {tpl.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Editor & Live Preview (8 cols) */}
        {activeTemplate && (
          <div className="lg:col-span-8 space-y-5">
            {/* Editor Card */}
            <div className="bg-surface rounded-card p-5 border border-border space-y-4">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
                <div className="flex-1 max-w-sm">
                  <input
                    type="text"
                    value={activeTemplate.title}
                    onChange={(e) =>
                      updateTemplate(activeTemplate.id, { title: e.target.value })
                    }
                    className="w-full bg-surface-2 border border-border text-text text-sm font-bold rounded-control px-3 py-1.5 focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={activeTemplate.type}
                    onChange={(e) =>
                      updateTemplate(activeTemplate.id, {
                        type: e.target.value as TemplateType,
                      })
                    }
                    className="bg-surface-2 border border-border text-text text-xs rounded-control px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="direct">Отклик в Telegram</option>
                    <option value="youtube">YouTube</option>
                    <option value="shorts">Reels / Shorts</option>
                    <option value="podcast">Подкасты</option>
                    <option value="test">Тестовый монтаж</option>
                    <option value="audit">Идея по видео</option>
                    <option value="en_youtube">English: YouTube</option>
                    <option value="en_shorts">English: Shorts</option>
                    <option value="followup_1">Напоминание (Follow-up)</option>
                    <option value="followup_2">Финальное напоминание</option>
                  </select>

                  <button
                    onClick={() => duplicateTemplate(activeTemplate.id)}
                    title="Дублировать шаблон"
                    className="p-1.5 text-muted hover:text-text rounded hover:bg-surface-2 border border-border"
                  >
                    <Copy size={14} />
                  </button>

                  {templates.length > 1 && (
                    <button
                      onClick={() => deleteTemplate(activeTemplate.id)}
                      title="Удалить шаблон"
                      className="p-1.5 text-muted hover:text-danger rounded hover:bg-surface-2 border border-border"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Variables helper pills */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted font-medium">
                  Кликните, чтобы вставить переменную:
                </span>
                <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                  {[
                    '{имя}',
                    '{канал}',
                    '{тема_ролика}',
                    '{таймкод}',
                    '{проблема}',
                    '{ссылка_портфолио}',
                    '{ссылка_сэмпла}',
                    '{моё_имя}',
                    '{моя_специализация}',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        updateTemplate(activeTemplate.id, {
                          body: `${activeTemplate.body} ${v}`,
                        })
                      }
                      className="px-2 py-0.5 rounded bg-surface-2 text-accent hover:bg-accent-soft border border-border/80 text-[11px] transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text">
                    Тело шаблона
                  </label>
                  <button
                    onClick={handleAiOptimize}
                    disabled={isAiLoading}
                    className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-semibold disabled:opacity-50"
                  >
                    <Sparkles size={13} className={isAiLoading ? 'animate-spin' : ''} />
                    <span>{isAiLoading ? 'Оптимизирую...' : 'Улучшить через AI'}</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={activeTemplate.body}
                  onChange={(e) =>
                    updateTemplate(activeTemplate.id, { body: e.target.value })
                  }
                  className="w-full bg-surface-2 text-text text-sm rounded-control border border-border p-3 focus:outline-none focus:border-accent font-sans leading-relaxed"
                />
              </div>
            </div>

            {/* Live Preview Card */}
            <div className="bg-surface rounded-card p-5 border border-border space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Eye size={16} className="text-accent" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text">
                    Живой предпросмотр (с тестовыми данными)
                  </h3>
                </div>

                <div className="text-xs font-mono">
                  Символов:{' '}
                  <span
                    className={
                      quality.isTooLong ? 'text-danger font-bold' : 'text-accent font-bold'
                    }
                  >
                    {quality.length} / 450
                  </span>
                </div>
              </div>

              {/* Telegram Preview Bubble */}
              <div className="p-4 bg-surface-2/80 rounded-card border border-border text-sm text-text leading-relaxed whitespace-pre-wrap font-sans select-text">
                {previewText}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
