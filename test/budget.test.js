import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBudget } from '../web/src/shared/budget.js';

test('2.3 parseBudget - 40+ comprehensive tests', () => {
  // --- 1. RANGES (10 tests) ---
  const r1 = parseBudget('Оплата: 50 000 - 80 000 ₽ за ролик');
  assert.deepEqual(r1, { min: 50000, max: 80000, currency: 'RUB', unit: 'per_video' });

  const r2 = parseBudget('Ставка $1500 - $2000 в месяц');
  assert.deepEqual(r2, { min: 1500, max: 2000, currency: 'USD', unit: 'per_month' });

  const r3 = parseBudget('Бюджет от 5к до 10к руб за шортс');
  assert.deepEqual(r3, { min: 5000, max: 10000, currency: 'RUB', unit: 'per_video' });

  const r4 = parseBudget('Зарплата 100-150 тыс руб / мес');
  assert.deepEqual(r4, { min: 100000, max: 150000, currency: 'RUB', unit: 'per_month' });

  const r5 = parseBudget('Оплата 3000-5000р за видео');
  assert.deepEqual(r5, { min: 3000, max: 5000, currency: 'RUB', unit: 'per_video' });

  const r6 = parseBudget('ЗП: 500 - 800 EUR / project');
  assert.deepEqual(r6, { min: 500, max: 800, currency: 'EUR', unit: 'project' });

  const r7 = parseBudget('Гонорар 150 000 - 250 000 тенге в месяц');
  assert.deepEqual(r7, { min: 150000, max: 250000, currency: 'KZT', unit: 'per_month' });

  const r8 = parseBudget('Ставка 10 000 - 15 000 грн за проект');
  assert.deepEqual(r8, { min: 10000, max: 15000, currency: 'UAH', unit: 'project' });

  const r9 = parseBudget('Rate: 20-35$ / hour');
  assert.deepEqual(r9, { min: 20, max: 35, currency: 'USD', unit: 'per_hour' });

  const r10 = parseBudget('Бюджет 500-1000 р за минуту видео');
  assert.deepEqual(r10, { min: 500, max: 1000, currency: 'RUB', unit: 'per_minute' });

  // --- 2. SINGLE AMOUNTS (10 tests) ---
  const s1 = parseBudget('Платим 5000 руб за ролик');
  assert.deepEqual(s1, { min: 5000, max: 5000, currency: 'RUB', unit: 'per_video' });

  const s2 = parseBudget('Оплата: $300 за видео');
  assert.deepEqual(s2, { min: 300, max: 300, currency: 'USD', unit: 'per_video' });

  const s3 = parseBudget('Фикс 120 000 ₽ в месяц');
  assert.deepEqual(s3, { min: 120000, max: 120000, currency: 'RUB', unit: 'per_month' });

  const s4 = parseBudget('Цена 2500₽ за рилс');
  assert.deepEqual(s4, { min: 2500, max: 2500, currency: 'RUB', unit: 'per_video' });

  const s5 = parseBudget('ЗП 1500 usd / month');
  assert.deepEqual(s5, { min: 1500, max: 1500, currency: 'USD', unit: 'per_month' });

  const s6 = parseBudget('Оплата 400€ за проект');
  assert.deepEqual(s6, { min: 400, max: 400, currency: 'EUR', unit: 'project' });

  const s7 = parseBudget('Стоимость 35000 kzt за выпуск');
  assert.deepEqual(s7, { min: 35000, max: 35000, currency: 'KZT', unit: 'per_video' });

  const s8 = parseBudget('Гонорар 8000 грн за серию');
  assert.deepEqual(s8, { min: 8000, max: 8000, currency: 'UAH' });

  const s9 = parseBudget('Оплата 1500 руб/час');
  assert.deepEqual(s9, { min: 1500, max: 1500, currency: 'RUB', unit: 'per_hour' });

  const s10 = parseBudget('Фикс 15к руб на проект');
  assert.deepEqual(s10, { min: 15000, max: 15000, currency: 'RUB', unit: 'project' });

  // --- 3. DIRECTIONAL: ОТ / ДО (6 tests) ---
  const d1 = parseBudget('Зарплата от 80 000 ₽ в месяц');
  assert.deepEqual(d1, { min: 80000, max: null, currency: 'RUB', unit: 'per_month' });

  const d2 = parseBudget('Бюджет до 15 000 руб за ролик');
  assert.deepEqual(d2, { min: null, max: 15000, currency: 'RUB', unit: 'per_video' });

  const d3 = parseBudget('Ставка от $20 / час');
  assert.deepEqual(d3, { min: 20, max: null, currency: 'USD', unit: 'per_hour' });

  const d4 = parseBudget('Оплата до $500 за проект');
  assert.deepEqual(d4, { min: null, max: 500, currency: 'USD', unit: 'project' });

  const d5 = parseBudget('ЗП от 50к руб');
  assert.deepEqual(d5, { min: 50000, max: null, currency: 'RUB' });

  const d6 = parseBudget('Бюджет до 2000 р за шортс');
  assert.deepEqual(d6, { min: null, max: 2000, currency: 'RUB', unit: 'per_video' });

  // --- 4. NEGOTIABLE (5 tests) ---
  const n1 = parseBudget('Оплата по договорённости в зависимости от навыков');
  assert.equal(n1.currency, 'NEGOTIABLE');

  const n2 = parseBudget('Зарплата договорная, обсуждаем на созвоне');
  assert.equal(n2.currency, 'NEGOTIABLE');

  const n3 = parseBudget('Salary is negotiable based on portfolio');
  assert.equal(n3.currency, 'NEGOTIABLE');

  const n4 = parseBudget('По итогам собеседования, в месяц');
  assert.deepEqual(n4, { min: null, max: null, currency: 'NEGOTIABLE', unit: 'per_month' });

  const n5 = parseBudget('Оплата обсуждаема за ролик');
  assert.deepEqual(n5, { min: null, max: null, currency: 'NEGOTIABLE', unit: 'per_video' });

  // --- 5. FALSE POSITIVES REJECTION (12 tests) ---
  // Working hours
  assert.equal(parseBudget('Рабочий день с 10 до 19'), null, 'working hours must not be budget');
  assert.equal(parseBudget('Занятость 10-18 часов в неделю'), null, 'hours per week must not be budget');

  // Schedules
  assert.equal(parseBudget('График 5/2, удалённо'), null, 'schedule 5/2 must not be budget');
  assert.equal(parseBudget('Смена 2/2 по 8 часов'), null, 'schedule 2/2 must not be budget');

  // Years & Dates
  assert.equal(parseBudget('Опыт работы в проектах 2022-2024'), null, 'year range must not be budget');

  // Order / Ticket numbers
  assert.equal(parseBudget('Номер задачи #12345'), null, 'order # must not be budget');

  // Phone numbers
  assert.equal(parseBudget('Контакты: +7 999 123-45-67 пишите'), null, 'phone number must not be budget');
  assert.equal(parseBudget('тел 89998887766'), null, 'phone must not be budget');

  // Experience
  assert.equal(parseBudget('Требуется опыт от 3 до 5 лет'), null, 'experience years must not be budget');

  // Video duration
  assert.equal(parseBudget('Хронометраж ролика от 10 до 15 мин'), null, 'video timing must not be budget');

  // Numbers without currency adjacent
  assert.equal(parseBudget('Ищем 2-3 человека в команду'), null, 'people count must not be budget');
  assert.equal(parseBudget('Сделать 10-20 роликов'), null, 'clip count must not be budget');
});
