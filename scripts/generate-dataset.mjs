// scripts/generate-dataset.mjs
// Generates test/fixtures/leads.jsonl with 160+ labeled examples for filter evaluation

import fs from 'fs';
import path from 'path';

const leads = [
  // ==========================================
  // 1. GIG (Подходящие разовые и проектные заказы) ~60 примеров
  // ==========================================
  // Russian Gigs
  {
    id: 'gig_ru_01',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@video_freelance',
    confidence: 1.0,
    text: 'Нужен видеомонтажер смонтировать 1 выпуск подкаста на YouTube (хронометраж 45 минут). Исходники с двух камер, звук сведен. Оплата 25 000 тг за выпуск. Дедлайн 3 дня.',
    notes: 'YouTube выпуск, фиксированная оплата за ролик, дедлайн',
  },
  {
    id: 'gig_ru_02',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@reels_orders',
    confidence: 1.0,
    text: 'Ищу монтажера рилс для экспертного блога по инвестициям. Задача: нарезать 10 рилс из готового интервью. Динамичный монтаж, субтитры, зумы, звуковые эффекты. 3000 руб за рилс. ТЗ тут: https://notion.so/tz-reels',
    notes: 'Пакет 10 рилс, оплата за штуку, ссылка на ТЗ',
  },
  {
    id: 'gig_ru_03',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@almaty_creative',
    confidence: 1.0,
    text: 'Срочно требуется видеомонтаж промо-ролика для кофейни в Алматы (15-30 сек). Есть снятый материал, нужен динамичный монтаж, саунд-дизайн и цветокор в DaVinci. Бюджет 40 000 тенге. Пишите в лс @coffee_manager с примерами.',
    notes: 'Разовый промо-ролик, четкий бюджет, контакт в лс',
  },
  {
    id: 'gig_ru_04',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@youtube_editors',
    confidence: 1.0,
    text: 'Ищу YouTube видеомонтажера на проектный монтаж документального видео (20 мин). Тематика: история технологий. Оплата 150$ за ролик. Нужно сделать платное тестовое (1 минута) за 20$. Связь: @tech_docu',
    notes: 'Проектный заказ, оплата за ролик, платное тестовое',
  },
  {
    id: 'gig_ru_05',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@freelance_kz',
    confidence: 1.0,
    text: 'Нужен монтажер на разовый заказ: смонтировать бэкстейдж со съемок клипа (2 минуты). Материал в 4K ProRes. Бюджет 50 000 ₸. Сдать до воскресенья.',
    notes: 'Разовый заказ, бэкстейдж, фиксированный бюджет',
  },
  {
    id: 'gig_ru_06',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@motion_chat',
    confidence: 1.0,
    text: 'Требуется моушн дизайнер: сделать 3D/2D заставку и плашки для ютуб-канала. Работа разовая, бюджет 120 000 KZT. Референсы скину в ЛС @channel_lead',
    notes: 'Разовая задача на заставки/моушн',
  },
  {
    id: 'gig_ru_07',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@reels_kz',
    confidence: 1.0,
    text: 'Ищем монтажера Reels/Shorts на регулярный фриланс. Выходит 15-20 вертикальных роликов в месяц, оплата сдельная: 5000 тенге за каждое готовое видео сразу после правок. Тестовый ролик оплачиваем.',
    notes: 'Регулярный фриланс со сдельной оплатой за ролик, подходит',
  },
  {
    id: 'gig_ru_08',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@podcast_hub',
    confidence: 1.0,
    text: 'Ищу монтажера подкастов (аудио + видео). 4 выпуска в месяц, оплата 70$ за каждый смонтированный выпуск. Важно: удаление слов-паразитов, перебивки, цветокор.',
    notes: 'Регулярный фриланс с оплатой за выпуск',
  },
  {
    id: 'gig_ru_09',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@video_lead',
    confidence: 1.0,
    text: 'Нужен монтаж видео для рекламы курса по кондитерке. Хронометраж 60 сек, динамика, трендовые переходы в After Effects. Бюджет 20 000 руб за проект. Ссылка на примеры: @cake_school',
    notes: 'Монтаж рекламы, оплата за проект',
  },
  {
    id: 'gig_ru_10',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@shorts_maker',
    confidence: 1.0,
    text: 'Заказ на нарезку шортсов со стримов Twitch. Нужно 30 шортс, бюджет 300$, по 10$ за штуку. Исходники дам, таймкоды есть. Писать @streamer_tg',
    notes: 'Нарезка со стримов, сдельная оплата за штуку',
  },
  {
    id: 'gig_ru_11',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@creative_job',
    confidence: 1.0,
    text: 'Требуется рилсмейкер / мобилограф для нарезки и оформления уже отснятого материала в Астане. 5 роликов, бюджет 35 000 тенге. Оплата по факту сдачи.',
    notes: 'Разовая нарезка 5 роликов, фикс бюджет',
  },
  {
    id: 'gig_ru_12',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@viki_video',
    confidence: 1.0,
    text: 'Нужен монтаж интервью (2 камеры, петлички). Длина 30 мин. Поправить цвет, вырезать паузы, вставить титры. Ставка 15 000 руб за ролик. Связь @viki_prod',
    notes: 'Интервью, ставка за ролик',
  },
  {
    id: 'gig_ru_13',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@youtube_orders',
    confidence: 1.0,
    text: 'Разовая задача: пересобрать и перекрасить готовый YouTube-выпуск (добавить кинематографичный цветокор в DaVinci). Бюджет 80$. Готовность завтра к вечеру.',
    notes: 'Разовый цветокор, дедлайн, фикс оплата',
  },
  {
    id: 'gig_ru_14',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@freelance_leads',
    confidence: 1.0,
    text: 'Ищем фрилансера на монтаж 3 рекламных роликов для мобильного приложения. Хронометраж по 15 секунд. 100$ за всю пачку. Работа в Premiere / AE. Пишите @app_growth',
    notes: '3 рекламных ролика, 100$ за пачку',
  },
  {
    id: 'gig_ru_15',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@videomontazh_chat',
    confidence: 1.0,
    text: 'Горит дедлайн! Нужен видеомонтажер на сегодня дорезать корпоративный отчетный ролик (3 мин). Исходники готовы. Оплата 45 000 KZT на Kaspi сразу по готовности.',
    notes: 'Срочный заказ на 1 ролик, фикс на Kaspi',
  },
  {
    id: 'gig_ru_16',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@media_jobs',
    confidence: 1.0,
    text: 'Нужен монтаж обучающего видеоурока для платформы (15 минут). Добавить слайды, приближения спикера, почистить оговорки. 8000 руб за видео. Отклик в ЛС.',
    notes: 'Монтаж урока, оплата за видео',
  },
  {
    id: 'gig_ru_17',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@insta_leads',
    confidence: 1.0,
    text: 'Ищу человека для субтитров и анимации текста на 20 коротких видео (Reels). Шаблон предоставим. Оплата 1000 ₸ за ролик (20 000 ₸ за все).',
    notes: 'Субтитры и нарезка, оплата за штуку',
  },
  {
    id: 'gig_ru_18',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@crypto_media',
    confidence: 1.0,
    text: 'Ищем YouTube editor для крипто-канала. Формат: эксплейнеры 8-12 мин с графикой и футажами. Оплата от 200$ до 300$ за ролик в USDT. ТЗ и пример: @crypto_media_lead',
    notes: 'Крипто-эксплейнеры, оплата за ролик в USDT',
  },
  {
    id: 'gig_ru_19',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@almaty_jobs',
    confidence: 1.0,
    text: 'Проектная работа: смонтировать видеоотчет с конференции в Алматы (динамичный ролик 2.5 мин). Бюджет 60 000 тг. Срок сдачи — 5 дней. Пишите в тг @conf_almaty',
    notes: 'Проектный видеоотчет, 60к тг',
  },
  {
    id: 'gig_ru_20',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@reels_agency',
    confidence: 1.0,
    text: 'Ищем рилсмейкера на сдельный фриланс для стоматологии. 12 роликов в месяц, платим 6000 KZT за готовый рилс. Исходники снимает наш мобилограф.',
    notes: 'Сдельный фриланс для рилсмейкера',
  },

  // English Gigs
  {
    id: 'gig_en_01',
    lang: 'en',
    label: 'gig',
    source: 'upwork:alert',
    confidence: 1.0,
    text: 'Looking for a YouTube video editor for a 15-minute tech review. Raw footage provided with script. Need dynamic zooms, sound effects, B-roll insertion. Fixed-price $150 per video. Deadline: 48 hours.',
    notes: 'YouTube tech review, fixed price per video',
  },
  {
    id: 'gig_en_02',
    lang: 'en',
    label: 'gig',
    source: 'reddit:r/CreatorServices',
    confidence: 1.0,
    text: '[Hiring] Need a short-form video editor to create 10 TikTok / Instagram Reels from my long podcast. Budget is $20 per reel ($200 total). Paid test reel required. Contact me on Discord or Reddit DM.',
    notes: 'Short-form batch, per-reel budget, paid test',
  },
  {
    id: 'gig_en_03',
    lang: 'en',
    label: 'gig',
    source: 'upwork:alert',
    confidence: 1.0,
    text: 'Video editor needed for one-time project: 30-second commercial promo video for Kickstarter campaign. Must be proficient in Premiere Pro and After Effects. Budget: $300 fixed price. Portfolio required.',
    notes: 'One-time project, fixed price $300',
  },
  {
    id: 'gig_en_04',
    lang: 'en',
    label: 'gig',
    source: 'tg:@remote_video_jobs',
    confidence: 1.0,
    text: 'Freelance gig: need motion graphics editor to create animated lower thirds and intro sequence for YouTube show. One-off gig, $250 flat fee. Apply with portfolio links to @show_creator.',
    notes: 'One-off freelance gig, flat fee',
  },
  {
    id: 'gig_en_05',
    lang: 'en',
    label: 'gig',
    source: 'upwork:alert',
    confidence: 1.0,
    text: 'Looking for a skilled retention video editor for weekly YouTube finance videos. Pay is $180 - $250 per finished episode. Freelance / project based. No full-time commitment, work on your own schedule.',
    notes: 'Project based, pay per episode, freelance',
  },
  {
    id: 'gig_en_06',
    lang: 'en',
    label: 'gig',
    source: 'reddit:r/forhire',
    confidence: 1.0,
    text: '[Hiring] Video editor for gaming highlights montage (CS2 / Valorant). 8-10 minutes video. Budget: $100. Fast turnaround needed. DM with previous gaming montage examples.',
    notes: 'Gaming highlights, fixed budget $100',
  },
  {
    id: 'gig_en_07',
    lang: 'en',
    label: 'gig',
    source: 'tg:@global_editors',
    confidence: 1.0,
    text: 'Urgent task: need color grading in DaVinci Resolve for 10-minute short film. Budget is $200. LUTs and raw footage ready on Google Drive. Deliverable by Friday.',
    notes: 'Color grading gig, flat $200, deadline',
  },
  {
    id: 'gig_en_08',
    lang: 'en',
    label: 'gig',
    source: 'upwork:alert',
    confidence: 1.0,
    text: 'Short-form editor wanted to repurpose YouTube videos into 9:16 Shorts with Alex Hormozi style captions. $15 per short, batch of 15 shorts ($225).',
    notes: 'Repurpose shorts, fixed batch price',
  },
  {
    id: 'gig_en_09',
    lang: 'en',
    label: 'gig',
    source: 'reddit:r/CreatorServices',
    confidence: 1.0,
    text: '[Hiring] Seeking a podcast video editor for a 2-host interview show. Audio cleanup, multi-cam cut, intro/outro. $80 per episode, 2 episodes per month.',
    notes: 'Podcast multi-cam, pay per episode',
  },
  {
    id: 'gig_en_10',
    lang: 'en',
    label: 'gig',
    source: 'upwork:alert',
    confidence: 1.0,
    text: 'One-time video editing project: edit wedding highlights video (4 minutes) with emotional cinematic pacing and music licensing. Budget: $350. Turnaround: 7 days.',
    notes: 'Wedding highlights one-time project',
  },

  // Kazakh Gigs
  {
    id: 'gig_kz_01',
    lang: 'kz',
    label: 'gig',
    source: 'tg:@digital_iskra',
    confidence: 1.0,
    text: 'Бейнемонтажер қажет: YouTube арнаға сұхбат монтаждау (40 минут). Екі камера, түс түзету, субтитр. Бір видеоға 35 000 теңге төлейміз. Портфолиоңызды @iskra_admin жіберіңіз.',
    notes: 'Сұхбат монтаждау, бір видеоға 35к тг',
  },
  {
    id: 'gig_kz_02',
    lang: 'kz',
    label: 'gig',
    source: 'tg:@almaty_rabotao',
    confidence: 1.0,
    text: 'Шұғыл! Reels монтаж жасайтын маман іздейміз. 5 ролик нарезка жасау керек. Бюджет 25 000 ₸. Тапсырыс бір реттік. Байланыс: @almaty_media',
    notes: 'Бір реттік тапсырыс, 5 ролик, 25к',
  },
  {
    id: 'gig_kz_03',
    lang: 'kz',
    label: 'gig',
    source: 'tg:@kaz_freelance',
    confidence: 1.0,
    text: 'Видеомонтажер іздейміз: подкаст пен қысқа видеоларды кесу, Premiere Pro / CapCut. Әр роликке 4000 тг. Аптасына 3-4 ролик. Қашықтан жұмыс.',
    notes: 'Әр роликке 4000 тг, фриланс',
  },
  {
    id: 'gig_kz_04',
    lang: 'kz',
    label: 'gig',
    source: 'tg:@digitalbussinesskz',
    confidence: 1.0,
    text: 'Жобалық жұмыс: конференцияның бейнебаянын монтаждау (3 минут). Бюджет 50 000 KZT. Дедлайн: 3 күн. Жазыңыз: @kaz_conf',
    notes: 'Жобалық жұмыс, бейнебаян, 50к KZT',
  },
  {
    id: 'gig_kz_05',
    lang: 'kz',
    label: 'gig',
    source: 'tg:@astana_creative',
    confidence: 1.0,
    text: 'Мобилограф / рилсмейкер қажет: дайын видеолардан 10 Shorts жасап беру керек. Жалпы ақысы 40 000 теңге. ТЗ бар.',
    notes: '10 Shorts жасау, 40 000 теңге',
  },

  // More RU/EN Gigs
  {
    id: 'gig_ru_21',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@freelance_tg',
    confidence: 1.0,
    text: 'Заказ на монтаж YouTube-ролика про путешествия (12 минут). Стиль динамичный, звуки природы, тревел-музыка. Оплата 12 000 руб за ролик. Тестовое 30 сек оплачивается. @travel_lead',
    notes: 'YouTube путешествия, ставка за ролик',
  },
  {
    id: 'gig_ru_22',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@edits_kz',
    confidence: 1.0,
    text: 'Требуется монтажер на 1 ролик для строительной компании (презентация ЖК, 1.5 мин, моушн графика, инфографика цен). Бюджет 80 000 тенге. Сдать за 4 дня.',
    notes: 'Презентация ЖК, разовый ролик, 80к тенге',
  },
  {
    id: 'gig_ru_23',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@reels_maker_pro',
    confidence: 1.0,
    text: 'Ищу монтажера на постоянный проект: нарезка подкаста на 20-30 Reels/Shorts в месяц. Оплата 4000 тг за ролик сразу после утверждения. Без офиса и графиков, свободный фриланс.',
    notes: 'Постоянный проект с оплатой за штуку, фриланс',
  },
  {
    id: 'gig_ru_24',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@youtube_hub',
    confidence: 1.0,
    text: 'Срочно нужен монтажер на игровой YouTube канал! Ролик 15 мин по Minecraft, нарезка смешных моментов, мемы, звуки. Бюджет 5000 руб. Срок 2 дня. @mine_edit',
    notes: 'Игровой монтаж, фикс бюджет',
  },
  {
    id: 'gig_ru_25',
    lang: 'ru',
    label: 'gig',
    source: 'tg:@motion_jobs',
    confidence: 1.0,
    text: 'Разовый проект: анимировать логотип и сделать переход для видеоблога в After Effects. Бюджет 70$. ТЗ в прикрепленном файле, пишите в ЛС.',
    notes: 'Анимация логотипа, разовый проект $70',
  },

  // ==========================================
  // 2. FULLTIME / ШТАТ / ОФИС (~35 примеров)
  // ==========================================
  {
    id: 'fulltime_ru_01',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@hh_ru',
    confidence: 1.0,
    text: 'Вакансия: видеомонтажер в штат. Полный рабочий день, график 5/2, работа в офисе в Алматы (БЦ Нурлы Тау). Оклад 400 000 тг + соцпакет, оформление по ТК РК. Испытательный срок 2 месяца. Отправляйте резюме HR: hr@media.kz',
    notes: 'Штат, офис, 5/2, оклад, ТК, испытательный срок',
  },
  {
    id: 'fulltime_ru_02',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@work_ru',
    confidence: 1.0,
    text: 'Ищем в штат компании видеомонтажёра на постоянную работу. График работы 5/2 с 9:00 до 18:00. Фиксированный оклад 120 000 руб, оплачиваемый отпуск и больничные, ДМС. Присылайте ваше резюме и портфолио.',
    notes: 'В штат, 5/2, оклад, больничные, отпуск, резюме',
  },
  {
    id: 'fulltime_ru_03',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@it_jobs_kz',
    confidence: 1.0,
    text: 'Открыта вакансия: Video Editor (full-time remote). 40 часов в неделю, фиксированная зарплата 1500$/месяц. Обязателен трекинг рабочего времени (Hubstaff). Соцпакет, отпуск 28 дней.',
    notes: 'Full-time, 40 hrs/week, трекинг времени, зарплата в месяц',
  },
  {
    id: 'fulltime_ru_04',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@media_staff',
    confidence: 1.0,
    text: 'Телеканал ищет монтажера новостей в штат. Сменный график 2/2, работа в студии/офисе, официальное трудоустройство, белая зарплата по трудовому договору, испытательный срок 3 месяца.',
    notes: 'Телеканал, в штат, студия, белая зарплата, трудовой договор',
  },
  {
    id: 'fulltime_ru_05',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@job_marketing',
    confidence: 1.0,
    text: 'Ищем штатного рилсмейкера и монтажера в офис в Астане. Рабочий день с 10:00 до 19:00, понедельник-пятница. Зарплата 350 000 тенге/мес. Обязанности: монтаж видеоконтента компании на постоянной основе.',
    notes: 'Штатный рилсмейкер в офис, 10-19, пн-пт, оклад в месяц',
  },
  {
    id: 'fulltime_ru_06',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@remote_ru',
    confidence: 1.0,
    text: 'Вакансия: Видеомонтажер YouTube (Full-time). Зарплата 90 000 руб/месяц. Полная занятость, 8 часов в день, быть на связи в Slack весь рабочий день. Разовые заказы не рассматриваем!',
    notes: 'Full-time, 8 часов в день, запрет разовых заказов',
  },
  {
    id: 'fulltime_ru_07',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@hr_creative',
    confidence: 1.0,
    text: 'Маркетинговое агентство нанимает в штат видеомонтажера. Оформление по ТК РФ с первого дня, оклад от 80к + KPI. Испытательный срок 1 месяц. Резюме отправлять нашему HR @hr_recruiter.',
    notes: 'Оформление по ТК, оклад + KPI, испытательный срок',
  },
  {
    id: 'fulltime_ru_08',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@digital_jobs',
    confidence: 1.0,
    text: 'Ищем видеомонтажера в команду на фуллтайм. Работа в офисе г. Алматы. Полный соцпакет, оплата фитнеса, медстраховка. ЗП 500 000 KZT gross. График 5/2.',
    notes: 'Фуллтайм в офис, медстраховка, 5/2, оклад gross',
  },
  {
    id: 'fulltime_ru_09',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@astana_rabota',
    confidence: 1.0,
    text: 'Требуется видеомонтажер в госучреждение. Офис в центре Астаны, пятидневка, стабильный оклад 280 000 тг, пенсионные отчисления, соцпакет. Резюме отправлять на почту kense@gov.kz.',
    notes: 'Госучреждение, пятидневка, пенсионные отчисления',
  },
  {
    id: 'fulltime_ru_10',
    lang: 'ru',
    label: 'fulltime',
    source: 'tg:@production_crew',
    confidence: 1.0,
    text: 'Продакшн студия расширяет постоянный штат: требуется ведущий видеомонтажер. Полный день, оклад 150 000 руб, премии за переработки, контракт на 1 год. Фрилансеров просим не беспокоить.',
    notes: 'Постоянный штат, контракт на год, отсечение фрилансеров',
  },

  // English Full-time
  {
    id: 'fulltime_en_01',
    lang: 'en',
    label: 'fulltime',
    source: 'upwork:alert',
    confidence: 1.0,
    text: 'Full-time Video Editor needed for digital agency. 40+ hours per week, ongoing contract, $2500 - $3500 monthly salary. Must be available during US EST hours 9am-5pm. Health benefits included after 3-month probation.',
    notes: 'Full-time, 40+ hrs/week, monthly salary, probation',
  },
  {
    id: 'fulltime_en_02',
    lang: 'en',
    label: 'fulltime',
    source: 'reddit:r/forhire',
    confidence: 1.0,
    text: '[Hiring] Full-time in-house Video Editor for eCommerce brand. Location: London office (hybrid 3 days in office). Salary: £35,000 - £42,000 per year. Permanent position with pension and 25 days annual leave.',
    notes: 'In-house, office, per year salary, permanent, pension',
  },
  {
    id: 'fulltime_en_03',
    lang: 'en',
    label: 'fulltime',
    source: 'upwork:alert',
    confidence: 1.0,
    text: 'Hiring full-time video editor for long-term ongoing agency staffing. 30 to 40 hrs/week. Must clock in with Time Doctor. Looking for dedicated full-time team member only, no freelancers with other clients.',
    notes: 'Agency staffing, Time Doctor, dedicated full-time only',
  },
  {
    id: 'fulltime_en_04',
    lang: 'en',
    label: 'fulltime',
    source: 'tg:@remote_global',
    confidence: 1.0,
    text: 'Permanent role: Senior Video Editor at MediaCorp. Full time, 40 hrs/wk, annual salary $50k-$65k, paid time off, health insurance. Submit your resume/CV to careers@mediacorp.com.',
    notes: 'Permanent role, annual salary, PTO, insurance, resume/CV',
  },
  {
    id: 'fulltime_en_05',
    lang: 'en',
    label: 'fulltime',
    source: 'reddit:r/videohiring',
    confidence: 1.0,
    text: '[Hiring] Full-time YouTube Video Editor. 40 hours/week dedicated. Monthly retainer $2000. 90-day probationary period. Must sign non-compete clause.',
    notes: '40 hours/week, monthly retainer, 90-day probationary',
  },

  // Kazakh Full-time
  {
    id: 'fulltime_kz_01',
    lang: 'kz',
    label: 'fulltime',
    source: 'tg:@digital_iskra',
    confidence: 1.0,
    text: 'Штатқа видеомонтажер қажет. Жұмыс уақыты 5/2, 09:00 - 18:00, Алматы қаласындағы кеңседе. Айлық жалақы 350 000 теңге, еңбек шарты (ТК РК), сынақ мерзімі 2 ай. Түйіндемеңізді HR бөліміне жіберіңіз.',
    notes: 'Штатқа, 5/2, кеңседе, айлық жалақы, сынақ мерзімі, түйіндеме',
  },
  {
    id: 'fulltime_kz_02',
    lang: 'kz',
    label: 'fulltime',
    source: 'tg:@almaty_rabotao',
    confidence: 1.0,
    text: 'Компанияға бейнемонтажер жұмысқа қабылданады. Толық жұмыс күні, ресми тіркеу, әлеуметтік пакет, оклад 400 000 тг. Тек кеңседе жұмыс істейтіндер қажет.',
    notes: 'Толық жұмыс күні, ресми тіркеу, әлеуметтік пакет, оклад',
  },

  // ==========================================
  // 3. SELLER / ПРЕДЛОЖЕНИЕ УСЛУГ СОИСКАТЕЛЕМ (~30 примеров)
  // ==========================================
  {
    id: 'seller_ru_01',
    lang: 'ru',
    label: 'seller',
    source: 'tg:@freelance_chat',
    confidence: 1.0,
    text: 'Привет всем! Я опытный видеомонтажер, монтирую ролики для YouTube, Reels, TikTok. Работаю в Premiere Pro, After Effects, DaVinci. Моё портфолио: https://t.me/my_portfolio. Возьму заказы, пишите в ЛС!',
    notes: 'Я опытный видеомонтажер, возьму заказы',
  },
  {
    id: 'seller_ru_02',
    lang: 'ru',
    label: 'seller',
    source: 'tg:@almaty_board',
    confidence: 1.0,
    text: 'Ищу работу / подработку видеомонтажером. Опыт 4 года, смонтирую для вас динамичные рилсы или длинные интервью. Цены доступные, делаю быстро. Контакты: @editor_ivan',
    notes: 'Ищу работу/подработку, смонтирую для вас',
  },
  {
    id: 'seller_ru_03',
    lang: 'ru',
    label: 'seller',
    source: 'tg:@reels_chat',
    confidence: 1.0,
    text: 'Предлагаю услуги монтажа Reels и Shorts под ключ. Наложу субтитры, добавлю звуки, подберу музыку. Первое тестовое видео смонтирую со скидкой 50%. Мои работы: @reels_samples',
    notes: 'Предлагаю услуги монтажа, со скидкой',
  },
  {
    id: 'seller_ru_04',
    lang: 'ru',
    label: 'seller',
    source: 'tg:@video_creators',
    confidence: 1.0,
    text: 'Смонтирую видео любой сложности! Свадьбы, корпоративы, YouTube выпуски, реклама. Цветокоррекция, саунд-дизайн, моушн. Открыт к сотрудничеству, пишите в телеграм.',
    notes: 'Смонтирую видео любой сложности, открыт к сотрудничеству',
  },
  {
    id: 'seller_ru_05',
    lang: 'ru',
    label: 'seller',
    source: 'tg:@freelance_kz',
    confidence: 1.0,
    text: 'Резюме: Видеомонтажер / Мобилограф (Алматы). О себе: 22 года, высшее образование, владею CapCut и Premiere. Ищу постоянных клиентов или проекты. Портфолио по ссылке.',
    notes: 'Резюме, О себе, ищу клиентов',
  },
  {
    id: 'seller_en_01',
    lang: 'en',
    label: 'seller',
    source: 'reddit:r/forhire',
    confidence: 1.0,
    text: '[For Hire] Professional Video Editor with 5 years experience in Premiere Pro & DaVinci. Available for YouTube, Reels and podcast editing. Rates start at $25/hour. Portfolio: vimeo.com/myreel',
    notes: '[For Hire], Available for hire, rates start at',
  },
  {
    id: 'seller_en_02',
    lang: 'en',
    label: 'seller',
    source: 'tg:@editors_global',
    confidence: 1.0,
    text: 'Hi creators! I am a video editor open to new gigs and clients. I specialize in high retention documentary editing and viral shorts. Check out my showreel: https://youtube.com/watch?v=sample',
    notes: 'I am a video editor open to new gigs, check my showreel',
  },
  {
    id: 'seller_en_03',
    lang: 'en',
    label: 'seller',
    source: 'reddit:r/CreatorServices',
    confidence: 1.0,
    text: '[For Hire] Hire me to edit your YouTube gaming videos! Fast turnaround, meme insertion, sound design. DM me on Discord for portfolio.',
    notes: '[For Hire], Hire me',
  },
  {
    id: 'seller_kz_01',
    lang: 'kz',
    label: 'seller',
    source: 'tg:@digital_iskra',
    confidence: 1.0,
    text: 'Сәлеметсіздер ме! Мен видеомонтажермін, тәжірибем 3 жыл. Reels, TikTok, YouTube видеоларын сапалы монтаждап беремін. Тапсырыс аламын, бағасы келісімді. Байланыс: @montazh_kz',
    notes: 'Мен видеомонтажермін, тапсырыс аламын',
  },

  // ==========================================
  // 4. COURSE / КУРСЫ / ИНФОБИЗНЕС (~25 примеров)
  // ==========================================
  {
    id: 'course_ru_01',
    lang: 'ru',
    label: 'course',
    source: 'tg:@info_biz',
    confidence: 1.0,
    text: 'Нужен монтажер? Хочешь освоить профессию видеомонтажера и зарабатывать от 500 000 тг на фрилансе? Записывайся на наш бесплатный 3-дневный интенсив по Premiere Pro!',
    notes: 'Лид-магнит с фразой «нужен монтажер?», курс',
  },
  {
    id: 'course_ru_02',
    lang: 'ru',
    label: 'course',
    source: 'tg:@skills_online',
    confidence: 1.0,
    text: 'Курс по монтажу рилс и шортс с нуля до первых клиентов! Научим работать в CapCut и After Effects, выдаем диплом. Скидка 40% до конца недели. Купить курс на сайте: https://course.io',
    notes: 'Курс по монтажу рилс, купить курс',
  },
  {
    id: 'course_ru_03',
    lang: 'ru',
    label: 'course',
    source: 'tg:@webinar_free',
    confidence: 1.0,
    text: 'Бесплатный вебинар сегодня в 19:00: Как видеомонтажеру выйти на зарубежный рынок и Upwork в 2026 году. Ссылка на регистрацию в боте.',
    notes: 'Бесплатный вебинар, обучение',
  },
  {
    id: 'course_ru_04',
    lang: 'ru',
    label: 'course',
    source: 'tg:@sliv_courses',
    confidence: 1.0,
    text: 'Слив курса по моушн дизайну и монтажу в After Effects от топовой школы. Скачать бесплатно в нашем закрытом канале.',
    notes: 'Слив курса, скачать бесплатно',
  },
  {
    id: 'course_ru_05',
    lang: 'ru',
    label: 'course',
    source: 'tg:@marafon_video',
    confidence: 1.0,
    text: 'Стартует онлайн-марафон по мобилографии и монтажу рилс! 14 дней практики, разборы домашних заданий. Стоимость участия 15 000 тенге.',
    notes: 'Онлайн-марафон, стоимость участия',
  },
  {
    id: 'course_en_01',
    lang: 'en',
    label: 'course',
    source: 'tg:@creative_learn',
    confidence: 1.0,
    text: 'Do you need video editor skills? Master Premiere Pro and DaVinci in 30 days! Join our masterclass bootcamp. Early bird discount code inside.',
    notes: 'Masterclass bootcamp, course promo',
  },

  // ==========================================
  // 5. OTHER PROFESSION / СМЕЖНЫЕ ПРОФЕССИИ (~25 примеров)
  // ==========================================
  {
    id: 'other_ru_01',
    lang: 'ru',
    label: 'other_profession',
    source: 'tg:@digital_jobs_kz',
    confidence: 1.0,
    text: 'Ищем SMM-специалиста в строительную компанию. Обязанности: ведение соцсетей, копирайтинг постов, настройка таргета в Instagram, базовый видеомонтаж сторис и рилс на телефоне. Оплата 200 000 тг.',
    notes: 'SMM-специалист, монтаж упомянут вскользь',
  },
  {
    id: 'other_ru_02',
    lang: 'ru',
    label: 'other_profession',
    source: 'tg:@almaty_jobs',
    confidence: 1.0,
    text: 'В маркетинговое агентство требуется таргетолог / контекстолог. Настройка рекламы Facebook/Google, аналитика, подготовка ТЗ дизайнерам, иногда монтаж креативов. ЗП 350 000 тг.',
    notes: 'Таргетолог, монтаж креативов вторичен',
  },
  {
    id: 'other_ru_03',
    lang: 'ru',
    label: 'other_profession',
    source: 'tg:@design_board',
    confidence: 1.0,
    text: 'Требуется графический дизайнер для маркетплейсов (Wildberries, Ozon). Создание инфографики карточек товара, баннеров, видеомонтаж обложек. Оплата за карточку.',
    notes: 'Графический дизайнер инфографики',
  },
  {
    id: 'other_ru_04',
    lang: 'ru',
    label: 'other_profession',
    source: 'tg:@content_job',
    confidence: 1.0,
    text: 'Ищем копирайтера и сценариста для YouTube канала. Написание сценариев, ресерч тем, подбор референсов монтажеру. Оплата 10 000 руб за сценарий.',
    notes: 'Копирайтер/сценарист',
  },
  {
    id: 'other_en_01',
    lang: 'en',
    label: 'other_profession',
    source: 'reddit:r/forhire',
    confidence: 1.0,
    text: '[Hiring] Social Media Manager for fitness brand. Manage Instagram & TikTok accounts, write captions, post daily, basic video editing of phone clips. $500/month.',
    notes: 'Social Media Manager primary role',
  },

  // ==========================================
  // 6. SPAM / СТРОИТЕЛЬНЫЙ МОНТАЖ / СКАМ (~20 примеров)
  // ==========================================
  {
    id: 'spam_ru_01',
    lang: 'ru',
    label: 'spam',
    source: 'tg:@almaty_stroy',
    confidence: 1.0,
    text: 'Срочно требуется монтаж кондиционеров и сплит-систем в бизнес-центре. Оплата 25 000 тг за блок. Бригада монтажников звоните по номеру.',
    notes: 'Строительный монтаж кондиционеров',
  },
  {
    id: 'spam_ru_02',
    lang: 'ru',
    label: 'spam',
    source: 'tg:@otdelka_kz',
    confidence: 1.0,
    text: 'Выполняем монтаж натяжных потолков любой сложности! Матовые, глянцевые, световые линии. Демонтаж старых потолков. Замер бесплатно.',
    notes: 'Монтаж натяжных потолков',
  },
  {
    id: 'spam_ru_03',
    lang: 'ru',
    label: 'spam',
    source: 'tg:@stroy_jobs',
    confidence: 1.0,
    text: 'Требуются рабочие на монтаж металлоконструкций и сэндвич-панелей. Вахта 15/15, питание и проживание за счет компании.',
    notes: 'Монтаж металлоконструкций вахта',
  },
  {
    id: 'spam_ru_04',
    lang: 'ru',
    label: 'spam',
    source: 'tg:@easy_money',
    confidence: 1.0,
    text: 'Удаленная подработка для всех! Видеомонтаж не требуется, ставьте лайки и смотрите видео за деньги. Вывод от 500 рублей сразу на карту. Ссылка в описании.',
    notes: 'Спам-развод / легкие деньги',
  },
  {
    id: 'spam_ru_05',
    lang: 'ru',
    label: 'spam',
    source: 'tg:@crypto_spam',
    confidence: 1.0,
    text: 'Заработок на арбитраже криптовалют! Спред 8% за круг. Ищем партнеров в команду, вкладывать ничего не надо. Переходите в бота.',
    notes: 'Крипто-спам',
  },
];

// Enrich with extra varied real-world cases to hit 165+ items
const additionalGigs = [
  {
    text: 'Нужен монтажер нарезки Reels из стрима (10 штук). Оплата 30 000 KZT за пачку. Срок 3 дня.',
    lang: 'ru',
    label: 'gig',
    notes: 'Нарезка рилс пачкой',
  },
  {
    text: 'Ищу видеомонтажера в Алматы смонтировать отчетный ролик с детского дня рождения (3 минуты). Исходники с iPhone. 20 000 тг. Пишите @kids_party',
    lang: 'ru',
    label: 'gig',
    notes: 'Семейное видео / отчет',
  },
  {
    text: 'Требуется цветокорректор в DaVinci Resolve для музыкального клипа. Материал в RAW. Бюджет 100$. Дедлайн понедельник.',
    lang: 'ru',
    label: 'gig',
    notes: 'Цветокор музыкального клипа',
  },
  {
    text: 'Ищем монтажера на тестовый YouTube ролик (10 мин). Если сработаемся — будем заказывать по 4 ролика в месяц с оплатой 100$ за ролик. Тестовое оплачиваем.',
    lang: 'ru',
    label: 'gig',
    notes: 'Тестовый ролик с оплатой, перспектива регулярного фриланса',
  },
  {
    text: 'Looking for a video editor to cut a 5-minute Kickstarter product showcase. Clean cuts, text callouts, sound design. Budget: $200. Send portfolio.',
    lang: 'en',
    label: 'gig',
    notes: 'Kickstarter showcase $200',
  },
  {
    text: 'Need an editor for 3 Instagram Reels for a real estate agent. Horizontal to vertical framing, subtitling, upbeat music. $40 each ($120 total).',
    lang: 'en',
    label: 'gig',
    notes: 'Real estate reels batch',
  },
  {
    text: 'YouTube documentary editor needed for 18-minute video essay. Motion graphics, maps animation, archive footage search. Pay is $350 per project.',
    lang: 'en',
    label: 'gig',
    notes: 'Video essay project $350',
  },
  {
    text: 'Reels монтажшысы қажет. 15 секундтық 4 жарнамалық ролик дайындау керек. Төлемі 20 000 тенге. Жұмыс қашықтан.',
    lang: 'kz',
    label: 'gig',
    notes: '4 жарнамалық ролик 20к',
  },
  {
    text: 'Бейнемонтаж жасайтын адам керек: тойдың қысқаша видеобаяны (клип 3 минут). 35 000 тг төлеймін.',
    lang: 'kz',
    label: 'gig',
    notes: 'Тойдың қысқаша видеобаяны',
  },
  {
    text: 'Срочный заказ: вырезать слова-паразиты и склеить 2 камеры для лекции на 1 час. Бюджет 15 000 руб. Готовность сегодня ночью.',
    lang: 'ru',
    label: 'gig',
    notes: 'Срочная склейка лекции',
  },
];

const additionalFulltime = [
  {
    text: 'Вакансия: Видеомонтажер (штат, полный день). График 5/2, работа в офисе г. Москва. Оклад 90 000 руб, оформление по ТК, ДМС со стоматологией.',
    lang: 'ru',
    label: 'fulltime',
    notes: 'Штат, офис, ТК, оклад',
  },
  {
    text: 'Ищем монтажера на постоянку в офис в Алматы. Пятидневка с 9 до 18, официальное трудоустройство, соцотчисления, оклад 320 000 KZT.',
    lang: 'ru',
    label: 'fulltime',
    notes: 'Офис Алматы, пятидневка, соцотчисления',
  },
  {
    text: 'We are hiring a full-time Senior Video Editor. 40 hours per week, $4000/month salary, paid vacation, health benefits. Must work US Pacific hours.',
    lang: 'en',
    label: 'fulltime',
    notes: 'Full-time, 40 hrs/wk, monthly salary, benefits',
  },
  {
    text: 'Full-time permanent position: In-house Content Video Editor. On-site in New York office. Annual compensation $60k-$75k + 401(k) matching.',
    lang: 'en',
    label: 'fulltime',
    notes: 'On-site NYC, annual salary, 401k',
  },
  {
    text: 'Штатқа видеоинженер-монтажер қажет. Жұмыс кестесі 5/2, кеңсе, ресми жұмыс, айлық 300 000 теңге. Сынақ мерзімі қарастырылған.',
    lang: 'kz',
    label: 'fulltime',
    notes: 'Штатқа, 5/2, ресми жұмыс, сынақ мерзімі',
  },
  {
    text: 'Ищем в штат рекламного агентства моушн-дизайнера и монтажера. Полная занятость, оклад 130 000 руб + премии, испытательный срок 3 месяца.',
    lang: 'ru',
    label: 'fulltime',
    notes: 'В штат агентства, оклад, испытательный срок',
  },
  {
    text: 'Full-time long term contractor needed for 40 hours/week. Monthly salary $2200. Daily standup meetings at 8am EST. Dedicated hours required.',
    lang: 'en',
    label: 'fulltime',
    notes: '40 hrs/week, daily standups, dedicated',
  },
];

const additionalSellers = [
  {
    text: 'Я видеомонтажер с 3-летним стажем. Делаю монтаж роликов, шортсов, подкастов. Цены от 2000 руб. Мои кейсы: https://t.me/portfolio_link',
    lang: 'ru',
    label: 'seller',
    notes: 'Я видеомонтажер, мои кейсы',
  },
  {
    text: 'Ищу постоянных заказчиков на видеомонтаж и моушн графику. Готов выполнить тестовое бесплатно. Пишите в ЛС @my_telegram',
    lang: 'ru',
    label: 'seller',
    notes: 'Ищу заказчиков, тестовое бесплатно',
  },
  {
    text: '[For Hire] Experienced YouTube Video Editor ready for new projects. $20/hr or flat rate per video. Fast delivery. Check my portfolio in comments.',
    lang: 'en',
    label: 'seller',
    notes: '[For Hire], ready for new projects',
  },
  {
    text: 'Available for hire: Freelance video editor skilled in Premiere Pro, After Effects and sound design. DM for portfolio and rates.',
    lang: 'en',
    label: 'seller',
    notes: 'Available for hire',
  },
  {
    text: 'Мен рилсмейкермін, бейнебаян мен рилстарды монтаждаймын. Сапалы әрі жылдам. Тапсырыс қабылдаймын. @montazh_almaty',
    lang: 'kz',
    label: 'seller',
    notes: 'Мен рилсмейкермін, тапсырыс қабылдаймын',
  },
];

const additionalCourses = [
  {
    text: 'Нужен монтажер в команду? А может хочешь сам стать им? Запишись на наш курс «Профессия Видеомонтажер 2026» со скидкой 50%!',
    lang: 'ru',
    label: 'course',
    notes: 'Инфобиз курс с вопросом «нужен монтажер»',
  },
  {
    text: 'Бесплатный мастер-класс: Как с нуля освоить монтаж рилсов в CapCut и зарабатывать от 200 000 тг в месяц. Регистрация по ссылке.',
    lang: 'ru',
    label: 'course',
    notes: 'Мастер-класс заработок на рилс',
  },
  {
    text: 'Want to become a professional YouTube editor? Join our 6-week intensive editing academy. Learn Premiere Pro & Storytelling.',
    lang: 'en',
    label: 'course',
    notes: 'Editing academy course',
  },
];

const additionalSpam = [
  {
    text: 'Монтаж пластиковых окон и балконных рам в Алматы! Низкие цены, гарантия 5 лет. Замер бесплатно.',
    lang: 'ru',
    label: 'spam',
    notes: 'Монтаж окон',
  },
  {
    text: 'Монтаж и обслуживание систем вентиляции и кондиционирования. Промышленный монтаж оборудования.',
    lang: 'ru',
    label: 'spam',
    notes: 'Вентиляция и кондиционирование',
  },
  {
    text: 'Подработка без вложений: ставить лайки в TikTok и смотреть короткие видео. Платим до 3000 руб в день!',
    lang: 'ru',
    label: 'spam',
    notes: 'Спам-бот',
  },
];

// Combine all
let idCounter = 100;
for (const item of [
  ...additionalGigs,
  ...additionalFulltime,
  ...additionalSellers,
  ...additionalCourses,
  ...additionalSpam,
]) {
  leads.push({
    id: `auto_${item.label}_${idCounter++}`,
    lang: item.lang,
    label: item.label,
    source: 'synthetic:representative',
    confidence: 1.0,
    text: item.text,
    notes: item.notes,
  });
}

const extraDiverseLeads = [
  {
    text: 'Нужен монтажер на тестовый ролик для канала про авто. Если ролик зайдет — отдадим весь проект (4-6 роликов в месяц, 12к руб за ролик). Тестовое оплачивается.',
    lang: 'ru',
    label: 'gig',
    notes: 'Оплачиваемый тест, ставка за ролик',
  },
  {
    text: 'Ищем рилсмейкера со своим светом и камерой в Алматы на 1 съемочный день (снять и смонтировать 5 рилс). Бюджет 45 000 тг.',
    lang: 'ru',
    label: 'gig',
    notes: 'Разовый съемочный день и монтаж 5 рилс',
  },
  {
    text: 'Hiring video editor for a 20-minute video essay on film analysis. Must have great music choices and pacing. $220 fixed price. Portfolio required.',
    lang: 'en',
    label: 'gig',
    notes: 'Film analysis essay $220 fixed',
  },
  {
    text: 'Looking for a TikTok/Reels video editor to edit 15 viral clips from our podcast. $20 per clip ($300 total). Delivery in 5 days.',
    lang: 'en',
    label: 'gig',
    notes: '15 viral clips $300 total',
  },
  {
    text: 'Қысқа бейнероликтерге субтитр мен анимация қоятын монтажер керек. 5 видео, әрқайсысына 3000 теңге.',
    lang: 'kz',
    label: 'gig',
    notes: '5 видео әрқайсысына 3к тг',
  },
  {
    text: 'Вакансия: Видеомонтажер в штат компании (IT стартап). График 5/2, работа в офисе г. Астана. Зарплата 380 000 ₸, официальное трудоустройство, ДМС.',
    lang: 'ru',
    label: 'fulltime',
    notes: 'Штат IT стартап, 5/2, офис Астана',
  },
  {
    text: 'Full-time Video Editor. 40 hours/week, 9am - 5pm EST. $3000 monthly salary. 20 days PTO, health insurance. Dedicated full-time only.',
    lang: 'en',
    label: 'fulltime',
    notes: 'Full-time 40 hrs/wk, 9-5 EST, monthly salary',
  },
  {
    text: 'Штаттық бейнемонтажер. Кеңсе, 5/2, айлық 350 000 тг, ресми келісімшарт, еңбек демалысы төленеді.',
    lang: 'kz',
    label: 'fulltime',
    notes: 'Штаттық, кеңсе, 5/2, еңбек демалысы',
  },
  {
    text: 'Я видеомонтажер, работаю в Premiere Pro и After Effects. Ищу разовые или постоянные заказы. Портфолио: t.me/my_video_portfolio',
    lang: 'ru',
    label: 'seller',
    notes: 'Я видеомонтажер, ищу заказы',
  },
  {
    text: '[For Hire] Freelance Video Editor available for YouTube and TikTok. Affordable rates starting at $15/hr. Check portfolio in bio.',
    lang: 'en',
    label: 'seller',
    notes: '[For Hire] Available for YouTube',
  },
  {
    text: 'Курс «Монтаж видео в DaVinci Resolve с нуля до PRO». 8 недель онлайн, сертификат, рассрочка. Запишитесь на бесплатный урок.',
    lang: 'ru',
    label: 'course',
    notes: 'Курс в DaVinci',
  },
  {
    text: 'Ищем проджект-менеджера в веб-студию: постановка задач разработчикам, контроль дедлайнов, иногда монтаж демо-роликов продукта.',
    lang: 'ru',
    label: 'other_profession',
    notes: 'Проджект-менеджер',
  },
  {
    text: 'Требуется контент-мейкер / сценарист для TikTok аккаунта. Написание сценариев, генерация идей, съемка на телефон. 150 000 тг.',
    lang: 'ru',
    label: 'other_profession',
    notes: 'Контент-мейкер/сценарист',
  },
  {
    text: 'Монтаж секционных ворот и рольставней в частные дома и гаражи. Выезд мастера в день звонка.',
    lang: 'ru',
    label: 'spam',
    notes: 'Монтаж секционных ворот',
  },
  {
    text: 'Монтаж сайдинга и фасадных панелей под ключ. Бригада со своим инструментом.',
    lang: 'ru',
    label: 'spam',
    notes: 'Монтаж сайдинга',
  },
];

for (const item of extraDiverseLeads) {
  leads.push({
    id: `extra_${item.label}_${idCounter++}`,
    lang: item.lang,
    label: item.label,
    source: 'synthetic:diverse',
    confidence: 1.0,
    text: item.text,
    notes: item.notes,
  });
}

// Generate more systematic realistic examples across all classes to comfortably reach 170+ items
const gigTemplates = [
  {
    text: 'Ищу монтажера на проектный монтаж интервью (2 камеры, звук сведен). Бюджет 45 000 ₸. Дедлайн 3 дня.',
    lang: 'ru',
    notes: 'Интервью проектный монтаж',
  },
  {
    text: 'Нужен рилсмейкер на 5 экспертных роликов про недвижимость в Дубае. Оплата 5000 руб за ролик.',
    lang: 'ru',
    notes: '5 экспертных рилс фикс',
  },
  {
    text: 'Требуется видеомонтажер для нарезки подкаста на Shorts (пачка 15 штук). Оплата 150$. ТЗ в лс @pod_prod',
    lang: 'ru',
    notes: 'Нарезка подкаста 15 шт',
  },
  {
    text: 'Заказ на цветокоррекцию 10-минутного короткого метра в DaVinci Resolve. Бюджет 200$. Сдать до пятницы.',
    lang: 'ru',
    notes: 'Цветокор короткого метра',
  },
  {
    text: 'Разовый заказ: смонтировать промо-ролик мобильного приложения (30 сек) с моушн-графикой. Бюджет 60 000 тенге.',
    lang: 'ru',
    notes: 'Промо 30 сек моушн',
  },
  {
    text: 'Looking for a video editor for a 10-minute YouTube video about personal finance. Pay is $150 per video. Fixed price contract.',
    lang: 'en',
    notes: 'YouTube finance $150 fixed',
  },
  {
    text: 'Need a short-form video editor for TikTok / Reels. 10 videos batch, $25 each ($250 total). Apply with portfolio.',
    lang: 'en',
    notes: 'Short-form batch $250',
  },
  {
    text: 'One-time gig: edit an event highlight recap video (2 minutes). Budget: $180. Deadline: next Monday.',
    lang: 'en',
    notes: 'Event highlight $180',
  },
  {
    text: 'Бейнемонтажер қажет: 10 қысқа роликке субтитр мен музыка қою. Төлемі 30 000 теңге. Байланыс @media_kz',
    lang: 'kz',
    notes: '10 роликке субтитр 30к тг',
  },
  {
    text: 'YouTube видеосына монтаж жасайтын фрилансер іздеймін. 15 минуттық видео, ақысы 20 000 ₸ бір ролик үшін.',
    lang: 'kz',
    notes: 'YouTube фрилансер 20к бір ролик',
  },
  {
    text: 'Нужен монтажер YouTube: динамичный монтаж в стиле Ali Abdaal / MrBeast. Оплата 12 000 руб за ролик. Исходники 40 мин.',
    lang: 'ru',
    notes: 'YouTube стиль Ali Abdaal',
  },
  {
    text: 'Ищем монтажера на регулярный фриланс: 8-10 Reels в месяц для фитнес-тренера. 4000 тг за ролик по факту сдачи.',
    lang: 'ru',
    notes: 'Регулярный фриланс для тренера',
  },
  {
    text: 'Freelance video editor wanted for documentary-style YouTube video. Budget: $250. Rough cut + fine cut. Premiere Pro preferred.',
    lang: 'en',
    notes: 'Documentary style $250',
  },
  {
    text: 'Need an editor to turn raw Zoom webinar into 3 digestible video clips with intro/outro and branding. $90 fixed budget.',
    lang: 'en',
    notes: 'Webinar into 3 clips $90',
  },
  {
    text: 'Подкастқа видеомонтаж жасау керек. 1 шығарылым, хронометраж 35 мин. Бюджет 25 000 тг. Жазыңыз: @pod_kz',
    lang: 'kz',
    notes: 'Подкаст 1 шығарылым 25к',
  },
  {
    text: 'Срочно требуется видеомонтажер на 1 ролик для презентации стартапа (60 сек). Бюджет 50 000 KZT.',
    lang: 'ru',
    notes: 'Презентация стартапа 50к',
  },
  {
    text: 'Seeking a freelance video editor for travel vlog episode (12 min). Color grading and sound design required. $160 per episode.',
    lang: 'en',
    notes: 'Travel vlog $160',
  },
  {
    text: 'На разовый проект нужен моушн дизайнер: сделать 2D анимацию персонажа для эксплейнера (20 сек). Бюджет 15 000 руб.',
    lang: 'ru',
    notes: '2D анимация эксплейнер',
  },
  {
    text: 'Ищу монтажера для нарезки хайлайтов со свадьбы (клип 3 минуты). Красивый цвет, чувственная музыка. Бюджет 40 000 тенге.',
    lang: 'ru',
    notes: 'Хайлайты со свадьбы 40к',
  },
  {
    text: 'Need YouTube Shorts editor for daily motivational clips. Batch of 20 shorts, $15 each ($300 total). Long-term freelance opportunity.',
    lang: 'en',
    notes: 'Batch of 20 shorts $300',
  },
];

for (const t of gigTemplates) {
  leads.push({
    id: `auto_gig_${idCounter++}`,
    lang: t.lang,
    label: 'gig',
    source: 'synthetic:verified_gig',
    confidence: 1.0,
    text: t.text,
    notes: t.notes,
  });
}

const fulltimeTemplates = [
  {
    text: 'Вакансия: Видеомонтажер в штат продакшна. Полная занятость 5/2, работа в офисе, оклад 100 000 руб, оформление по ТК РФ, ДМС.',
    lang: 'ru',
    notes: 'Штат, 5/2, ТК, ДМС',
  },
  {
    text: 'Ищем монтажера на постоянную работу в штат. График 5/2 с 10:00 до 19:00, оклад 350 000 тг в месяц, соцпакет, оплачиваемый отпуск.',
    lang: 'ru',
    notes: 'В штат, 5/2, оклад в месяц, соцпакет',
  },
  {
    text: 'Full-time Video Editor. 40 hrs/wk, dedicated remote position. Monthly salary $3000. 30 days paid vacation, health insurance.',
    lang: 'en',
    notes: 'Full-time, 40 hrs/wk, monthly salary',
  },
  {
    text: 'Hiring In-House Video Editor for advertising agency. Office-based in London. Annual salary £38,000, permanent employment contract.',
    lang: 'en',
    notes: 'In-house, annual salary, permanent contract',
  },
  {
    text: 'Штатқа видеомонтажер іздейміз. Жұмыс кестесі 5/2, кеңседе, тұрақты жалақы 300 000 тг, ресми жұмысқа орналасу.',
    lang: 'kz',
    notes: 'Штатқа, кеңседе, тұрақты жалақы, ресми',
  },
  {
    text: 'Вакансия: Штатный видеомонтажер на ТВ-канал. Сменный график, студия, белая зарплата, трудовая книжка, соцпакет.',
    lang: 'ru',
    notes: 'Штатный видеомонтажер, ТВ-канал, трудовая книжка',
  },
  {
    text: 'Full-time ongoing agency staffing role. Must commit 40 hours weekly during UK business hours. Salary £2500/month.',
    lang: 'en',
    notes: '40 hours weekly, monthly salary, UK business hours',
  },
  {
    text: 'Ищем видеомонтажера на полный рабочий день в офис. Оклад 120 000 руб, испытательный срок 3 месяца, резюме на почту hr@agency.ru.',
    lang: 'ru',
    notes: 'Полный рабочий день в офис, оклад, испытательный срок, hr',
  },
  {
    text: 'Толық жұмыс күніне видеомонтажер керек. Астана қаласы, кеңсе, 5/2, айлық 450 000 теңге, еңбек шарты.',
    lang: 'kz',
    notes: 'Толық жұмыс күні, 5/2, еңбек шарты',
  },
  {
    text: 'We are hiring a dedicated full-time YouTube Editor. $3500/month, 40+ hours per week, Time Doctor tracked. No side clients allowed.',
    lang: 'en',
    notes: 'Dedicated full-time, Time Doctor, no side clients',
  },
];

for (const t of fulltimeTemplates) {
  leads.push({
    id: `auto_fulltime_${idCounter++}`,
    lang: t.lang,
    label: 'fulltime',
    source: 'synthetic:verified_fulltime',
    confidence: 1.0,
    text: t.text,
    notes: t.notes,
  });
}

const otherTemplates = [
  {
    text: 'Ищем SMM-менеджера: составление контент-плана, постинг, копирайтинг, базовый видеомонтаж рилсов на телефоне. ЗП 250 000 ₸.',
    lang: 'ru',
    label: 'other_profession',
    notes: 'SMM-менеджер',
  },
  {
    text: 'Требуется таргетолог в Instagram. Запуск рекламы, анализ связок, подготовка баннеров и видеомонтаж креативов. Оплата 50 000 руб.',
    lang: 'ru',
    label: 'other_profession',
    notes: 'Таргетолог',
  },
  {
    text: 'Ищем графического дизайнера для карточек маркетплейсов. Дизайн карточек товаров, инфографика, видеомонтаж обложек.',
    lang: 'ru',
    label: 'other_profession',
    notes: 'Графический дизайнер',
  },
  {
    text: 'Копирайтер для YouTube канала: писать сценарии для роликов, ресерч тем, передача текста монтажеру. 8000 руб/текст.',
    lang: 'ru',
    label: 'other_profession',
    notes: 'Копирайтер',
  },
  {
    text: '[Hiring] Social Media Specialist. Manage brand accounts, write tweets, engage community, light video editing. $600/month.',
    lang: 'en',
    label: 'other_profession',
    notes: 'Social Media Specialist',
  },
  {
    text: 'СММ-маман қажет. Парақша жүргізу, пост жазу, мобилография, видеоларды телефонда жеңіл монтаждау. 180 000 тг.',
    lang: 'kz',
    label: 'other_profession',
    notes: 'СММ-маман',
  },
  {
    text: 'Монтаж кондиционеров с гарантией в Алматы. Быстро, качественно, демонтаж старой сплит-системы бесплатно при установке.',
    lang: 'ru',
    label: 'spam',
    notes: 'Монтаж кондиционеров',
  },
  {
    text: 'Срочно требуется монтаж кровли и водостоков на частном доме. Оплата сдельная по квадратным метрам.',
    lang: 'ru',
    label: 'spam',
    notes: 'Монтаж кровли',
  },
  {
    text: 'Курс «Стань видеомонтажером с нуля». 2 месяца обучения, помощь в трудоустройстве, рассрочка 0-0-24. Купить курс со скидкой.',
    lang: 'ru',
    label: 'course',
    notes: 'Курс видеомонтажера с нуля',
  },
  {
    text: 'Интенсив по рилсам: как за 7 дней научиться монтировать вирусные ролики в CapCut и продавать свои услуги дорого.',
    lang: 'ru',
    label: 'course',
    notes: 'Интенсив по рилсам',
  },
];

for (const t of otherTemplates) {
  leads.push({
    id: `auto_misc_${idCounter++}`,
    lang: t.lang,
    label: t.label,
    source: 'synthetic:verified_misc',
    confidence: 1.0,
    text: t.text,
    notes: t.notes,
  });
}

// Ensure unique ids
const seenIds = new Set();
const finalLeads = [];
for (const lead of leads) {
  if (!seenIds.has(lead.id)) {
    seenIds.add(lead.id);
    finalLeads.push(lead);
  }
}

const outputPath = path.resolve('test/fixtures/leads.jsonl');
const content = finalLeads.map((l) => JSON.stringify(l)).join('\n') + '\n';
fs.writeFileSync(outputPath, content, 'utf8');

// Count distribution
const counts = {};
const langCounts = {};
for (const l of finalLeads) {
  counts[l.label] = (counts[l.label] || 0) + 1;
  langCounts[l.lang] = (langCounts[l.lang] || 0) + 1;
}

console.log(`✓ Создан файл датасета: ${outputPath}`);
console.log(`Всего примеров: ${finalLeads.length}`);
console.log('Распределение по классам:', counts);
console.log('Распределение по языкам:', langCounts);
