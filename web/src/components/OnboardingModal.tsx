import React, { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { Modal } from './Modal';
import { Check, ArrowRight, ArrowLeft, Sparkles, Video, DollarSign, UserCheck } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_FORMATS: Array<'YouTube' | 'Shorts/Reels' | 'Подкасты' | 'Реклама'> = [
  'YouTube',
  'Shorts/Reels',
  'Подкасты',
  'Реклама',
];

const ALL_SKILLS = [
  'Premiere Pro',
  'After Effects',
  'DaVinci Resolve',
  'CapCut',
  'Photoshop',
  'Blender',
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form state
  const [name, setName] = useState(profile.name || 'Timur (.fleur)');
  const [telegram, setTelegram] = useState(profile.telegram || '@ffluere');
  const [portfolioUrl, setPortfolioUrl] = useState(profile.portfolioUrl || 'https://fleur-editor.netlify.app/');
  const [minRate, setMinRate] = useState(profile.minRate || 80);
  const [minRateCurrency, setMinRateCurrency] = useState<'RUB' | 'USD' | 'EUR' | 'KZT'>(
    (profile.minRateCurrency as any) || 'USD'
  );
  const [selectedFormats, setSelectedFormats] = useState<Array<'YouTube' | 'Shorts/Reels' | 'Подкасты' | 'Реклама'>>(
    profile.formats && profile.formats.length > 0
      ? profile.formats
      : ['YouTube', 'Shorts/Reels']
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    profile.skills && profile.skills.length > 0
      ? profile.skills
      : ['Premiere Pro', 'After Effects']
  );

  const toggleFormat = (fmt: 'YouTube' | 'Shorts/Reels' | 'Подкасты' | 'Реклама') => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const toggleSkill = (sk: string) => {
    setSelectedSkills((prev) =>
      prev.includes(sk) ? prev.filter((s) => s !== sk) : [...prev, sk]
    );
  };

  const handleFinish = () => {
    updateProfile({
      name: name.trim() || 'Видеомонтажёр',
      telegram: telegram.trim(),
      portfolioUrl: portfolioUrl.trim(),
      minRate,
      minRateCurrency,
      formats: selectedFormats,
      skills: selectedSkills,
    });

    localStorage.setItem('leadhunter_onboarding_completed', 'true');
    addToast({
      type: 'success',
      message: 'Профиль настроен! LeadHunter готов к поиску подходящих заказов.',
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Добро пожаловать в LeadHunter">
      <div className="space-y-6">
        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted mb-1.5 font-medium">
            <span>Шаг {step} из 3</span>
            <span>
              {step === 1 && 'Форматы монтажа'}
              {step === 2 && 'Ставка и софт'}
              {step === 3 && 'Контакты и портфолио'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Formats */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Video size={18} className="text-accent" />
              <span>Какие форматы видео вы монтируете?</span>
            </div>
            <p className="text-xs text-muted">
              Это поможет фильтровать вакансии и генерировать точные отклики под вашу нишу.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_FORMATS.map((fmt) => {
                const active = selectedFormats.includes(fmt);
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => toggleFormat(fmt)}
                    className={`p-3 text-left text-xs rounded-control border transition-all flex items-center justify-between ${
                      active
                        ? 'border-accent bg-accent/10 text-text font-medium'
                        : 'border-border bg-surface-2/40 text-muted hover:border-border-hover'
                    }`}
                  >
                    <span>{fmt}</span>
                    {active && <Check size={14} className="text-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Rate & Skills */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-text">
                <DollarSign size={18} className="text-accent" />
                <span>Минимальная комфортная ставка за проект / ролик</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={minRate}
                  onChange={(e) => setMinRate(Number(e.target.value) || 0)}
                  className="flex-1 bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-sm focus:border-accent focus:outline-none"
                  placeholder="80"
                />
                <select
                  value={minRateCurrency}
                  onChange={(e) => setMinRateCurrency(e.target.value as any)}
                  className="bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-sm focus:border-accent focus:outline-none"
                >
                  <option value="USD">$ (USD)</option>
                  <option value="EUR">€ (EUR)</option>
                  <option value="KZT">₸ (KZT)</option>
                  <option value="RUB">₽ (RUB)</option>
                </select>
              </div>
              <p className="text-[11px] text-muted">
                Вакансии с оплатой ниже этой планки будут помечаться предупреждением.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-text block">В каких программах работаете?</span>
              <div className="flex flex-wrap gap-2">
                {ALL_SKILLS.map((sk) => {
                  const active = selectedSkills.includes(sk);
                  return (
                    <button
                      key={sk}
                      type="button"
                      onClick={() => toggleSkill(sk)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                        active
                          ? 'border-accent bg-accent/15 text-accent font-medium'
                          : 'border-border bg-surface-2/40 text-muted hover:border-border-hover'
                      }`}
                    >
                      {sk}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Profile & Portfolio */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <UserCheck size={18} className="text-accent" />
              <span>Данные для автоматических откликов</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">Ваше имя / псевдоним</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-xs focus:border-accent focus:outline-none"
                  placeholder="Timur (.fleur)"
                />
              </div>

              <div>
                <label className="text-xs text-muted block mb-1">Telegram (куда писать заказчику)</label>
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  className="w-full bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-xs focus:border-accent focus:outline-none"
                  placeholder="@ffluere"
                />
              </div>

              <div>
                <label className="text-xs text-muted block mb-1">Ссылка на портфолио / шоурил</label>
                <input
                  type="url"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                  className="w-full bg-surface-2 text-text px-3 py-2 rounded-control border border-border text-xs focus:border-accent focus:outline-none"
                  placeholder="https://fleur-editor.netlify.app/"
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => (prev - 1) as any)}
              className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text text-xs font-medium rounded-control flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft size={14} />
              Назад
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-muted hover:text-text px-2 py-1"
            >
              Пропустить
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => (prev + 1) as any)}
              className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control flex items-center gap-1.5 transition-colors"
            >
              Далее
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-control flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-900/20"
            >
              <Sparkles size={14} />
              Готово, перейти к заказам
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
