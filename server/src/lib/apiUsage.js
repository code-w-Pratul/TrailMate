import config from '../config/env.js';
import logger from './logger.js';

/**
 * Free-tier budget tracker.
 *
 * Every outbound call to a metered provider is counted against a per-UTC-day
 * budget. Crossing 75% / 90% / 100% of the budget logs a warning exactly once
 * per threshold per day, so a noisy loop cannot spam the log.
 *
 * Counters are process-local by design: they exist to protect a single
 * deployment's free tier and to power the "API budget" widget, not to be a
 * distributed quota system. Swapping the Map for a Redis hash is the natural
 * upgrade path if the API is ever scaled horizontally.
 */

const WARN_THRESHOLDS = [0.75, 0.9, 1];

/** @type {Map<string, { day: string, count: number, warned: Set<number>, lastCallAt: string|null, failures: number }>} */
const counters = new Map();

const today = () => new Date().toISOString().slice(0, 10);

function bucket(provider) {
  const day = today();
  const existing = counters.get(provider);
  if (existing && existing.day === day) return existing;

  const fresh = { day, count: 0, warned: new Set(), lastCallAt: null, failures: 0 };
  counters.set(provider, fresh);
  return fresh;
}

/** Daily budget for a provider, or `null` when the provider is unmetered. */
function quotaFor(provider) {
  return config.quotas[provider] ?? null;
}

/**
 * Record one outbound call.
 * @param {string} provider e.g. 'openweather'
 */
export function recordCall(provider) {
  const entry = bucket(provider);
  entry.count += 1;
  entry.lastCallAt = new Date().toISOString();

  const quota = quotaFor(provider);
  if (!quota) return entry.count;

  const ratio = entry.count / quota;
  for (const threshold of WARN_THRESHOLDS) {
    if (ratio >= threshold && !entry.warned.has(threshold)) {
      entry.warned.add(threshold);
      const pct = Math.round(threshold * 100);
      const message =
        threshold >= 1
          ? `Free-tier budget for "${provider}" is exhausted (${entry.count}/${quota} today). Requests will start failing — cached responses will be served where possible.`
          : `Free-tier budget for "${provider}" is at ${pct}% (${entry.count}/${quota} today).`;
      logger[threshold >= 1 ? 'error' : 'warn'](message, { provider, count: entry.count, quota });
    }
  }
  return entry.count;
}

/** Record a failed outbound call (counts toward usage — the provider saw it). */
export function recordFailure(provider) {
  const entry = bucket(provider);
  entry.failures += 1;
}

/**
 * True when the provider's daily budget is already spent. Callers use this to
 * skip a doomed request and go straight to cache or a fallback provider.
 * @param {string} provider
 */
export function isBudgetExhausted(provider) {
  const quota = quotaFor(provider);
  if (!quota) return false;
  return bucket(provider).count >= quota;
}

/** Machine-readable snapshot for `GET /api/meta/usage`. */
export function usageSnapshot() {
  const providers = [...counters.entries()].map(([provider, entry]) => {
    const quota = quotaFor(provider);
    return {
      provider,
      day: entry.day,
      calls: entry.count,
      failures: entry.failures,
      quota,
      remaining: quota === null ? null : Math.max(quota - entry.count, 0),
      usedPercent: quota === null ? null : Math.round((entry.count / quota) * 1000) / 10,
      lastCallAt: entry.lastCallAt,
    };
  });

  providers.sort((a, b) => b.calls - a.calls);
  return { day: today(), providers };
}

/** Test hook. */
export function resetUsage() {
  counters.clear();
}

export default { recordCall, recordFailure, isBudgetExhausted, usageSnapshot, resetUsage };
