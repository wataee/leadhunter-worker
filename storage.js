import fs from 'fs';
import path from 'path';
import { computeTextHash } from './web/src/shared/filter.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const MAX_QUEUE_ATTEMPTS = 10;

export class FileStorageDriver {
  constructor(dataDir = 'data') {
    this.dataDir = path.resolve(dataDir);
    this.recentFile = path.join(this.dataDir, 'recent.json');
    this.failedQueueFile = path.join(this.dataDir, 'failed-queue.json');

    this.recentLeads = [];
    this.failedQueue = [];
    this.deduplicationCache = new Map(); // key -> timestamp

    this.ensureDir();
    this.load();

    // B8: Periodic cleanup once per minute instead of on every check
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldCache();
    }, 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  ensureDir() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch (err) {
      console.warn(`[FileStorage] Ошибка создания папки ${this.dataDir}:`, err.message);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.recentFile)) {
        const raw = fs.readFileSync(this.recentFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          this.recentLeads = parsed
            .filter((item) => {
              const time = new Date(item.postedAt || item.createdAt || 0).getTime();
              return now - time <= SEVEN_DAYS_MS;
            })
            .slice(0, 500);

          for (const lead of this.recentLeads) {
            if (lead.id) this.deduplicationCache.set(lead.id, Date.now());
            if (lead.text) this.deduplicationCache.set(computeTextHash(lead.text), Date.now());
          }
        }
      }
    } catch (err) {
      console.warn('[FileStorage] Ошибка чтения recent.json:', err.message);
      this.recentLeads = [];
    }

    try {
      if (fs.existsSync(this.failedQueueFile)) {
        const raw = fs.readFileSync(this.failedQueueFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          this.failedQueue = parsed.filter(
            (item) =>
              now - (item.firstAttemptAt || 0) <= TWENTY_FOUR_HOURS_MS &&
              (item.attempts || 0) < MAX_QUEUE_ATTEMPTS
          );
        }
      }
    } catch (err) {
      console.warn('[FileStorage] Ошибка чтения failed-queue.json:', err.message);
      this.failedQueue = [];
    }
  }

  flush() {
    try {
      fs.writeFileSync(
        this.recentFile,
        JSON.stringify(this.recentLeads.slice(0, 500), null, 2),
        'utf-8'
      );
    } catch (err) {
      console.warn('[FileStorage] Ошибка сохранения recent.json:', err.message);
    }

    try {
      fs.writeFileSync(
        this.failedQueueFile,
        JSON.stringify(this.failedQueue, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.warn('[FileStorage] Ошибка сохранения failed-queue.json:', err.message);
    }
  }

  cleanupOldCache() {
    const now = Date.now();
    for (const [key, ts] of this.deduplicationCache.entries()) {
      if (now - ts > TWENTY_FOUR_HOURS_MS) {
        this.deduplicationCache.delete(key);
      }
    }
  }

  isDuplicate(leadId, textHash) {
    const now = Date.now();
    if (this.deduplicationCache.has(leadId) || this.deduplicationCache.has(textHash)) {
      return true;
    }

    this.deduplicationCache.set(leadId, now);
    this.deduplicationCache.set(textHash, now);
    return false;
  }

  getRecentLeads() {
    return this.recentLeads;
  }

  addRecentLead(lead) {
    this.recentLeads.unshift(lead);
    if (this.recentLeads.length > 500) {
      this.recentLeads.pop();
    }
    this.flush();
  }

  getFailedQueue() {
    const now = Date.now();
    this.failedQueue = this.failedQueue.filter(
      (item) =>
        now - (item.firstAttemptAt || 0) <= TWENTY_FOUR_HOURS_MS &&
        (item.attempts || 0) < MAX_QUEUE_ATTEMPTS
    );
    return this.failedQueue;
  }

  enqueueFailed(payload, error = '') {
    const id = `failed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const queueItem = {
      id,
      payload,
      attempts: 0,
      firstAttemptAt: Date.now(),
      lastAttemptAt: Date.now(),
      error: String(error),
    };
    this.failedQueue.push(queueItem);
    this.flush();
    return queueItem;
  }

  recordQueueAttempt(id, error = '') {
    const item = this.failedQueue.find((q) => q.id === id);
    if (item) {
      item.attempts = (item.attempts || 0) + 1;
      item.lastAttemptAt = Date.now();
      if (error) item.error = String(error);
      if (item.attempts >= MAX_QUEUE_ATTEMPTS) {
        console.warn(`[Queue] Элемент ${id} превысил ${MAX_QUEUE_ATTEMPTS} попыток и удалён`);
        this.failedQueue = this.failedQueue.filter((q) => q.id !== id);
      }
      this.flush();
    }
  }

  dequeueFailed(id) {
    this.failedQueue = this.failedQueue.filter((q) => q.id !== id);
    this.flush();
  }
}

export class UpstashRedisDriver {
  constructor(url, token, fallbackDriver) {
    this.baseUrl = url.replace(/\/$/, '');
    this.token = token;
    this.fallback = fallbackDriver;
    this.lastRedisWarnAt = 0;
  }

  async command(cmd, ...args) {
    try {
      const res = await fetch(`${this.baseUrl}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([cmd, ...args]),
      });
      if (!res.ok) {
        throw new Error(`Upstash HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && data.error) {
        throw new Error(`Upstash Redis Error: ${data.error}`);
      }
      return data?.result;
    } catch (err) {
      const now = Date.now();
      if (now - this.lastRedisWarnAt > 5 * 60 * 1000) {
        this.lastRedisWarnAt = now;
        console.warn(`[Upstash Redis] Ошибка команды ${cmd}: ${err.message}. Временный переход на memory fallback.`);
      }
      throw err;
    }
  }

  // B8: Warmup memory deduplication cache from Redis recent leads
  async warmup() {
    try {
      const items = await this.command('LRANGE', 'leadhunter:recent', '0', '499');
      if (Array.isArray(items)) {
        for (const itemStr of items) {
          try {
            const item = typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr;
            if (item && item.id) {
              this.fallback.deduplicationCache.set(item.id, Date.now());
            }
            if (item && item.text) {
              this.fallback.deduplicationCache.set(computeTextHash(item.text), Date.now());
            }
          } catch {}
        }
        console.log(`[Storage] Прогрет кэш дедупликации из Redis (${items.length} записей)`);
      }
    } catch (err) {
      console.warn('[Storage] Не удалось прогреть кэш из Redis:', err.message);
    }
  }

  // B1: Atomic EXISTS check, fall back to memory on error
  async isDuplicate(leadId, textHash) {
    const keyId = `leadhunter:dedup:${leadId}`;
    const keyHash = `leadhunter:dedup:${textHash}`;

    try {
      const count = await this.command('EXISTS', keyId, keyHash);
      if (typeof count === 'number' && count > 0) {
        return true;
      }
      // Keys do not exist: mark with 24h TTL
      await Promise.all([
        this.command('SET', keyId, '1', 'EX', '86400'),
        this.command('SET', keyHash, '1', 'EX', '86400'),
      ]);
      // Also register in memory fallback
      this.fallback.isDuplicate(leadId, textHash);
      return false;
    } catch {
      // Redis unavailable/network error -> transparently use memory fallback
      return this.fallback.isDuplicate(leadId, textHash);
    }
  }

  getRecentLeads() {
    return this.fallback.getRecentLeads();
  }

  addRecentLead(lead) {
    this.fallback.addRecentLead(lead);
    // Asynchronously push to Redis
    this.command('LPUSH', 'leadhunter:recent', JSON.stringify(lead)).catch(() => {});
    this.command('LTRIM', 'leadhunter:recent', '0', '499').catch(() => {});
  }

  getFailedQueue() {
    return this.fallback.getFailedQueue();
  }

  enqueueFailed(payload, error) {
    return this.fallback.enqueueFailed(payload, error);
  }

  recordQueueAttempt(id, error) {
    return this.fallback.recordQueueAttempt(id, error);
  }

  dequeueFailed(id) {
    return this.fallback.dequeueFailed(id);
  }

  flush() {
    this.fallback.flush();
  }
}

export function createStorage() {
  const fileDriver = new FileStorageDriver();
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    console.log('[Storage] Инициализация Upstash Redis REST хранилища...');
    const redisDriver = new UpstashRedisDriver(redisUrl, redisToken, fileDriver);
    redisDriver.warmup().catch(() => {});
    return redisDriver;
  }

  console.log('[Storage] Инициализация файлового хранилища (data/recent.json, data/failed-queue.json)');
  return fileDriver;
}
