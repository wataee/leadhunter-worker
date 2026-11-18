import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_PATH = path.resolve(__dirname, '../web/src/shared/sources.catalog.json');
const USERNAME_REGEX = /^[a-z][a-z0-9_]{4,31}$/;

const CATEGORY_MINS = {
  jobs_video: 30,
  jobs_remote_freelance: 50,
  editors_community: 30,
  clients_entrepreneurs: 40,
  international_en: 45,
};

test('6.5 Sources Catalog validation suite (EU / US / KZ, 0 RU)', () => {
  assert.equal(fs.existsSync(CATALOG_PATH), true, 'sources.catalog.json file must exist');

  const content = fs.readFileSync(CATALOG_PATH, 'utf8');
  const catalog = JSON.parse(content);

  assert.equal(Array.isArray(catalog), true, 'Catalog must be a JSON array');

  const seenIds = new Set();
  const categoryCounts = {
    jobs_video: 0,
    jobs_remote_freelance: 0,
    editors_community: 0,
    clients_entrepreneurs: 0,
    international_en: 0,
  };

  let validStatusCount = 0;
  let recommendedCount = 0;

  catalog.forEach((item, index) => {
    assert.ok(item.id, `Item #${index} missing id`);
    assert.ok(item.title, `Item #${index} missing title`);
    assert.ok(item.username, `Item #${index} missing username`);
    assert.ok(item.url, `Item #${index} missing url`);
    assert.ok(item.type, `Item #${index} missing type`);
    assert.ok(item.category, `Item #${index} missing category`);
    assert.ok(item.language, `Item #${index} missing language`);
    assert.ok(item.description, `Item #${index} missing description`);
    assert.ok(typeof item.qualityScore === 'number', `Item #${index} qualityScore must be number`);
    assert.ok(item.status, `Item #${index} missing status`);
    assert.ok(Array.isArray(item.tags) && item.tags.length > 0, `Item #${index} tags must be non-empty array`);
    assert.ok(typeof item.recommended === 'boolean', `Item #${index} recommended must be boolean`);
    assert.ok(item.discoveredFrom, `Item #${index} missing discoveredFrom`);
    assert.ok(item.verifiedAt, `Item #${index} missing verifiedAt`);
    assert.ok(
      ['EU', 'US', 'KZ'].includes(item.region),
      `Item #${index} (${item.id}) must belong to EU, US, or KZ (found: ${item.region})`
    );

    assert.match(
      item.id,
      USERNAME_REGEX,
      `Item #${index} id '${item.id}' must match regex (lowercase alphanumeric/underscore 5-32 chars)`
    );
    assert.equal(item.username, item.id, `Item #${index} username must match id`);
    assert.equal(item.id, item.id.toLowerCase(), `Item #${index} id must be lowercase`);
    assert.ok(item.url.startsWith('https://t.me/'), `Item #${index} url must start with https://t.me/`);

    assert.equal(seenIds.has(item.id), false, `Duplicate item id detected: ${item.id}`);
    seenIds.add(item.id);

    assert.ok(['channel', 'group'].includes(item.type), `Invalid type '${item.type}' for ${item.id}`);
    assert.ok(
      ['ok', 'stale', 'dead', 'no_preview', 'group', 'private'].includes(item.status),
      `Invalid status '${item.status}' for ${item.id}`
    );

    if (item.status === 'ok' || item.status === 'group') {
      validStatusCount++;
    }

    if (item.recommended) {
      recommendedCount++;
      assert.ok(
        item.qualityScore >= 65,
        `Recommended item ${item.id} should have qualityScore >= 65 (got ${item.qualityScore})`
      );
    }

    if (categoryCounts[item.category] !== undefined) {
      categoryCounts[item.category]++;
    }
  });

  // Total count >= 200
  assert.ok(
    validStatusCount >= 200,
    `Catalog must contain at least 200 valid 'ok' or 'group' sources (found ${validStatusCount})`
  );

  // Recommended count 10..20
  assert.ok(
    recommendedCount >= 10 && recommendedCount <= 20,
    `Recommended sources must be between 10 and 20 (found ${recommendedCount})`
  );

  // Category minimums
  for (const [cat, min] of Object.entries(CATEGORY_MINS)) {
    assert.ok(
      categoryCounts[cat] >= min,
      `Category '${cat}' requires at least ${min} sources, found ${categoryCounts[cat]}`
    );
  }

  // Regional guarantees: ZERO RU, rich EU / US / KZ
  const euCount = catalog.filter((x) => x.region === 'EU').length;
  const usCount = catalog.filter((x) => x.region === 'US').length;
  const kzCount = catalog.filter((x) => x.region === 'KZ').length;
  const ruCount = catalog.filter((x) => x.region === 'RU').length;

  assert.equal(ruCount, 0, `RU sources must be 0, found ${ruCount}`);
  assert.ok(euCount >= 35, `Catalog must have at least 35 EU sources (found ${euCount})`);
  assert.ok(usCount >= 50, `Catalog must have at least 50 US sources (found ${usCount})`);
  assert.ok(kzCount >= 50, `Catalog must have at least 50 KZ sources (found ${kzCount})`);
});
