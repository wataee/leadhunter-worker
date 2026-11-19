// scripts/eval-filter.mjs
// Evaluates lead filter Precision and Recall on test/fixtures/leads.jsonl

import fs from 'fs';
import path from 'path';
import { matchesVacancy } from '../web/src/shared/filter.js';

const datasetPath = path.resolve('test/fixtures/leads.jsonl');
if (!fs.existsSync(datasetPath)) {
  console.error(`Файл датасета не найден: ${datasetPath}`);
  process.exit(1);
}

const lines = fs.readFileSync(datasetPath, 'utf8').split('\n').filter(Boolean);
const items = lines.map((l) => JSON.parse(l));

let tp = 0; // Настоящие gig, пропущенные фильтром
let fp = 0; // Не-gig (штат/курсы/спам), ошибочно пропущенные фильтром
let fn = 0; // Настоящие gig, ошибочно отклоненные фильтром
let tn = 0; // Не-gig, корректно отклоненные фильтром

const fpExamples = [];
const fnExamples = [];

for (const item of items) {
  const result = matchesVacancy(item.text);
  const isMatch = Boolean(result.isMatch);
  const isGig = item.label === 'gig';

  if (isGig && isMatch) {
    tp++;
  } else if (!isGig && isMatch) {
    fp++;
    fpExamples.push({ id: item.id, label: item.label, text: item.text.slice(0, 100) });
  } else if (isGig && !isMatch) {
    fn++;
    fnExamples.push({ id: item.id, reason: result.reason, text: item.text.slice(0, 100) });
  } else {
    tn++;
  }
}

const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

console.log('====================================================');
console.log('📊 ОЦЕНКА КАЧЕСТВА ФИЛЬТРА (Датасет: test/fixtures/leads.jsonl)');
console.log('====================================================');
console.log(`Всего примеров:      ${items.length}`);
console.log(`Целевых (gig):       ${tp + fn}`);
console.log(`Нецелевых (мусор):   ${fp + tn}`);
console.log('----------------------------------------------------');
console.log(`True Positives (TP):  ${tp}`);
console.log(`False Positives (FP): ${fp} (мусор, пробившийся в выдачу)`);
console.log(`False Negatives (FN): ${fn} (целевые заказы, упущенные фильтром)`);
console.log(`True Negatives (TN):  ${tn}`);
console.log('----------------------------------------------------');
console.log(`🎯 Precision (Точность): ${precision.toFixed(1)}% (Цель: >= 85%)`);
console.log(`📈 Recall (Полнота):     ${recall.toFixed(1)}% (Цель: >= 80%)`);
console.log(`⭐ F1-Score:             ${f1.toFixed(1)}%`);
console.log('====================================================\n');

if (fpExamples.length > 0) {
  console.log(`⚠️ Примеры False Positives (${fpExamples.length} шт):`);
  for (const ex of fpExamples.slice(0, 6)) {
    console.log(`  - [${ex.label}] ${ex.text}...`);
  }
  console.log();
}

if (fnExamples.length > 0) {
  console.log(`⚠️ Примеры False Negatives (${fnExamples.length} шт):`);
  for (const ex of fnExamples.slice(0, 6)) {
    console.log(`  - [${ex.reason}] ${ex.text}...`);
  }
  console.log();
}
