// scripts/reproduce-filter-defects.mjs
// Reproduce known defects of the legacy filter BEFORE making any fixes

import { matchesVacancy } from '../web/src/shared/filter.js';

console.log('=== ВОСПРОИЗВЕДЕНИЕ ДЕФЕКТОВ ТЕКУЩЕГО ФИЛЬТРА ===\n');

const defectCases = [
  {
    type: 'ШТАТ / ОФИС / ПОЛНЫЙ ДЕНЬ',
    text: 'Вакансия: видеомонтажёр в штат, полный день, 5/2, ТК, оклад 350 000 тг, соцпакет, испытательный срок 3 месяца.',
    shouldMatch: false,
    reason: 'Штат, 5/2, ТК, оклад, соцпакет, испытательный срок',
  },
  {
    type: 'ШТАТ / ОФИС / ПОЛНЫЙ ДЕНЬ (EN)',
    text: 'We are hiring a full-time video editor, salary $3000/month, 40 hours per week, in-office or permanent remote with benefits.',
    shouldMatch: false,
    reason: 'Full-time, salary per month, 40 hours per week, permanent, benefits',
  },
  {
    type: 'РЕКЛАМА КУРСОВ / ИНФОБИЗ',
    text: 'Нужен монтажер? Обучим востребованной профессии с нуля за 6 недель на нашем курсе видеомонтажа!',
    shouldMatch: false,
    reason: 'Лид-магнит на курс с вопросом «нужен монтажер?»',
  },
  {
    type: 'СМЕЖНЫЕ ПРОФЕССИИ (монтаж вскользь)',
    text: 'Ищем SMM-специалиста и таргетолога. Обязанности: ведение соцсетей, настройка рекламы, копирайтинг, базовый видеомонтаж рилс.',
    shouldMatch: false,
    reason: 'SMM/таргетолог с монтажом вскользь',
  },
  {
    type: 'ПРЕДЛОЖЕНИЕ УСЛУГ (соискатель/монтажер)',
    text: 'Ищу видеомонтажера для совместной работы в студии. Я сам монтирую в DaVinci, открыт к проектам.',
    shouldMatch: false,
    reason: 'Соискатель/партнерство монтажеров',
  },
  {
    type: 'HR / РЕЗЮМЕ В ШТАТ',
    text: 'Ищем в команду: монтажер видео. Отправляйте ваше резюме и сопроводительное письмо на почту hr@agency.com.',
    shouldMatch: false,
    reason: 'Отправляйте резюме HR',
  },
];

let defectsReproduced = 0;

for (const [idx, item] of defectCases.entries()) {
  const result = matchesVacancy(item.text);
  const passed = result.isMatch;
  const isDefect = passed !== item.shouldMatch;

  console.log(`[Тест ${idx + 1}] ${item.type}`);
  console.log(`Текст: "${item.text}"`);
  console.log(`Ожидалось: ${item.shouldMatch ? 'ПРОПУСТИТЬ' : 'ОТКЛОНИТЬ'} (${item.reason})`);
  console.log(`Фактически: ${passed ? 'ПРОПУЩЕНО (isMatch: true)' : 'ОТКЛОНЕНО (isMatch: false)'} ${result.reason ? `[Причина: ${result.reason}]` : ''}`);

  if (isDefect) {
    console.log('❌ ДЕФЕКТ ВОСПРОИЗВЕДЁН: нежелательный пост ошибочно пропущен фильтром!\n');
    defectsReproduced++;
  } else {
    console.log('✅ Отфильтровано корректно.\n');
  }
}

console.log(`Итог воспроизведения: ${defectsReproduced} из ${defectCases.length} дефектов подтверждено на текущем коде.`);
