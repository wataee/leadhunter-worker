#!/usr/bin/env node
/**
 * scripts/tune-filter.mjs
 * 
 * Анализирует обратную связь от пользователя (👍 / 👎 из Telegram-бота),
 * сохранённую в Redis (leadhunter:filter_feedback / leadhunter:feedback:*),
 * оценивает точность текущих весов фильтра и предлагает рекомендации по калибровке.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchesVacancy, FILTER_CONFIG } from '../web/src/shared/filter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchRedisList(redisUrl, redisToken, key, limit = 100) {
  try {
    const res = await fetch(`${redisUrl}/lrange/${key}/0/${limit - 1}`, {
      headers: { Authorization: `Bearer ${redisToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.result)) return [];
    return data.result.map((item) => {
      try {
        return typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.warn(`[tune-filter] Ошибка чтения из Redis (${key}):`, err.message);
    return [];
  }
}

async function loadFeedbackRecords() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  let records = [];

  if (redisUrl && redisToken) {
    console.log('📡 Подключение к Upstash Redis...');
    const goodItems = await fetchRedisList(redisUrl, redisToken, 'leadhunter:feedback:good', 100);
    const badItems = await fetchRedisList(redisUrl, redisToken, 'leadhunter:feedback:bad', 100);
    records = [...goodItems, ...badItems];
    console.log(`✅ Загружено из Redis: ${goodItems.length} 👍 и ${badItems.length} 👎`);
  }

  // Fallback: локальный файл или сгенерированный тестовый набор
  if (records.length === 0) {
    const localFallbackPath = path.join(__dirname, '../data/feedback.json');
    if (fs.existsSync(localFallbackPath)) {
      console.log(`📂 Загрузка локальных данных из ${localFallbackPath}...`);
      try {
        records = JSON.parse(fs.readFileSync(localFallbackPath, 'utf8'));
      } catch {}
    }
  }

  if (records.length === 0) {
    console.log('ℹ️  В Redis нет накопленной разметки 👍/👎. Запуск калибровки на базе test/fixtures/leads.jsonl...');
    const fixturesPath = path.join(__dirname, '../test/fixtures/leads.jsonl');
    if (fs.existsSync(fixturesPath)) {
      const lines = fs.readFileSync(fixturesPath, 'utf8').split('\n').filter(Boolean);
      records = lines.map((l) => {
        const item = JSON.parse(l);
        return {
          leadId: item.id,
          feedback: item.label === 'gig' ? 'good' : 'bad',
          text: item.text,
          recordedAt: new Date().toISOString(),
        };
      });
      console.log(`✅ Загружено ${records.length} размеченных примеров из тестового датасета`);
    }
  }

  return records;
}

function analyzeFeedback(records) {
  const goodRecords = records.filter((r) => r.feedback === 'good');
  const badRecords = records.filter((r) => r.feedback === 'bad');

  console.log('\n====================================================');
  console.log(`📊 АНАЛИЗ ОБРАТНОЙ СВЯЗИ ДЛЯ КАЛИБРОВКИ ВЕСОВ`);
  console.log('====================================================');
  console.log(`Всего записей фидбека: ${records.length}`);
  console.log(`- Одобрено (👍 Подходит): ${goodRecords.length}`);
  console.log(`- Отклонено (👎 Мусор):   ${badRecords.length}`);
  console.log('----------------------------------------------------');

  const falseNegatives = []; // Пользователь нажал 👍, а фильтр отсеял
  const falsePositives = []; // Пользователь нажал 👎, а фильтр пропустил

  for (const r of goodRecords) {
    const res = matchesVacancy(r.text);
    if (!res.isMatch) {
      falseNegatives.push({ record: r, result: res });
    }
  }

  for (const r of badRecords) {
    const res = matchesVacancy(r.text);
    if (res.isMatch) {
      falsePositives.push({ record: r, result: res });
    }
  }

  console.log(`Результаты текущего фильтра на размеченных данных:`);
  console.log(`  Целевые заказы, упущенные фильтром (FN):  ${falseNegatives.length}`);
  console.log(`  Мусор, ошибочно пропущенный фильтром (FP): ${falsePositives.length}`);

  console.log('\n📋 РЕКОМЕНДАЦИИ ПО НАСТРОЙКЕ ВЕСОВ (FILTER_CONFIG):');
  
  const recommendations = [];

  if (falsePositives.length > 0) {
    console.log('\n⚠️ Пропущенный мусор (👎):');
    for (const fp of falsePositives.slice(0, 5)) {
      console.log(`  - [Скор: ${fp.result.score}] "${fp.record.text.slice(0, 80)}..."`);
      console.log(`    Причины начисления очков: ${fp.result.reasons.join('; ')}`);
    }
    recommendations.push({
      action: 'add_hard_stops_or_increase_penalties',
      message: `Обнаружено ${falsePositives.length} нецелевых постов, прошедших фильтр. Рекомендуется добавить обнаруженные маркеры в hardStops или увеличить vaguePenalty.`,
    });
  } else {
    console.log('  ✅ Ни один мусорный пост не просочился в целевые (FP = 0).');
  }

  if (falseNegatives.length > 0) {
    console.log('\n⚠️ Упущенные целевые заказы (👍):');
    for (const fn of falseNegatives.slice(0, 5)) {
      console.log(`  - [Скор: ${fn.result.score}] "${fn.record.text.slice(0, 80)}..."`);
      console.log(`    Причина отклонения: ${fn.result.reason}`);
    }
    recommendations.push({
      action: 'lower_pass_threshold_or_add_roles',
      message: `Обнаружено ${falseNegatives.length} целевых заказов со скором ниже порога ${FILTER_CONFIG.thresholds.passMinScore}. Рекомендуется добавить новые формулировки в formats / oneOffWords.`,
    });
  } else {
    console.log('  ✅ Все целевые заказы успешно прошли фильтр (FN = 0).');
  }

  if (recommendations.length === 0) {
    console.log('\n🎉 Идеальная калибровка: 100% совпадение с разметкой пользователя!');
    console.log('   Текущие веса в web/src/shared/filter.config.json оптимальны.');
  }

  console.log('====================================================\n');
}

async function main() {
  const records = await loadFeedbackRecords();
  if (records.length === 0) {
    console.log('❌ Нет данных для анализа.');
    return;
  }
  analyzeFeedback(records);
}

main().catch(console.error);
