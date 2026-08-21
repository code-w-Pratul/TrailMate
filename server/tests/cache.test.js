// Under ESM the `jest` object is not injected as a global; it must be imported.
import { jest } from '@jest/globals';
import { cacheKey, wrap, wrapWithFallback, readEntry, cacheStats } from '../src/cache/index.js';
import { recordCall, isBudgetExhausted, usageSnapshot } from '../src/lib/apiUsage.js';

/**
 * The resilience machinery, tested directly.
 *
 * These behaviours are the difference between "I called an API" and "I handled
 * an API", so they get unit tests rather than being left implicit in the route
 * tests: stale-while-broken, request coalescing, provider fallback and quota
 * accounting.
 */

describe('cacheKey', () => {
  it('is order-independent and case-insensitive', () => {
    expect(cacheKey('weather', { lat: 1, lon: 2 })).toBe(cacheKey('weather', { lon: 2, lat: 1 }));
    expect(cacheKey('country', { q: 'Japan' })).toBe(cacheKey('country', { q: 'japan' }));
  });

  it('drops empty values so absent params do not fragment the cache', () => {
    expect(cacheKey('places', { city: 'kyoto', radius: undefined, tag: '' })).toBe(
      cacheKey('places', { city: 'kyoto' })
    );
  });

  it('hashes very long keys instead of growing unbounded', () => {
    const key = cacheKey('ai', { prompt: 'x'.repeat(500) });
    expect(key.startsWith('ai:')).toBe(true);
    expect(key.length).toBeLessThan(60);
  });
});

describe('wrap', () => {
  it('calls the fetcher once and serves subsequent reads from cache', async () => {
    const fetcher = jest.fn().mockResolvedValue({ value: 1 });

    const first = await wrap({ key: 'k:1', ttl: 60, fetcher });
    const second = await wrap({ key: 'k:1', ttl: 60, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.meta.cached).toBe(false);
    expect(second.meta.cached).toBe(true);
    expect(second.meta.stale).toBe(false);
    expect(second.data).toEqual({ value: 1 });
  });

  it('serves a stale entry when the upstream fails — the "showing cached data" path', async () => {
    // ttl: 0 makes the entry stale the instant it is written, while the
    // stale-grace window keeps it physically retained as a lifeboat.
    await wrap({ key: 'k:stale', ttl: 0, fetcher: async () => ({ tempC: 21 }) });

    const failing = jest.fn().mockRejectedValue(new Error('provider is down'));
    const result = await wrap({ key: 'k:stale', ttl: 0, fetcher: failing });

    expect(failing).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ tempC: 21 });
    expect(result.meta).toMatchObject({ cached: true, stale: true, degraded: true });
    expect(result.meta.warning).toMatch(/Live data unavailable/i);
  });

  it('propagates the error when the upstream fails and there is nothing cached', async () => {
    await expect(
      wrap({
        key: 'k:cold',
        ttl: 60,
        fetcher: async () => {
          throw new Error('boom');
        },
      })
    ).rejects.toThrow('boom');
  });

  it('coalesces concurrent misses into a single upstream call', async () => {
    let calls = 0;
    const slow = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 40));
      return { calls };
    };

    const results = await Promise.all(
      Array.from({ length: 8 }, () => wrap({ key: 'k:flight', ttl: 60, fetcher: slow }))
    );

    // Eight simultaneous dashboard loads must cost one API credit, not eight.
    expect(calls).toBe(1);
    expect(results.every((r) => r.data.calls === 1)).toBe(true);
  });

  it('forceRefresh bypasses a fresh entry', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });

    await wrap({ key: 'k:force', ttl: 60, fetcher });
    const refreshed = await wrap({ key: 'k:force', ttl: 60, fetcher, forceRefresh: true });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refreshed.data).toEqual({ v: 2 });
  });

  it('records the provider on the entry so later cache hits keep their provenance', async () => {
    await wrap({ key: 'k:prov', ttl: 60, provider: 'open-meteo', fetcher: async () => 1 });
    const entry = await readEntry('k:prov');
    expect(entry.envelope.provider).toBe('open-meteo');
  });
});

describe('wrapWithFallback', () => {
  it('falls through to the next provider and reports which one answered', async () => {
    const result = await wrapWithFallback({
      key: 'k:fb',
      ttl: 60,
      resource: 'weather',
      providers: [
        {
          name: 'primary',
          fetch: async () => {
            throw new Error('quota exceeded');
          },
        },
        { name: 'secondary', fetch: async () => ({ tempC: 18 }) },
      ],
    });

    expect(result.data).toEqual({ tempC: 18 });
    expect(result.meta.provider).toBe('secondary');
    expect(result.meta.providerFallback).toBe(true);
    expect(result.meta.attempted).toEqual([
      { provider: 'primary', ok: false, reason: 'quota exceeded' },
      { provider: 'secondary', ok: true },
    ]);
  });

  it('skips disabled providers entirely', async () => {
    const disabled = jest.fn();
    const result = await wrapWithFallback({
      key: 'k:fb2',
      ttl: 60,
      providers: [
        { name: 'needs-key', enabled: false, fetch: disabled },
        { name: 'keyless', fetch: async () => 'ok' },
      ],
    });

    expect(disabled).not.toHaveBeenCalled();
    expect(result.meta.provider).toBe('keyless');
    expect(result.meta.providerFallback).toBeUndefined();
  });

  it('reports a 502 listing every failure when no provider succeeds', async () => {
    await expect(
      wrapWithFallback({
        key: 'k:fb3',
        ttl: 60,
        resource: 'places near Kyoto',
        providers: [
          {
            name: 'a',
            fetch: async () => {
              throw new Error('timeout');
            },
          },
          {
            name: 'b',
            fetch: async () => {
              throw new Error('503');
            },
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 502,
      message: 'Could not load places near Kyoto',
      details: ['a: timeout', 'b: 503'],
    });
  });
});

describe('cacheStats', () => {
  it('exposes hit/miss counters used by the API budget widget', async () => {
    await wrap({ key: 'k:s', ttl: 60, fetcher: async () => 1 });
    await wrap({ key: 'k:s', ttl: 60, fetcher: async () => 1 });

    const stats = await cacheStats();
    expect(stats.store).toBe('memory');
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.entries).toBeGreaterThanOrEqual(1);
  });
});

describe('free-tier budget tracking', () => {
  it('counts calls per provider and reports remaining quota', () => {
    recordCall('openweather');
    recordCall('openweather');
    recordCall('unsplash');

    const { providers } = usageSnapshot();
    const openweather = providers.find((p) => p.provider === 'openweather');

    expect(openweather.calls).toBe(2);
    expect(openweather.quota).toBe(1000);
    expect(openweather.remaining).toBe(998);
    expect(openweather.usedPercent).toBeCloseTo(0.2, 1);
  });

  it('flags a provider as exhausted once its daily budget is spent', () => {
    expect(isBudgetExhausted('unsplash')).toBe(false);
    // Unsplash's free tier is 50 requests/hour.
    for (let i = 0; i < 50; i += 1) recordCall('unsplash');
    expect(isBudgetExhausted('unsplash')).toBe(true);
  });

  it('treats unmetered providers as never exhausted', () => {
    for (let i = 0; i < 5000; i += 1) recordCall('open-meteo');
    expect(isBudgetExhausted('open-meteo')).toBe(false);
  });
});
