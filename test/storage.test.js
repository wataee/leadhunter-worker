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
