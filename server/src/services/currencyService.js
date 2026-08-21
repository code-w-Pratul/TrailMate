import config from '../config/env.js';
import ApiError from '../lib/ApiError.js';
import { createUpstreamClient, UpstreamError } from '../lib/httpClient.js';
import { cacheKey, wrap } from '../cache/index.js';

/**
 * Currency conversion via Frankfurter (ECB reference rates — keyless,
 * unmetered, no signup).
 *
 * The one sharp edge worth knowing: Frankfurter only covers the ~30 currencies
 * the ECB publishes. REST Countries will happily tell us Vietnam uses VND,
 * which Frankfurter cannot price. Rather than surfacing a raw 404, we check the
 * supported list first and return an explicit, actionable message — the
 * currency card degrades to "not supported" instead of looking broken.
 */

const frankfurter = createUpstreamClient({
  provider: 'frankfurter',
  baseURL: 'https://api.frankfurter.app',
  metered: false,
});

const CODE = /^[A-Za-z]{3}$/;

const normaliseCode = (code, field) => {
  const value = String(code ?? '')
    .trim()
    .toUpperCase();
  if (!CODE.test(value)) {
    throw ApiError.badRequest(`"${field}" must be a 3-letter currency code (e.g. USD)`);
  }
  return value;
};

/* -------------------------------------------------------------------------- */
/* Supported currencies                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `{ USD: 'United States Dollar', … }` plus a sorted array form for pickers.
 * Cached for a day; the ECB does not add currencies often.
 */
export async function getSupportedCurrencies({ forceRefresh = false } = {}) {
  return wrap({
    key: cacheKey('currencies', { v: 1 }),
    ttl: config.cacheTtl.country,
    provider: 'frankfurter',
    forceRefresh,
    fetcher: async () => {
      const body = await frankfurter.get('/currencies');
      const map = body && typeof body === 'object' ? body : {};
      return {
        map,
        list: Object.entries(map)
          .map(([code, name]) => ({ code, name }))
          .sort((a, b) => a.code.localeCompare(b.code)),
        count: Object.keys(map).length,
      };
    },
  });
}

async function assertSupported(codes) {
  let supported;
  try {
    ({ data: supported } = await getSupportedCurrencies());
  } catch {
    // If the currency list itself is unreachable, don't block the conversion —
    // let the rate request fail on its own terms instead.
    return;
  }

  const unsupported = codes.filter((code) => !(code in supported.map));
  if (unsupported.length) {
    throw ApiError.badRequest(
      `${unsupported.join(' and ')} ${unsupported.length > 1 ? 'are' : 'is'} not covered by ECB reference rates, so a live conversion is unavailable.`,
      {
        code: 'CURRENCY_NOT_SUPPORTED',
        details: { unsupported, supportedCount: supported.count },
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Conversion                                                                  */
/* -------------------------------------------------------------------------- */

const round = (n, dp = 4) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  const f = 10 ** dp;
  return Math.round(num * f) / f;
};

/**
 * Convert an amount between two currencies.
 *
 * @param {object} params
 * @param {string} params.from
 * @param {string} params.to
 * @param {number} [params.amount]
 * @param {boolean} [params.includeSeries] attach a 30-day rate history
 * @param {boolean} [params.forceRefresh]
 */
export async function convertCurrency({
  from,
  to,
  amount = 1,
  includeSeries = false,
  forceRefresh = false,
}) {
  const base = normaliseCode(from, 'from');
  const target = normaliseCode(to, 'to');
  const qty = Number(amount);

  if (!Number.isFinite(qty) || qty < 0) {
    throw ApiError.badRequest('"amount" must be a non-negative number');
  }

  /* Identity conversion needs no network call at all. */
  if (base === target) {
    return {
      data: {
        from: base,
        to: target,
        rate: 1,
        inverseRate: 1,
        amount: qty,
        converted: round(qty, 2),
        date: new Date().toISOString().slice(0, 10),
        series: includeSeries ? [] : undefined,
        identity: true,
        provider: 'local',
      },
      meta: { cached: false, stale: false, degraded: false, provider: 'local', ageSeconds: 0 },
    };
  }

  await assertSupported([base, target]);

  const key = cacheKey('currency', { base, target, series: includeSeries });

  return wrap({
    key,
    ttl: config.cacheTtl.currency,
    provider: 'frankfurter',
    forceRefresh,
    fetcher: async () => {
      const latest = await frankfurter
        .get('/latest', { params: { base, symbols: target } })
        .catch(rethrowUnsupported([base, target]));

      const rate = latest?.rates?.[target];
      if (!Number.isFinite(rate)) {
        throw ApiError.badGateway(`No exchange rate available for ${base} → ${target}`);
      }

      const series = includeSeries ? await fetchSeries(base, target) : undefined;

      return {
        from: base,
        to: target,
        rate: round(rate, 6),
        inverseRate: round(1 / rate, 6),
        date: latest.date ?? null,
        ...(series ? { series, trend: describeTrend(series) } : {}),
        provider: 'frankfurter',
      };
    },
  }).then((result) => ({
    ...result,
    // The rate is cached; the multiplication is not — so a user changing the
    // amount never triggers another upstream call.
    data: {
      ...result.data,
      amount: qty,
      converted: round(qty * result.data.rate, 2),
    },
  }));
}

/** 30 days of daily closes, for the sparkline on the currency card. */
async function fetchSeries(base, target) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);

  try {
    const body = await frankfurter.get(
      `/${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}`,
      { params: { base, symbols: target } }
    );
    return Object.entries(body?.rates ?? {})
      .map(([date, rates]) => ({ date, rate: round(rates?.[target], 6) }))
      .filter((point) => point.rate !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    // A missing sparkline must never fail the conversion itself.
    return [];
  }
}

function describeTrend(series) {
  if (series.length < 2) return null;
  const first = series[0].rate;
  const last = series[series.length - 1].rate;
  const changePercent = round(((last - first) / first) * 100, 2);
  return {
    changePercent,
    direction: changePercent > 0.25 ? 'up' : changePercent < -0.25 ? 'down' : 'flat',
    periodDays: series.length,
    low: Math.min(...series.map((p) => p.rate)),
    high: Math.max(...series.map((p) => p.rate)),
  };
}

/** Frankfurter answers 404 for codes it does not price. Translate that. */
const rethrowUnsupported = (codes) => (error) => {
  if (error instanceof UpstreamError && error.upstreamStatus === 404) {
    throw ApiError.badRequest(
      `${codes.join(' → ')} is not a supported currency pair for live rates.`,
      { code: 'CURRENCY_NOT_SUPPORTED', details: { requested: codes } }
    );
  }
  throw error;
};

export default { convertCurrency, getSupportedCurrencies };
