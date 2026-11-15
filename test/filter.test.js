import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesVacancy } from '../web/src/shared/filter.js';

test('2.4 matchesVacancy - 60+ comprehensive test cases', () => {
  // === A. POSITIVE TEST CASES (35 cases) ===

  // 1. Direct hiring phrases
  assert.equal(matchesVacancy('Срочно ищем видеомонтажера для YouTube канала').isMatch, true);
  assert.equal(matchesVacancy('Ищем видеомонтажёра с опытом в Premiere Pro').isMatch, true);
  assert.equal(matchesVacancy('Нужен монтажер на постоянную удаленную работу').isMatch, true);
  assert.equal(matchesVacancy('Требуется видеомонтажер в медиа агентство').isMatch, true);
  assert.equal(matchesVacancy('Ищу видеомонтажёра для reels и shorts').isMatch, true);
  assert.equal(matchesVacancy('Вакансия: монтажер роликов в продакшн').isMatch, true);
  assert.equal(matchesVacancy('Ищем рилсмейкера на полный день').isMatch, true);
  assert.equal(matchesVacancy('Нужен рилсмейкер с навыками CapCut и Premiere').isMatch, true);
  assert.equal(matchesVacancy('Требуется рилсмейкер для экспертного блога').isMatch, true);
  assert.equal(matchesVacancy('Looking for a video editor for gaming channel').isMatch, true);
  assert.equal(matchesVacancy('Hiring video editor full-time remote').isMatch, true);
  assert.equal(matchesVacancy('Video editor wanted for tech reviews').isMatch, true);

  // 2. Explicit headers (#вакансия, ВАКАНСИЯ:, #работа, #job)
  assert.equal(matchesVacancy('#вакансия\nМонтаж видео для каналов миллионников. Оплата достойная.').isMatch, true);
  assert.equal(matchesVacancy('ВАКАНСИЯ: Видеомонтаж подкастов на постоянку.').isMatch, true);
  assert.equal(matchesVacancy('#работа Монтаж подкастов и длинных видео. Пишите в ЛС.').isMatch, true);
  assert.equal(matchesVacancy('#job Motion designer for crypto project').isMatch, true);
  assert.equal(matchesVacancy('#hiring Video editor for TikTok and Reels agency').isMatch, true);
  assert.equal(matchesVacancy('Ищем в команду: монтажёр роликов, ставка от 80к.').isMatch, true);

  // 3. Primary role + hiring signal in <= 40 chars
  assert.equal(matchesVacancy('В команду требуется опытный видеомонтажер.').isMatch, true);
  assert.equal(matchesVacancy('Для нового проекта нужен монтажер reels.').isMatch, true);
  assert.equal(matchesVacancy('Мы сейчас в поиске motion designer с крутым портфолио.').isMatch, true);
  assert.equal(matchesVacancy('На долгосрок нанимаем видеомонтажера на YouTube.').isMatch, true);
  assert.equal(matchesVacancy('Открыта вакансия: моушн-дизайнер 2D/3D.').isMatch, true);
  assert.equal(matchesVacancy('Команде нужен shorts maker с пониманием хуков и удержания.').isMatch, true);
  assert.equal(matchesVacancy('Ищем в штат: reels maker для брендов.').isMatch, true);
  assert.equal(matchesVacancy('Нужна помощь: монтаж видео для коммерческого курса.').isMatch, true);
  assert.equal(matchesVacancy('На проект требуется монтаж подкастов под ключ.').isMatch, true);
  assert.equal(matchesVacancy('Нам нужен классный моушн дизайнер для заставок.').isMatch, true);
  assert.equal(matchesVacancy('В продакшн требуется монтажер shorts на поток.').isMatch, true);
  assert.equal(matchesVacancy('Ищу человека на монтаж роликов, от 3000р/видео.').isMatch, true);
  assert.equal(matchesVacancy('Нужен спец на видеомонтаж интервью.').isMatch, true);
  assert.equal(matchesVacancy('Ищем толкового видеомонтажера, зп от 100 000 руб.').isMatch, true);
  assert.equal(matchesVacancy('We are looking for motion designer skilled in After Effects.').isMatch, true);
  assert.equal(matchesVacancy('Need talented video editor for daily short-form content.').isMatch, true);
  assert.equal(matchesVacancy('В онлайн-школу открыта вакансия видеомонтажер уроков.').isMatch, true);

  // === B. NEGATIVE TEST CASES (30 cases) ===

  // 1. Job seekers / Resumes / Portfolios (STOP WORDS)
  assert.equal(matchesVacancy('Ищу работу видеомонтажером, опыт 3 года').isMatch, false);
  assert.equal(matchesVacancy('Ищу работу монтажером, пишите в телеграм').isMatch, false);
  assert.equal(matchesVacancy('Ищу заказы на видеомонтаж, делаю быстро и качественно').isMatch, false);
  assert.equal(matchesVacancy('Ищу клиентов на монтаж роликов и рилс').isMatch, false);
  assert.equal(matchesVacancy('Ищу проекты по монтажу видео, готов к тестовому').isMatch, false);
  assert.equal(matchesVacancy('Ищу подработку: видеомонтажер на неполный день').isMatch, false);
  assert.equal(matchesVacancy('Моё портфолио видеомонтажера: https://disk.yandex.ru/d/...').isMatch, false);
  assert.equal(matchesVacancy('Мое портфолио reelsmaker: https://t.me/portfolio').isMatch, false);
  assert.equal(matchesVacancy('Портфолио: смонтировал более 100 видео для блогеров').isMatch, false);
  assert.equal(matchesVacancy('Готов смонтировать ваше видео за отзыв').isMatch, false);
  assert.equal(matchesVacancy('Готова смонтировать рилс любой сложности, пишите').isMatch, false);
  assert.equal(matchesVacancy('Я монтажёр с опытом 5 лет, ищу долгосрочное сотрудничество').isMatch, false);
  assert.equal(matchesVacancy('Я видеомонтажер, работаю в Premiere Pro и DaVinci').isMatch, false);
  assert.equal(matchesVacancy('Я рилсмейкер, помогу набрать подписчиков').isMatch, false);
  assert.equal(matchesVacancy('Резюме: Видеомонтажер / Motion designer. Опыт в студии.').isMatch, false);
  assert.equal(matchesVacancy('О себе: опытный видеомонтажер, делаю динамичный монтаж').isMatch, false);
  assert.equal(matchesVacancy('Обо мне: монтирую видеоролики под ключ').isMatch, false);
  assert.equal(matchesVacancy('Предлагаю услуги видеомонтажа для экспертов').isMatch, false);
  assert.equal(matchesVacancy('Оказываю услуги монтажа подкастов и интервью').isMatch, false);
  assert.equal(matchesVacancy('Продаю готовый пак пресетов для видеомонтажа').isMatch, false);

  // 2. Courses, Webinars & Training (STOP WORDS)
  assert.equal(matchesVacancy('Курс по монтажу видео с нуля до PRO').isMatch, false);
  assert.equal(matchesVacancy('Обучение монтажу reels: старт потока в понедельник').isMatch, false);
  assert.equal(matchesVacancy('Бесплатный вебинар: как видеомонтажер может зарабатывать от $2000').isMatch, false);
  assert.equal(matchesVacancy('Марафон по Premiere Pro и After Effects').isMatch, false);

  // 3. Construction / Non-video montage
  assert.equal(matchesVacancy('Требуется строительный монтаж металлоконструкций на объекте').isMatch, false);
  assert.equal(matchesVacancy('Нужен монтаж кондиционеров в офис').isMatch, false);
  assert.equal(matchesVacancy('Срочно монтаж окон и балконных блоков').isMatch, false);
  assert.equal(matchesVacancy('Бригада выполнит монтаж натяжных потолков').isMatch, false);
  assert.equal(matchesVacancy('Демонтаж и монтаж отопления в коттедже').isMatch, false);

  // 4. No hiring intent within proximity (signal is too far or unrelated)
  assert.equal(matchesVacancy('Видеомонтажер это творческая профессия, требующая усидчивости. Много лет назад я начал учиться этому.').isMatch, false);
  assert.equal(matchesVacancy('Просто текст без роли и без ключевиков про погоду').isMatch, false);
  assert.equal(matchesVacancy('').isMatch, false);
});

test('A1: two-level stop words and soft applicant phrases handling (12+ cases)', () => {
  // --- 1. Vacancies containing soft applicant keywords (MUST PASS because hiring intent is present) ---
  // Case 1: «резюме» in genuine vacancy
  const v1 = matchesVacancy('Ищем видеомонтажёра на YouTube-канал. Оплата 40 000 ₽. Присылайте резюме и портфолио в лс.');
  assert.equal(v1.isMatch, true, 'Vacancy with резюме and портфолио must pass');

  // Case 2: «CV» in genuine vacancy
  const v2 = matchesVacancy('Требуется монтажёр reels, отправляйте CV в телеграм @hr_lead');
  assert.equal(v2.isMatch, true, 'Vacancy with CV must pass');

  // Case 3: «портфолио:» in genuine vacancy
  const v3 = matchesVacancy('Вакансия: монтажёр. Портфолио: обязательно присылать ссылкой на гугл диск.');
  assert.equal(v3.isMatch, true, 'Vacancy with портфолио: must pass');

  // Case 4: «Услуги монтажа не предлагать»
  const v4 = matchesVacancy('Ищем видеомонтажёра в продакшн. Услуги монтажа от агентств не предлагать, только инхаус.');
  assert.equal(v4.isMatch, true, 'Vacancy with "услуги монтажа не предлагать" must pass');

  // Case 5: «обо мне» in genuine vacancy
  const v5 = matchesVacancy('Ищем рилсмейкера на долгосрок! Краткий рассказ о себе и кейсы в ЛС.');
  assert.equal(v5.isMatch, true, 'Vacancy with о себе must pass');

  // Case 6: «резюме» with explicit header
  const v6 = matchesVacancy('#вакансия\nМонтаж видео для онлайн-школы. Ждем ваше резюме и примеры работ.');
  assert.equal(v6.isMatch, true, 'Header #вакансия with резюме must pass');

  // Case 7: English hiring phrase with CV
  const v7 = matchesVacancy('Looking for a video editor for daily vlogs. Send your CV and portfolio to email.');
  assert.equal(v7.isMatch, true, 'English vacancy with CV and portfolio must pass');

  // --- 2. Job seekers / self-promoters and non-video (MUST BE REJECTED) ---
  // Case 8: Job seeker with portfolio
  const s1 = matchesVacancy('Ищу работу, моё портфолио: https://t.me/my_edits. Сделаю динамично.');
  assert.equal(s1.isMatch, false, 'Job seeker with "ищу работу, моё портфолио" must be rejected');

  // Case 9: Self-promoter offering services
  const s2 = matchesVacancy('Я монтажёр, предлагаю услуги монтажа для блогеров.');
  assert.equal(s2.isMatch, false, 'Self promoter "я монтажёр, предлагаю услуги" must be rejected');

  // Case 10: Construction montage
  const c1 = matchesVacancy('Срочно требуется монтаж окон ПВХ и балконных блоков на объекте.');
  assert.equal(c1.isMatch, false, 'Window montage must be rejected');

  // Case 11: Air conditioner montage
  const c2 = matchesVacancy('Нужен монтаж кондиционеров в серверную.');
  assert.equal(c2.isMatch, false, 'AC montage must be rejected');

  // Case 12: Ceiling montage
  const c3 = matchesVacancy('Бригада ищет заказы: монтаж натяжных потолков под ключ.');
  assert.equal(c3.isMatch, false, 'Ceiling montage must be rejected');

  // Case 13: Course seller
  const crs = matchesVacancy('Курс по монтажу роликов с нуля! Скидка 50% только сегодня.');
  assert.equal(crs.isMatch, false, 'Course ad must be rejected');

  // Case 14: Job seeker with resume and no hiring intent
  const app = matchesVacancy('Видеомонтажер. Мое резюме и портфолио: https://hh.ru/resume/123.');
  assert.equal(app.isMatch, false, 'Applicant resume without hiring signals must be rejected');
});
