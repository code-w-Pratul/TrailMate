import { readFileSync } from 'node:fs';
import path from 'node:path';
import asyncHandler from '../lib/asyncHandler.js';
import { sendData } from '../lib/respond.js';
import config from '../config/env.js';
import { dbStatus } from '../config/db.js';
import { cacheStats } from '../cache/index.js';
import { usageSnapshot } from '../lib/apiUsage.js';
import { aiStatus } from '../services/aiService.js';
import { PLAN_SECTIONS, ACTIVITIES } from '../validators/schemas.js';
import { TRAVEL_STYLES } from '../services/budgetService.js';

/** Observability and self-description endpoints. */

const version = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(config.serverRoot, 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * GET /api/health
 *
 * Never calls a third party — a health check that depends on OpenWeatherMap
 * being up is not a health check. It reports our own state and lets the caller
 * judge: 200 when the API can serve requests, 503 only when it genuinely
 * cannot.
 */
export const health = asyncHandler(async (_req, res) => {
  const db = dbStatus();
  const cache = await cacheStats();

  const payload = {
    status: 'ok',
    version,
    environment: config.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      api: { status: 'ok' },
      database: {
        status: db.ready ? 'ok' : 'degraded',
        state: db.state,
        name: db.name,
        note: db.ready ? undefined : 'Accounts and saved trips are unavailable',
      },
      cache: { status: 'ok', store: cache.store, entries: cache.entries ?? null },
    },
  };

  /* Degraded, not down: proxy routes still work without Mongo, so a 200 with a
     degraded flag is the truthful answer. */
  if (!db.ready) payload.status = 'degraded';

  return sendData(res, payload);
});

/** GET /api/health/live — liveness probe: is the process running at all. */
export const live = (_req, res) => res.status(200).json({ status: 'alive' });

/** GET /api/health/ready — readiness probe: should traffic be routed here. */
export const ready = (_req, res) => {
  const db = dbStatus();
  const readyToServe = true; // the proxy layer is always ready
  return res.status(readyToServe ? 200 : 503).json({
    status: readyToServe ? 'ready' : 'not-ready',
    database: db.state,
  });
};

/**
 * GET /api/meta/usage
 *
 * Today's spend against each provider's free tier. This is the endpoint behind
 * the "API budget" widget, and the thing that turns "I called an API" into
 * "I know what my integration costs".
 */
export const usage = asyncHandler(async (_req, res) => {
  const snapshot = usageSnapshot();
  const cache = await cacheStats();

  const hits = cache.hits ?? 0;
  const misses = cache.misses ?? 0;
  const lookups = hits + misses;

  return sendData(res, {
    ...snapshot,
    cache: {
      store: cache.store,
      entries: cache.entries ?? null,
      hits,
      misses,
      hitRate: lookups ? Math.round((hits / lookups) * 1000) / 10 : null,
      inflight: cache.inflight,
      staleGraceSeconds: cache.staleGrace,
    },
    note:
      'Counters are per-process and reset at 00:00 UTC. Cache hits never reach a provider, ' +
      'so a high hit rate directly reduces quota consumption.',
  });
});

/**
 * GET /api/meta/config
 *
 * Lets the frontend adapt to how the server is configured — which provider is
 * answering, whether an LLM is wired up, what the enum options are — without
 * hardcoding a duplicate copy of the backend's rules.
 */
export const publicConfig = asyncHandler(async (_req, res) =>
  sendData(res, {
    version,
    environment: config.NODE_ENV,
    providers: config.providers,
    ai: aiStatus(),
    features: {
      accounts: dbStatus().ready,
      savedTrips: dbStatus().ready,
      sharing: dbStatus().ready,
      aiSummary: true,
      packingList: true,
      budgetEstimator: true,
      multiCity: true,
      climateNormals: true,
    },
    options: {
      planSections: PLAN_SECTIONS,
      activities: ACTIVITIES,
      travelStyles: Object.entries(TRAVEL_STYLES).map(([key, value]) => ({ key, ...value })),
      maxForecastDays: 7,
      maxStops: 8,
    },
    limits: {
      rateLimitWindowMs: config.RATE_LIMIT_WINDOW_MS,
      rateLimitMax: config.RATE_LIMIT_MAX,
    },
  })
);

export default { health, live, ready, usage, publicConfig };
