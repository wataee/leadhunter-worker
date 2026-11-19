import React, { useState } from 'react';
import { Modal } from './Modal';
import { Calculator, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface RateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  vacancyBudget?: number | null;
  vacancyCurrency?: string | null;
}

export const RateCalculatorModal: React.FC<RateCalculatorModalProps> = ({
  isOpen,
  onClose,
  vacancyBudget,
  vacancyCurrency = 'RUB',
}) => {
  const [durationMin, setDurationMin] = useState(1);
  const [format, setFormat] = useState<'reels' | 'youtube' | 'podcast'>('reels');
  const [motionLevel, setMotionLevel] = useState<'none' | 'light' | 'heavy'>('light');
  const [soundDesign, setSoundDesign] = useState<'basic' | 'advanced'>('basic');
  const [isUrgent, setIsUrgent] = useState(false);

  // Base pricing formula
  // Base rates in RUB
  let basePrice = 2500;
  if (format === 'reels') {
    basePrice = 2000;
  } else if (format === 'youtube') {
    basePrice = 4000 + Math.max(0, durationMin - 5) * 500;
  } else if (format === 'podcast') {
    basePrice = 3500 + durationMin * 70;
  }

  // Motion multiplier
  let motionMultiplier = 1.0;
  if (motionLevel === 'light') motionMultiplier = 1.25;
  if (motionLevel === 'heavy') motionMultiplier = 1.7;

  // Sound design
  const soundAddon = soundDesign === 'advanced' ? 1200 : 0;

  // Urgency multiplier
  const urgencyMultiplier = isUrgent ? 1.5 : 1.0;

  const estimatedMinRate = Math.round(
    (basePrice * motionMultiplier + soundAddon) * urgencyMultiplier
  );

  // Comparison with vacancy budget if provided
  let comparison: { verdict: 'good' | 'fair' | 'bad'; text: string } | null = null;
  if (vacancyBudget && vacancyBudget > 0) {
    const diff = vacancyBudget - estimatedMinRate;
    if (diff >= 0) {
      comparison = {
        verdict: 'good',
        text: `Бюджет заказчика (${vacancyBudget.toLocaleString()} ${vacancyCurrency}) выше минимального (${estimatedMinRate.toLocaleString()} ₽). Отличный заказ!`,
      };
    } else if (Math.abs(diff) <= estimatedMinRate * 0.2) {
      comparison = {
        verdict: 'fair',
        text: `Бюджет заказчика (${vacancyBudget.toLocaleString()} ${vacancyCurrency}) близок к порогу (${estimatedMinRate.toLocaleString()} ₽). Можно брать при понятном ТЗ.`,
      };
    } else {
      comparison = {
        verdict: 'bad',
        text: `Бюджет заказчика (${vacancyBudget.toLocaleString()} ${vacancyCurrency}) ниже минимальной себестоимости (${estimatedMinRate.toLocaleString()} ₽). Высокий риск обесценивания труда.`,
      };
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Калькулятор рентабельной ставки">
      <div className="space-y-5 text-text">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted block mb-1">Формат видео</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'reels' | 'youtube' | 'podcast')}
              className="w-full bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-xs focus:border-accent focus:outline-none"
            >
              <option value="reels">Reels / Shorts / TikTok (&lt;60 сек)</option>
              <option value="youtube">YouTube (динамичный / экспертный)</option>
              <option value="podcast">Подкаст / Интервью</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Хронометраж готового ролика (мин)</label>
            <input
              type="number"
              min="1"
              max="180"
              value={durationMin}
              onChange={(e) => setDurationMin(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-xs focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted block mb-1">Моушн и анимация</label>
            <select
              value={motionLevel}
              onChange={(e) => setMotionLevel(e.target.value as 'none' | 'light' | 'heavy')}
              className="w-full bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-xs focus:border-accent focus:outline-none"
            >
              <option value="none">Без моушна (нарезка + титры)</option>
              <option value="light">Базовый (всплывашки, зумы, футажи)</option>
              <option value="heavy">Сложный (2D/3D графика, шейпы, карты)</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Саунд-дизайн</label>
            <select
              value={soundDesign}
              onChange={(e) => setSoundDesign(e.target.value as 'basic' | 'advanced')}
              className="w-full bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-xs focus:border-accent focus:outline-none"
            >
              <option value="basic">Базовый (фоновая музыка + чистка голоса)</option>
              <option value="advanced">Продвинутый (whoosh, hit, рисёрч эффектов)</option>
            </select>
          </div>
        </div>

        {/* Urgency */}
        <label className="flex items-center gap-2.5 p-3 bg-surface-2/40 rounded-control border border-border cursor-pointer">
          <input
            type="checkbox"
            checked={isUrgent}
            onChange={(e) => setIsUrgent(e.target.checked)}
            className="rounded bg-surface-2 border-border text-accent focus:ring-accent w-4 h-4"
          />
          <div className="text-xs">
            <span className="font-semibold block text-text">🔥 Срочный дедлайн (сдать за 24 часа)</span>
            <span className="text-muted text-[11px]">+50% к стоимости за ночную работу и перегрузку</span>
          </div>
        </label>

        {/* Result Box */}
        <div className="p-4 bg-accent/10 border border-accent/30 rounded-control flex items-center justify-between">
          <div>
            <span className="text-xs text-muted block">Минимальная рекомендованная ставка:</span>
            <span className="text-xl font-bold text-accent font-mono">
              {estimatedMinRate.toLocaleString()} ₽
            </span>
          </div>
          <Calculator size={28} className="text-accent/60" />
        </div>

        {/* Comparison Alert */}
        {comparison && (
          <div
            className={`p-3 rounded-control border text-xs flex items-start gap-2.5 ${
              comparison.verdict === 'good'
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : comparison.verdict === 'fair'
                ? 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                : 'bg-red-950/20 border-red-500/30 text-red-300'
            }`}
          >
            {comparison.verdict === 'good' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />}
            {comparison.verdict === 'fair' && <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />}
            {comparison.verdict === 'bad' && <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />}
            <span>{comparison.text}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text text-xs font-semibold rounded-control transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  );
};
