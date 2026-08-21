/**
 * Process-local cache store with LRU eviction.
 *
 * Used as the default store, and as the automatic fallback whenever Redis is
 * unavailable — the cache layer must never be the reason a request fails.
 *
 * Values are opaque to the store: TTL vs. stale-grace semantics live one level
 * up, in `cache/index.js`. The store only knows about physical expiry.
 */
export class MemoryStore {
  /** @param {{ maxEntries?: number }} [options] */
  constructor({ maxEntries = 1000 } = {}) {
    /** @type {Map<string, { payload: unknown, expiresAt: number }>} */
    this.map = new Map();
    this.maxEntries = maxEntries;
    this.name = 'memory';
    this.hits = 0;
    this.misses = 0;
  }

  async get(key) {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      this.misses += 1;
      return null;
    }
    // Refresh recency for LRU ordering.
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits += 1;
    return entry.payload;
  }

  /**
   * @param {string} key
   * @param {unknown} payload
   * @param {number} ttlSeconds physical retention
   */
  async set(key, payload, ttlSeconds) {
    if (ttlSeconds <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
    this.evictIfNeeded();
  }

  async del(key) {
    this.map.delete(key);
  }

  /** Deletes every key matching a `prefix*` pattern. */
  async delPrefix(prefix) {
    let removed = 0;
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async clear() {
    this.map.clear();
  }

  async stats() {
    return {
      store: this.name,
      entries: this.map.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
    };
  }

  evictIfNeeded() {
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  async close() {
    this.map.clear();
  }
}

export default MemoryStore;
