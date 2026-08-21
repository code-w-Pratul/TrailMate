import { createHash } from 'node:crypto';
import config from '../config/env.js';
import logger from '../lib/logger.js';
import ApiError from '../lib/ApiError.js';
import MemoryStore from './memoryStore.js';
import RedisStore from './redisStore.js';

/**
 * Cache facade — the heart of TrailMate's resilience story.
 *
 * Three behaviours worth calling out:
 *
 * 1. **Stale-while-broken.** Every entry is physically retained for
 *    `ttl + CACHE_STALE_GRACE`. Past the TTL it is no longer served as fresh,
 *    but it is kept as a lifeboat: if the upstream provider then fails, we
 *    return the stale copy flagged `stale: true` instead of erroring. The
 *    dashboard renders a "showing cached data" badge rather than a broken card.
 *
 * 2. **Single flight.** Concurrent requests for the same key share one
 *    upstream call. Ten users loading Tokyo at once spends one API credit,
 *    not ten.
 *
 * 3. **Store-agnostic.** Redis when configured, in-memory otherwise, with an
 *    automatic downgrade if Redis starts failing. A dead cache degrades
 *    latency, never correctness.
 */

const FALLBACK_AFTER_FAILURES = 5;

let primaryStore = null;
let memoryFallback = null;

/** @type {Map<string, Promise<any>>} */
const inflight = new Map();

function memory() {
  if (!memoryFallback) {
    memoryFallback = new MemoryStore({ maxEntries: config.CACHE_MAX_ENTRIES });
  }
  return memoryFallback;
}

/** Lazily initialise the store so importing this module has no side effects. */
function store() {
  if (!primaryStore) {
    if (config.REDIS_URL) {
      const redis = new RedisStore({ url: config.REDIS_URL });
      redis.connect().catch((error) => {
        logger.warn('Redis unavailable at startup — using in-memory cache', {
          message: error.message,
        });
      });
      primaryStore = redis;
    } else {
      logger.info('No REDIS_URL set — using in-memory cache');
      primaryStore = memory();
    }
  }

  // Automatic downgrade: a persistently unhealthy Redis stops being consulted.
  if (
    primaryStore !== memoryFallback &&
    primaryStore.consecutiveFailures >= FALLBACK_AFTER_FAILURES
  ) {
    return memory();
  }
  return primaryStore;
}

/* -------------------------------------------------------------------------- */
/* Keys                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic cache key from a namespace and a params object.
 * Object keys are sorted so `{a,b}` and `{b,a}` collapse to one entry.
 *
 * @param {string} namespace e.g. 'weather'
 * @param {Record<string, unknown>} [params]
 */
export function cacheKey(namespace, params = {}) {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v).trim().toLowerCase()])
    .sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) return `${namespace}:_`;

  const flat = entries.map(([k, v]) => `${k}=${v}`).join('&');
  // Keep keys readable while bounding their length.
  if (flat.length <= 120) return `${namespace}:${flat}`;
  return `${namespace}:${createHash('sha1').update(flat).digest('hex')}`;
}

/* -------------------------------------------------------------------------- */
/* Primitive get / set                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} CacheEnvelope
 * @property {unknown} value
 * @property {number} storedAt  epoch ms
 * @property {number} freshUntil epoch ms
 * @property {string} [provider]
 */

/** @returns {Promise<{ envelope: CacheEnvelope, fresh: boolean } | null>} */
export async function readEntry(key) {
  const envelope = /** @type {CacheEnvelope|null} */ (await store().get(key));
  if (!envelope || typeof envelope !== 'object' || !('value' in envelope)) return null;
  return { envelope, fresh: Date.now() < envelope.freshUntil };
}

export async function writeEntry(key, value, ttlSeconds, provider) {
  const now = Date.now();
  const envelope = {
    value,
    storedAt: now,
    freshUntil: now + ttlSeconds * 1000,
    ...(provider ? { provider } : {}),
  };
  await store().set(key, envelope, ttlSeconds + config.CACHE_STALE_GRACE);
  return envelope;
}

export const del = (key) => store().del(key);
export const delPrefix = (prefix) => store().delPrefix(prefix);

/* -------------------------------------------------------------------------- */
/* wrap()                                                                      */
/* -------------------------------------------------------------------------- */

function metaFor(envelope, { fresh, degraded = false, warning }) {
  const ageSeconds = Math.max(0, Math.round((Date.now() - envelope.storedAt) / 1000));
  return {
    cached: true,
    stale: !fresh,
    degraded,
    fetchedAt: new Date(envelope.storedAt).toISOString(),
    ageSeconds,
    ...(envelope.provider ? { provider: envelope.provider } : {}),
    ...(warning ? { warning } : {}),
  };
}

/**
 * Read-through cache with stale fallback and request coalescing.
 *
 * @template T
 * @param {object} options
 * @param {string} options.key
 * @param {number} options.ttl seconds a value is considered fresh
 * @param {() => Promise<T>} options.fetcher
 * @param {string} [options.provider] provider label recorded in meta
 * @param {boolean} [options.forceRefresh] bypass a fresh hit
 * @returns {Promise<{ data: T, meta: object }>}
 */
export async function wrap({ key, ttl, fetcher, provider, forceRefresh = false }) {
  const existing = await readEntry(key);

  if (existing?.fresh && !forceRefresh) {
    logger.debug(`cache hit ${key}`);
    return { data: existing.envelope.value, meta: metaFor(existing.envelope, { fresh: true }) };
  }

  // Coalesce concurrent misses for the same key into a single upstream call.
  if (inflight.has(key)) {
    logger.debug(`cache join-inflight ${key}`);
    return inflight.get(key);
  }

  const task = (async () => {
    try {
      const data = await fetcher();
      const envelope = await writeEntry(key, data, ttl, provider);
      logger.debug(`cache fill ${key}`);
      return {
        data,
        meta: {
          cached: false,
          stale: false,
          degraded: false,
          fetchedAt: new Date(envelope.storedAt).toISOString(),
          ageSeconds: 0,
          ...(provider ? { provider } : {}),
        },
      };
    } catch (error) {
      /* The lifeboat: serve the expired copy rather than failing the card. */
      if (existing) {
        logger.warn(`serving stale cache for ${key} after upstream failure`, {
          message: error.message,
          ageSeconds: Math.round((Date.now() - existing.envelope.storedAt) / 1000),
        });
        return {
          data: existing.envelope.value,
          meta: metaFor(existing.envelope, {
            fresh: false,
            degraded: true,
            warning: `Live data unavailable (${error.message}). Showing the last successful response.`,
          }),
        };
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/**
 * Like `wrap`, but tries a list of providers in order and caches whichever one
 * succeeds. Used where a keyless fallback provider exists (weather, places,
 * photos), so a missing API key or an exhausted quota is a non-event.
 *
 * @template T
 * @param {object} options
 * @param {string} options.key
 * @param {number} options.ttl
 * @param {Array<{ name: string, fetch: () => Promise<T>, enabled?: boolean }>} options.providers
 * @param {boolean} [options.forceRefresh]
 * @param {string} [options.resource] human label used in the final error
 */
export async function wrapWithFallback({ key, ttl, providers, forceRefresh, resource = 'data' }) {
  const candidates = providers.filter((p) => p.enabled !== false);
  if (!candidates.length) {
    throw ApiError.internal(`No provider is configured for ${resource}`);
  }

  let winner = null;
  const attempted = [];

  const result = await wrap({
    key,
    ttl,
    forceRefresh,
    fetcher: async () => {
      const failures = [];
      for (const candidate of candidates) {
        try {
          const data = await candidate.fetch();
          winner = candidate.name;
          attempted.push({ provider: candidate.name, ok: true });
          return data;
        } catch (error) {
          attempted.push({ provider: candidate.name, ok: false, reason: error.message });
          failures.push(`${candidate.name}: ${error.message}`);
          logger.warn(`provider "${candidate.name}" failed for ${resource}`, {
            message: error.message,
          });
        }
      }
      throw ApiError.badGateway(`Could not load ${resource}`, {
        details: failures,
      });
    },
  });

  // A cache hit means no provider ran; keep the provider recorded on the entry.
  if (winner) {
    result.meta.provider = winner;
    if (attempted.length > 1) {
      result.meta.providerFallback = true;
      result.meta.attempted = attempted;
    }
    // Persist the winning provider onto the envelope for later cache hits.
    await writeEntry(key, result.data, ttl, winner);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Introspection & lifecycle                                                   */
/* -------------------------------------------------------------------------- */

export async function cacheStats() {
  const s = store();
  return { ...(await s.stats()), inflight: inflight.size, staleGrace: config.CACHE_STALE_GRACE };
}

export async function resetCache() {
  inflight.clear();
  if (primaryStore) await primaryStore.clear();
  if (memoryFallback && memoryFallback !== primaryStore) await memoryFallback.clear();
}

export async function closeCache() {
  inflight.clear();
  if (primaryStore?.close) await primaryStore.close();
  if (memoryFallback && memoryFallback !== primaryStore) await memoryFallback.close();
  primaryStore = null;
  memoryFallback = null;
}

export default {
  cacheKey,
  wrap,
  wrapWithFallback,
  readEntry,
  writeEntry,
  del,
  delPrefix,
  cacheStats,
  resetCache,
  closeCache,
};
