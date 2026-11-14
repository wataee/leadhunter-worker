import React from 'react';
import { Modal } from './Modal';
import { Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const shortcutGroups = [
    {
      title: 'Быстрая навигация',
      items: [
        { keys: ['g', 'd'], desc: 'Перейти на Дашборд' },
        { keys: ['g', 'f'], desc: 'Открыть Поиск каналов' },
        { keys: ['g', 'v'], desc: 'Открыть Монитор вакансий' },
        { keys: ['g', 'l'], desc: 'Открыть Воронку клиентов' },
        { keys: ['g', 't'], desc: 'Открыть Шаблоны сообщений' },
        { keys: ['g', 's'], desc: 'Открыть Настройки' },
      ],
    },
    {
      title: 'Действия и фокус',
      items: [
        { keys: ['/'], desc: 'Сфокусироваться на поле поиска' },
        { keys: ['Esc'], desc: 'Закрыть боковую панель или модальное окно' },
        { keys: ['?'], desc: 'Показать список горячих клавиш' },
      ],
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2">
          <Keyboard size={18} className="text-accent" />
          <span>Горячие клавиши (Shortcuts)</span>
        </div>
      }
    >
      <div className="space-y-5">
        {shortcutGroups.map((group) => (
          <div key={group.title} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {group.title}
            </h4>
            <div className="bg-surface-2/60 rounded-control border border-border divide-y divide-border/60">
              {group.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                >
                  <span className="text-text">{item.desc}</span>
                  <div className="flex items-center gap-1 font-mono">
                    {item.keys.map((k, kIdx) => (
                      <React.Fragment key={kIdx}>
                        {kIdx > 0 && <span className="text-muted text-[10px]">+</span>}
                        <kbd className="px-2 py-0.5 bg-surface text-accent rounded border border-border text-[11px] font-semibold">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-[11px] text-muted italic text-center pt-2">
          Навигация через клавиши 'g' затем букву работает как в Linear и GitHub.
        </p>
      </div>
    </Modal>
  );
};
