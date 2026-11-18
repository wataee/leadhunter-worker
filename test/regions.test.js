import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONS,
  detectVacancyRegion,
  REGION_LABELS,
  KNOWN_EU_CHANNELS,
  KNOWN_KZ_CHANNELS,
  KNOWN_US_CHANNELS,
  isSupportedRegion,
} from '../web/src/shared/regions.js';

test('detectVacancyRegion: detects Kazakhstan correctly', () => {
  assert.equal(detectVacancyRegion('Ищем монтажёра, оплата 15 000 ₸ за ролик', 'somechannel'), 'KZ');
  assert.equal(detectVacancyRegion('Монтаж YouTube выпусков. Ставка от 300 000 тенге в месяц', 'work_hub'), 'KZ');
  assert.equal(detectVacancyRegion('Бюджет 50k kzt за проект', 'media'), 'KZ');
  assert.equal(detectVacancyRegion('Срочно нужен рилсмейкер в Алматы, оплата на Kaspi Gold', 'channel1'), 'KZ');
  assert.equal(detectVacancyRegion('Ищем видеографа и монтажёра, Астана. Офис или гибрид', 'channel2'), 'KZ');
  assert.equal(detectVacancyRegion('Бейнемонтажер іздейміз, Reels/Shorts', 'channel3'), 'KZ');
  assert.equal(detectVacancyRegion('Нужен монтаж шортс', 'mobilograf_kz'), 'KZ');
  assert.equal(detectVacancyRegion('Вакансия монтажёра', 'vakankz'), 'KZ');
});

test('detectVacancyRegion: detects Europe / UK correctly', () => {
  assert.equal(detectVacancyRegion('Looking for video editor, £500/video, London UK GMT', 'channel'), 'EU');
  assert.equal(detectVacancyRegion('Videoeditor gesucht für YouTube Kanal in Berlin, 1800€', 'channel'), 'EU');
  assert.equal(detectVacancyRegion('Работа в Европе: требуется монтажер Reels, зарплата €1500 CET', 'relocateme'), 'EU');
  assert.equal(detectVacancyRegion('Szukamy montażysty wideo do stałej współpracy zdalnej', 'praca'), 'EU');
  assert.equal(detectVacancyRegion('Remote creative role in Warsaw or Berlin', 'eurojobs'), 'EU');
});

test('detectVacancyRegion: detects US / Global correctly', () => {
  assert.equal(
    detectVacancyRegion('Looking for a video editor for YouTube. $2,000/mo. Remote worldwide.', 'channel'),
    'US'
  );
  assert.equal(
    detectVacancyRegion('Hiring video editor for TikTok & Reels. $30-$50 per video. EST/PST.', 'freelance'),
    'US'
  );
  assert.equal(detectVacancyRegion('Video creator needed for product demos', 'web3jobs'), 'US');
  assert.equal(
    detectVacancyRegion('We are seeking an experienced Premiere Pro and After Effects video editor to join our creative team full time.', 'editors_hub'),
    'US'
  );
});

test('detectVacancyRegion: isolates RU domestic / Ruble cross-posts for exclusion', () => {
  assert.equal(detectVacancyRegion('Монтаж подкаста, оплата 5000 ₽ за выпуск', 'channel'), 'RU');
  assert.equal(detectVacancyRegion('Ищем рилсмейкера, ставка 80 000 руб/мес', 'channel'), 'RU');
  assert.equal(detectVacancyRegion('Студия в Москве ищет монтажёра, оплата на Сбер или Тинькофф', 'channel'), 'RU');
  assert.equal(detectVacancyRegion('Санкт-Петербург: требуется видеомонтажер в команду', 'channel'), 'RU');
  assert.equal(detectVacancyRegion('Требуется монтаж роликов в Москве, 50000 руб', 'vakankz'), 'RU');
});

test('regions: active target regions, labels, and channel sets', () => {
  assert.deepEqual(REGIONS, ['EU', 'US', 'KZ']);
  assert.equal(REGION_LABELS.EU, '🇪🇺 Европа / UK');
  assert.equal(REGION_LABELS.US, '🇺🇸 США / Global');
  assert.equal(REGION_LABELS.KZ, '🇰🇿 Казахстан');
  assert.equal(isSupportedRegion('EU'), true);
  assert.equal(isSupportedRegion('RU'), false);
  assert.ok(KNOWN_KZ_CHANNELS.size >= 10);
  assert.ok(KNOWN_US_CHANNELS.size >= 10);
  assert.ok(KNOWN_EU_CHANNELS.size >= 8);
});
