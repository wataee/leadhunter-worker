import React, { useState } from 'react';
import { Modal } from './Modal';
import { useToastStore } from '../store/toastStore';
import { Copy, Check, FileQuestion } from 'lucide-react';

interface ClientBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadTitle?: string;
  videoType?: string;
}

export const ClientBriefModal: React.FC<ClientBriefModalProps> = ({
  isOpen,
  onClose,
  leadTitle = 'Проект монтажа',
  videoType = 'YouTube / Reels',
}) => {
  const addToast = useToastStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  const isReels = /reels|shorts|tiktok|рилс/i.test(leadTitle + videoType);
  const isPodcast = /подкаст|интервью|podcast/i.test(leadTitle + videoType);

  let questions: string[];

  if (isReels) {
    questions = [
      '1. Какая главная цель ролика (подписчики, продажи, личный бренд, прогрев)?',
      '2. Есть ли готовый сценарий/текст или нужно выделить ключевую мысль из сырого куска?',
      '3. Есть ли референсы по стилю субтитров и динамике (например, стиль Hormozi, Ali Abdaal или минимализм)?',
      '4. Предоставите ли вы фирменные шрифты/цвета бренда или подбираем с нуля?',
      '5. В каком формате исходники (разрешение, частота кадров, снято на телефон/камеру)?',
      '6. Какой жесткий дедлайн по первой версии ролика?',
    ];
  } else if (isPodcast) {
    questions = [
      '1. Сколько камер использовалось на съёмке (1, 2, 3 ракурса) и записан ли звук отдельными дорожками?',
      '2. Нужна ли полная версия выпуска или также нарезка тизеров/шортсов из лучших моментов?',
      '3. Есть ли таймкоды/заметки с неудачными дублями или оговорками для вырезки?',
      '4. Нужен ли фирменный интро/аутро, плашки с именами спикеров и темы на экране?',
      '5. Какой общий хронометраж исходников (сколько гигабайт и где лежат файлы: Яндекс.Диск/Гугл)?',
      '6. К какой дате запланирована публикация на YouTube / подкаст-платформах?',
    ];
  } else {
    // Standard / YouTube
    questions = [
      '1. Какова основная тема и целевая аудитория ролика (какое действие зритель должен совершить в конце)?',
      '2. Пришлите 1–2 референса роликов, монтаж и удержание которых вам нравятся.',
      '3. Есть ли готовый дикторский голос/озвучка и структурированный сценарий?',
      '4. Нужен ли сложный моушн-дизайн (шейпы, карты, анимация интерфейсов) или динамичный B-roll монтаж?',
      '5. Предоставляете ли вы исходные материалы или потребуется рисёрч стоков и саунд-дизайна?',
      '6. Каковы ожидаемый хронометраж и дедлайн первого драфта?',
      '7. Сколько раундов правок закладываем в работу над выпуском?',
    ];
  }

  const briefText = `Здравствуйте! Чтобы быстрее и точнее приступить к монтажу «${leadTitle}», ответьте, пожалуйста, на несколько вопросов:\n\n${questions.join(
    '\n'
  )}\n\nСпасибо! Жду исходники.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(briefText);
    setCopied(true);
    addToast({ type: 'success', message: 'Чек-лист брифа скопирован в буфер обмена!' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Чек-лист брифа клиента">
      <div className="space-y-4 text-text">
        <div className="flex items-center gap-2 text-xs text-muted">
          <FileQuestion size={16} className="text-accent" />
          <span>
            Вопросы перед стартом проекта ({isReels ? 'Reels/Shorts' : isPodcast ? 'Подкаст' : 'YouTube'}):
          </span>
        </div>

        <div className="space-y-2 p-3 bg-surface-2 rounded-control border border-border text-xs leading-relaxed max-h-72 overflow-y-auto">
          {questions.map((q, idx) => (
            <div key={idx} className="p-1.5 bg-surface-3/50 rounded flex items-start gap-2">
              <span className="text-accent font-mono font-bold">•</span>
              <span>{q}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text text-xs font-medium rounded-control transition-colors"
          >
            Закрыть
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-control flex items-center gap-1.5 transition-colors shadow"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Скопировано!' : 'Скопировать текст клиенту'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
