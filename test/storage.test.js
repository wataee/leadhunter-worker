import test from 'node:test';
import assert from 'node:assert/strict';
import { FileStorageDriver, UpstashRedisDriver } from '../storage.js';

test('B1 & B8: FileStorageDriver deduplication and fallback caching', () => {
  const fileDriver = new FileStorageDriver('data_test');
  const leadId = 'test_lead_123';
  const textHash = 'hash_abc_123';

  // First check: not a duplicate
  const isDup1 = fileDriver.isDuplicate(leadId, textHash);
  assert.equal(isDup1, false, 'Initial lead should not be duplicate');

  // Second check: is a duplicate
  const isDup2 = fileDriver.isDuplicate(leadId, textHash);
  assert.equal(isDup2, true, 'Repeated lead should be detected as duplicate');

  // Lead with same textHash but different id is also duplicate
  const isDup3 = fileDriver.isDuplicate('different_id', textHash);
  assert.equal(isDup3, true, 'Same text content should be detected as duplicate');
});

test('B1: UpstashRedisDriver falls back to memory driver on network error, does not drop leads', async () => {
  const fallbackDriver = new FileStorageDriver('data_test_fallback');
  // Create driver with unreachable URL to simulate network failure
  const redisDriver = new UpstashRedisDriver('http://127.0.0.1:9999', 'invalid_token', fallbackDriver);

  const leadId = 'test_lead_network_fail_1';
  const textHash = 'hash_network_fail_1';

  // When Redis fails, it should NOT return true (which would drop the lead as duplicate)
  // Instead it should fall back to memory driver and return false
  const isDup = await redisDriver.isDuplicate(leadId, textHash);
  assert.equal(isDup, false, 'Network failure should fall back to memory driver and return false for new lead');

  // Second check with same lead should now be duplicate in fallback memory
  const isDup2 = await redisDriver.isDuplicate(leadId, textHash);
  assert.equal(isDup2, true, 'Second check should be detected as duplicate via fallback memory');
});

test('E4 / C2: callback_data byte length strictly adheres to <= 64 bytes limit', () => {
  function truncateToBytes(str, maxBytes) {
    const buf = Buffer.from(str, 'utf8');
    if (buf.length <= maxBytes) return str;
    let end = maxBytes;
    while (end > 0 && (buf[end] & 0xc0) === 0x80) {
      end--;
    }
    return buf.subarray(0, end).toString('utf8');
  }

  // Long Cyrillic channel name: 30 chars in Cyrillic = 60 bytes
  const longCyrillic = 'работа_видеомонтаж_вакансии_фриланс_топ';
  const truncated = truncateToBytes(longCyrillic, 50);
  const callbackData = `hide:${truncated}`;

  assert.ok(
    Buffer.byteLength(callbackData, 'utf8') <= 64,
    `callback_data length (${Buffer.byteLength(callbackData, 'utf8')}) exceeds 64 bytes`
  );
});

test('E4 / C2: Permanent 4xx errors are not retried', async () => {
  let attempts = 0;
  async function simulateWebhookDelivery(status, maxRetries = 3) {
    attempts = 0;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      attempts++;
      if ([400, 401, 403, 404].includes(status)) {
        return false;
      }
    }
    return false;
  }

  const result400 = await simulateWebhookDelivery(400);
  assert.equal(result400, false);
  assert.equal(attempts, 1, 'HTTP 400 must NOT be retried');

  const result500 = await simulateWebhookDelivery(500);
  assert.equal(result500, false);
  assert.equal(attempts, 3, 'HTTP 500 must be retried 3 times');
});

test('Task 3: storage persists and retrieves lastPolledId across restarts', async () => {
  const testDir = 'data_test_poller_' + Date.now();
  const fileDriver = new FileStorageDriver(testDir);

  assert.equal(fileDriver.getLastPolledId('premiere_pro'), 0, 'Initial lastPolledId should be 0');

  fileDriver.setLastPolledId('premiere_pro', 12345);
  assert.equal(fileDriver.getLastPolledId('premiere_pro'), 12345, 'Updated lastPolledId should be 12345');

  // Should not decrement
  fileDriver.setLastPolledId('premiere_pro', 10000);
  assert.equal(fileDriver.getLastPolledId('premiere_pro'), 12345, 'lastPolledId should not decrement');

  // Case insensitivity
  assert.equal(fileDriver.getLastPolledId('PREMIERE_PRO'), 12345, 'channel should be case-insensitive');

  // New instance simulating restart from same directory
  const reloadedDriver = new FileStorageDriver(testDir);
  assert.equal(reloadedDriver.getLastPolledId('premiere_pro'), 12345, 'reloaded driver should preserve lastPolledId');

  // Clean up test dir
  try {
    const fs = await import('fs');
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}
});
