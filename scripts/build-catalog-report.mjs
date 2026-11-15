import fs from 'node:fs';
import path from 'node:path';

const CATALOG_PATH = path.resolve('web/src/shared/sources.catalog.json');
const UNVERIFIED_PATH = path.resolve('data/candidates.unverified.json');
const REPORT_PATH = path.resolve('CATALOG_REPORT.md');

if (!fs.existsSync(CATALOG_PATH)) {
  console.error('[build-catalog-report] Catalog file not found:', CATALOG_PATH);
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
let unverified = [];
if (fs.existsSync(UNVERIFIED_PATH)) {
  try {
    unverified = JSON.parse(fs.readFileSync(UNVERIFIED_PATH, 'utf8'));
  } catch {
    // ignore
  }
}

const totalVerified = catalog.length;
const totalUnverified = unverified.length;
const totalChecked = totalVerified + totalUnverified;

const channels = catalog.filter((s) => s.type !== 'group');
const groups = catalog.filter((s) => s.type === 'group');
const recommended = catalog.filter((s) => s.recommended);

// Category stats
const categories = {};
for (const item of catalog) {
  const cat = item.category || 'other';
  if (!categories[cat]) {
    categories[cat] = { count: 0, totalScore: 0, recommended: 0, channels: 0, groups: 0 };
  }
  categories[cat].count++;
  categories[cat].totalScore += (item.qualityScore || 0);
  if (item.recommended) categories[cat].recommended++;
  if (item.type === 'group') categories[cat].groups++;
  else categories[cat].channels++;
}

// Top 20 by quality
const sorted = [...catalog].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
const top20 = sorted.slice(0, 20);

const lines = [
  '# LeadHunter — Отчёт по каталогу источников Telegram',
  '',
  `> Сгенерировано: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
  '',
  '## 1. Сводная статистика',
  '',
  '| Метрика | Значение |',
  '|---|---|',
  `| **Всего проверено кандидатов** | ${totalChecked} |`,
  `| **Прошли проверку (в каталоге)** | **${totalVerified}** |`,
  `| **Публичные каналы** | ${channels.length} |`,
  `| **Группы / чаты** | ${groups.length} |`,
  `| **Рекомендованные (Топ-15)** | ${recommended.length} |`,
  `| **Отсеяно / неактивно** | ${totalUnverified} |`,
  '',
  '## 2. Распределение по категориям',
  '',
  '| Категория | Всего | Каналов | Групп | Реком. | Средний Quality Score |',
  '|---|---|---|---|---|---|',
];

for (const [catName, data] of Object.entries(categories)) {
  const avg = Math.round(data.totalScore / data.count);
  lines.push(`| \`${catName}\` | ${data.count} | ${data.channels} | ${data.groups} | ${data.recommended} | **${avg}/100** |`);
}

lines.push(
  '',
  '## 3. Топ-20 источников по качеству (Quality Score)',
  '',
  '| № | Канал | Название | Категория | Тип | Подписчики | Постов/нед | Quality Score | Реком. |',
  '|---|---|---|---|---|---|---|---|---|'
);

top20.forEach((item, idx) => {
  const uname = `@${item.username || item.id}`;
  const title = (item.title || item.id).replace(/\|/g, '-');
  const subs = (item.subscribers || 0).toLocaleString('ru-RU');
  const ppw = item.postsPerWeek || '—';
  const qs = `**${item.qualityScore || 0}**`;
  const isRec = item.recommended ? '⭐ Да' : '—';
  lines.push(`| ${idx + 1} | [${uname}](https://t.me/${item.username || item.id}) | ${title} | \`${item.category}\` | ${item.type} | ${subs} | ${ppw} | ${qs} | ${isRec} |`);
});

lines.push('');

fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
console.log(`[build-catalog-report] Successfully generated ${REPORT_PATH}`);
