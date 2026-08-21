import Redis from 'ioredis';
import logger from '../lib/logger.js';

/**
 * Redis-backed store.
 *
 * Failure handling is deliberate: any Redis error is swallowed and reported to
 * the caller as a cache miss. A broken cache should degrade performance, never
 * correctness — the cache facade will fall back to the in-memory store after
 * repeated failures.
 */
export class RedisStore {
  /** @param {{ url: string, keyPrefix?: string }} options */
  constructor({ url, keyPrefix = 'trailmate:' }) {
    this.name = 'redis';
    this.keyPrefix = keyPrefix;
    this.healthy = false;
    this.consecutiveFailures = 0;
    this.hits = 0;
    this.misses = 0;

    this.client = new Redis(url, {
      keyPrefix,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.client.on('ready', () => {
      this.healthy = true;
      this.consecutiveFailures = 0;
      logger.info('Redis cache ready');
    });
    this.client.on('end', () => {
      this.healthy = false;
    });
    this.client.on('error', (error) => {
      this.healthy = false;
      // ioredis retries on its own; log sparingly to avoid flooding.
      if (this.consecutiveFailures === 0) {
        logger.warn('Redis error — falling back to in-memory cache', { message: error.message });
      }
      this.consecutiveFailures += 1;
    });
  }

  async connect() {
    await this.client.connect();
  }

  async get(key) {
    try {
      const raw = await this.client.get(key);
      if (raw === null) {
        this.misses += 1;
        return null;
      }
      this.hits += 1;
      return JSON.parse(raw);
    } catch (error) {
      this.noteFailure('get', error);
      return null;
    }
  }

  async set(key, payload, ttlSeconds) {
    if (ttlSeconds <= 0) return;
    try {
      await this.client.set(key, JSON.stringify(payload), 'EX', Math.ceil(ttlSeconds));
    } catch (error) {
      this.noteFailure('set', error);
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      this.noteFailure('del', error);
    }
  }

  async delPrefix(prefix) {
    let removed = 0;
    try {
      // SCAN rather than KEYS so a large keyspace never blocks the server.
      const stream = this.client.scanStream({
        match: `${this.keyPrefix}${prefix}*`,
        count: 200,
      });
      for await (const batch of stream) {
        if (!batch.length) continue;
        // scanStream yields fully-qualified keys; strip the prefix that
        // ioredis will re-add on del().
        const unprefixed = batch.map((k) => k.slice(this.keyPrefix.length));
        removed += await this.client.del(...unprefixed);
      }
    } catch (error) {
      this.noteFailure('delPrefix', error);
    }
    return removed;
  }

  async clear() {
    await this.delPrefix('');
  }

  async stats() {
    return {
      store: this.name,
      healthy: this.healthy,
      hits: this.hits,
      misses: this.misses,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  noteFailure(op, error) {
    this.consecutiveFailures += 1;
    this.healthy = false;
    logger.debug(`Redis ${op} failed`, { message: error.message });
  }

  async close() {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export default RedisStore;
