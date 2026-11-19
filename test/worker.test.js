import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBudget } from '../web/src/shared/budget.js';
import {
  matchesVacancy,
  buildPostUrl,
  buildLeadId,
  normalizeText,
  computeTextHash,
} from '../web/src/shared/filter.js';

test('2.2 buildPostUrl generates correct public and private URLs', () => {
  // Public channel with username
  assert.equal(
    buildPostUrl({ username: 'work_videoedit' }, 1234),
    'https://t.me/work_videoedit/1234'
  );
  assert.equal(
    buildPostUrl('@creative_jobs', 5678),
    'https://t.me/creative_jobs/5678'
  );

  // Private supergroup with -100 prefix
  assert.equal(
    buildPostUrl({ id: '-1001987654321' }, 999),
    'https://t.me/c/1987654321/999'
  );
  assert.equal(
    buildPostUrl({ chatId: -1001234567890 }, 42),
    'https://t.me/c/1234567890/42'
  );
  assert.equal(
    buildPostUrl('-1009876543210', 100),
    'https://t.me/c/9876543210/100'
  );
});

test('2.1 buildLeadId creates stable unique identifiers', () => {
  assert.equal(buildLeadId('-1001987654321', 123), 'tg_1987654321_123');
  assert.equal(buildLeadId(123456, '99'), 'tg_123456_99');
});

test('2.1 normalizeText and computeTextHash for deduplication', () => {
  const t1 = 'Ищем   видеомонтажера!  Подробности: https://t.me/job/1 @boss';
  const t2 = 'ищем видеомонтажера   подробности  ';
  assert.equal(normalizeText(t1), normalizeText(t2));
  assert.equal(computeTextHash(t1), computeTextHash(t2));
});

test('2.3b parseBudget parses various currency and range formats', () => {
  // Negotiable
  assert.deepEqual(parseBudget('Оплата по договорённости'), {
    min: null,
    max: null,
    currency: 'NEGOTIABLE',
  });
  assert.deepEqual(parseBudget('Зарплата договорная по итогам собеседования'), {
    min: null,
    max: null,
    currency: 'NEGOTIABLE',
  });

  // Range with "k" / "тыс"
  assert.deepEqual(parseBudget('Бюджет 5-10 тыс руб за проект'), {
    min: 5000,
    max: 10000,
    currency: 'RUB',
    unit: 'project',
  });
  assert.deepEqual(parseBudget('Ставка 50-80к в месяц'), {
    min: 50000,
    max: 80000,
    currency: 'RUB',
    unit: 'per_month',
  });

  // Range with "от ... до ..."
  assert.deepEqual(parseBudget('Оплата от 50 000 до 80 000 ₽'), {
    min: 50000,
    max: 80000,
    currency: 'RUB',
  });

  // "от 5к"
  assert.deepEqual(parseBudget('ЗП от 5к руб за ролик'), {
    min: 5000,
    max: null,
    currency: 'RUB',
    unit: 'per_video',
  });

  // "до 100 000"
  assert.deepEqual(parseBudget('Бюджет до 100 000 руб'), {
    min: null,
    max: 100000,
    currency: 'RUB',
  });

  // USD
  assert.deepEqual(parseBudget('Monthly salary $1500 - $2000 for editor'), {
    min: 1500,
    max: 2000,
    currency: 'USD',
    unit: 'per_month',
  });
  assert.deepEqual(parseBudget('Rate: 500 usd per video'), {
    min: 500,
    max: 500,
    currency: 'USD',
    unit: 'per_video',
  });

  // EUR
  assert.deepEqual(parseBudget('Budget: 800 € per episode'), {
    min: 800,
    max: 800,
    currency: 'EUR',
    unit: 'per_video',
  });

  // KZT
  assert.deepEqual(parseBudget('Оплата 150 000 - 200 000 ₸'), {
    min: 150000,
    max: 200000,
    currency: 'KZT',
  });

  // Single amount
  assert.deepEqual(parseBudget('Фикс 5000₽ за выпуск'), {
    min: 5000,
    max: 5000,
    currency: 'RUB',
    unit: 'per_video',
  });

  // No budget mentioned
  assert.equal(parseBudget('Просто текст без цифр и цен'), null);
});

test('2.3 matchesVacancy filter on 20+ realistic examples', () => {
  // === GENUINE VACANCIES (MUST PASS) ===
  const validVacancies = [
    'Ищем видеомонтажера для YouTube канала. Оплата 5000 руб за выпуск.',
    'Требуется монтажер reels для экспертного блога. Бюджет от 30к.',
    'В команду ищем рилсмейкера на долгосрок. 15-20 роликов в месяц, оплата 5000 KZT за ролик.',
    'Вакансия: монтаж видео для коммерческого бренда. Premiere Pro, After Effects.',
    'Looking for a video editor for a crypto YouTube channel. $150 per video.',
    'Срочно нужен монтажер на подкаст, хронометраж 1 час. Ставка 8000₽.',
    'Нужен человек на монтаж shorts и tiktok каждый день.',
    'Открыта вакансия: моушн дизайнер / видеомонтажер в агентство.',
    'Ищем спеца по монтажу горизонтальных видео в DaVinci Resolve.',
    'В продакшн требуется видеомонтажёр на проект, 50 000 руб за ролик.',
    'Ищу монтажера для нарезки стримов на YouTube.',
  ];

  for (const text of validVacancies) {
    const res = matchesVacancy(text);
    assert.equal(
      res.isMatch,
      true,
      `Expected vacancy to match: "${text}" (reason: ${res.reason})`
    );
  }

  // === RESUMES & CANDIDATE POSTS (MUST BE REJECTED) ===
  const resumes = [
    'Привет! Я видеомонтажер с опытом 3 года. Ищу работу и заказы. Портфолио: https://t.me/myportfolio',
    '#резюме Монтажер reels и shorts. Мои работы: https://behance.net/editor',
    'Ищу клиентов на монтаж видео. Прайс от 1000 руб. Смонтирую для вас крутой рилс!',
    'Беру заказы на монтаж подкастов и YouTube видео. Обо мне: монтирую быстро и качественно.',
    'Предлагаю свои услуги видеомонтажа. Мой прайс-лист в закрепе канала.',
    'Я монтажер, открыт к предложениям и новым проектам.',
    'Смонтирую вам динамичные reels, принимаю заказы в ЛС.',
    'Мои услуги: монтаж роликов, цветокоррекция, стоимость монтажа от 2000р.',
  ];

  for (const text of resumes) {
    const res = matchesVacancy(text);
    assert.equal(
      res.isMatch,
      false,
      `Expected resume to be rejected: "${text}" (matched: ${res.matched.join(', ')})`
    );
  }

  // === SPAM, COURSES & UNRELATED (MUST BE REJECTED) ===
  const spamAndUnrelated = [
    'Слив курса по монтажу в Premiere Pro от известного блогера! Скачать бесплатно...',
    'Купить курс по видеомонтажу со скидкой 80%. Обучение монтажу с нуля.',
    'Продаю крипту и сигналы, пишите в лс, гарантия дохода!',
    'Ищем менеджера по продажам в онлайн-школу. Зарплата от 50 000 руб.',
    'Марафон по монтажу: научись монтировать reels за 3 дня!',
    'Курьер на доставку еды, ежедневные выплаты.',
  ];

  for (const text of spamAndUnrelated) {
    const res = matchesVacancy(text);
    assert.equal(
      res.isMatch,
      false,
      `Expected spam/unrelated to be rejected: "${text}" (matched: ${res.matched.join(', ')})`
    );
  }
});
