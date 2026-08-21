import config from '../config/env.js';
import ApiError from '../lib/ApiError.js';
import logger from '../lib/logger.js';
import { createUpstreamClient } from '../lib/httpClient.js';
import { cacheKey, wrap } from '../cache/index.js';

/**
 * Country reference data.
 *
 * ── A note on why this does not call restcountries.com ──────────────────────
 * TrailMate originally proxied `restcountries.com/v3.1`. Partway through
 * development that API was retired: it began answering **HTTP 200** with a
 * deprecation notice body instead of country data, and its replacement (v5, on
 * api.restcountries.com) now requires an authorisation key.
 *
 * A 200-with-the-wrong-body is the nastiest kind of upstream change, because
 * naive code treats it as success. Here it produced a country object with every
 * field silently `null`, which then quietly broke the currency card and the
 * budget estimate downstream. Two fixes came out of that:
 *
 *   1. This service now reads the **same upstream dataset REST Countries is
 *      built from** — mledoze/countries — served over the jsDelivr CDN. It is
 *      keyless, versioned, fast, and cannot be deprecated out from under us.
 *      Country data changes once a decade, so it is fetched once and cached for
 *      a week, then indexed in memory. No per-request network call at all.
 *
 *   2. `assertUsable()` validates the *shape* of what we produce, so any future
 *      upstream change fails loudly with a 502 instead of poisoning the
 *      dashboard with nulls.
 *
 * Fields the raw dataset does not carry are derived rather than faked:
 * flag images from flagcdn.com (deterministic URLs), map links from the
 * centroid, and driving side from the documented left-hand-traffic list below.
 * Timezone is deliberately *not* sourced here — the geocoder already returns a
 * city-level IANA zone, which is strictly more accurate than a country-level one
 * for a country spanning several zones.
 */

const dataset = createUpstreamClient({
  provider: 'countries-dataset',
  baseURL: 'https://cdn.jsdelivr.net/gh/mledoze/countries@master',
  metered: false,
  // A 1.4 MB payload over a CDN, fetched at most once a week.
  timeout: Math.max(config.UPSTREAM_TIMEOUT_MS, 20_000),
});

/**
 * Countries and territories that drive on the left.
 * Used only for the "look right when crossing" packing note, so it is labelled
 * best-effort and defaults to right-hand traffic when unlisted.
 */
const LEFT_HAND_TRAFFIC = new Set([
  'AG',
  'AU',
  'BB',
  'BD',
  'BM',
  'BN',
  'BS',
  'BT',
  'BW',
  'CY',
  'DM',
  'FJ',
  'FK',
  'GB',
  'GD',
  'GG',
  'GY',
  'HK',
  'ID',
  'IE',
  'IM',
  'IN',
  'JE',
  'JM',
  'JP',
  'KE',
  'KI',
  'KN',
  'KY',
  'LC',
  'LK',
  'LS',
  'MO',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MY',
  'MZ',
  'NA',
  'NF',
  'NP',
  'NR',
  'NU',
  'NZ',
  'PG',
  'PK',
  'PN',
  'SB',
  'SC',
  'SG',
  'SH',
  'SR',
  'SZ',
  'TC',
  'TH',
  'TL',
  'TO',
  'TT',
  'TV',
  'TZ',
  'UG',
  'VC',
  'VG',
  'VI',
  'WS',
  'ZA',
  'ZM',
  'ZW',
]);

/* -------------------------------------------------------------------------- */
/* Dataset loading and indexing                                                */
/* -------------------------------------------------------------------------- */

async function fetchDataset() {
  const body = await dataset.get('/countries.json');

  if (!Array.isArray(body) || body.length < 100) {
    throw ApiError.badGateway('Country dataset came back in an unexpected shape', {
      details: `Expected an array of 200+ records, received ${
        Array.isArray(body) ? `${body.length} items` : typeof body
      }`,
    });
  }
  return body;
}

/**
 * Lookup tables built once per process. Rebuilt at most every six hours so a
 * long-running instance eventually picks up a refreshed dataset.
 */
let indexCache = { builtAt: 0, value: null };

function buildIndex(records) {
  const byCode = new Map();
  const byName = new Map();

  const register = (map, key, record) => {
    if (!key) return;
    const normalised = String(key).trim().toLowerCase();
    // First writer wins: canonical names are registered before alt spellings.
    if (normalised && !map.has(normalised)) map.set(normalised, record);
  };

  for (const record of records) {
    register(byCode, record.cca2, record);
    register(byCode, record.cca3, record);
    register(byCode, record.ccn3, record);
    register(byCode, record.cioc, record);
    register(byName, record.name?.common, record);
    register(byName, record.name?.official, record);
  }

  // Alt spellings and translations in a second pass so they never shadow a
  // canonical name (e.g. "Congo" must not resolve via another country's alias).
  for (const record of records) {
    for (const alt of record.altSpellings ?? []) register(byName, alt, record);
    for (const translation of Object.values(record.translations ?? {})) {
      register(byName, translation?.common, record);
    }
  }

  return { records, byCode, byName };
}

async function getIndex() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (indexCache.value && Date.now() - indexCache.builtAt < SIX_HOURS) {
    return indexCache.value;
  }

  const { data } = await wrap({
    key: cacheKey('country-dataset', { v: 1 }),
    ttl: config.cacheTtl.country * 7,
    provider: 'countries-dataset',
    fetcher: fetchDataset,
  });

  indexCache = { builtAt: Date.now(), value: buildIndex(data) };
  logger.debug('Country dataset indexed', { records: data.length });
  return indexCache.value;
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

function normalise(raw) {
  const currencies = Object.entries(raw.currencies ?? {}).map(([code, detail]) => ({
    code,
    name: detail?.name ?? null,
    symbol: detail?.symbol ?? null,
  }));

  const languages = Object.entries(raw.languages ?? {}).map(([code, name]) => ({ code, name }));

  const suffixes = Array.isArray(raw.idd?.suffixes) ? raw.idd.suffixes : [];
  const callingCode = raw.idd?.root
    ? suffixes.length === 1
      ? `${raw.idd.root}${suffixes[0]}`
      : raw.idd.root
    : null;

  const code2 = raw.cca2 ?? null;
  const latitude = raw.latlng?.[0] ?? null;
  const longitude = raw.latlng?.[1] ?? null;

  return {
    name: raw.name?.common ?? null,
    officialName: raw.name?.official ?? null,
    code: code2,
    code3: raw.cca3 ?? null,
    capital: raw.capital?.[0] ?? null,
    capitals: raw.capital ?? [],
    region: raw.region ?? null,
    subregion: raw.subregion ?? null,
    continent: raw.region ?? null,
    languages,
    primaryLanguage: languages[0]?.name ?? null,
    currencies,
    primaryCurrency: currencies[0] ?? null,
    /* Timezone comes from the geocoder (city-level), not from here. */
    timezones: [],
    primaryTimezone: null,
    population: null,
    areaKm2: raw.area ?? null,
    latitude,
    longitude,
    landlocked: raw.landlocked ?? null,
    demonym: raw.demonyms?.eng?.m ?? null,
    flag: {
      emoji: raw.flag ?? null,
      png: code2 ? `https://flagcdn.com/w320/${code2.toLowerCase()}.png` : null,
      svg: code2 ? `https://flagcdn.com/${code2.toLowerCase()}.svg` : null,
      alt: raw.name?.common ? `Flag of ${raw.name.common}` : null,
    },
    drivingSide: code2 ? (LEFT_HAND_TRAFFIC.has(code2) ? 'left' : 'right') : null,
    drivingSideConfidence: 'best-effort',
    callingCode,
    topLevelDomain: raw.tld?.[0] ?? null,
    unMember: raw.unMember ?? null,
    independent: raw.independent ?? null,
    neighbours: raw.borders ?? [],
    maps: {
      googleMaps: raw.name?.common
        ? `https://www.google.com/maps/search/${encodeURIComponent(raw.name.common)}`
        : null,
      openStreetMaps:
        latitude !== null && longitude !== null
          ? `https://www.openstreetmap.org/#map=5/${latitude}/${longitude}`
          : null,
    },
    provider: 'restcountries-dataset',
    attribution: {
      label: 'Country data from mledoze/countries (the REST Countries source dataset)',
      url: 'https://github.com/mledoze/countries',
    },
  };
}

/**
 * Guard against silent upstream drift.
 *
 * The bug that motivated this: a provider answered 200 with a body that had
 * none of the expected keys, and the normaliser dutifully produced an object of
 * nulls that flowed all the way into the UI. Validating the *output* — not just
 * the HTTP status — turns that class of failure into a loud 502.
 */
function assertUsable(country, query) {
  const missing = [];
  if (!country.name) missing.push('name');
  if (!country.code) missing.push('code');
  if (!country.currencies.length) missing.push('currencies');

  if (missing.length) {
    throw ApiError.badGateway(`Country data for "${query}" is incomplete and cannot be trusted`, {
      details: { missingFields: missing },
    });
  }
  return country;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Look a country up by name (`France`, `Deutschland`) or ISO code (`FR`, `FRA`).
 * @param {string} nameOrCode
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function getCountry(nameOrCode, { forceRefresh = false } = {}) {
  const query = String(nameOrCode ?? '').trim();
  if (!query) throw ApiError.badRequest('A country name or ISO code is required');
  if (query.length > 60) throw ApiError.badRequest('Country name is too long');

  return wrap({
    key: cacheKey('country', { q: query }),
    ttl: config.cacheTtl.country,
    provider: 'restcountries-dataset',
    forceRefresh,
    fetcher: async () => {
      const { byCode, byName } = await getIndex();
      const needle = query.toLowerCase();

      const record =
        (/^[a-z]{2,3}$/.test(needle) ? byCode.get(needle) : null) ??
        byName.get(needle) ??
        byCode.get(needle);

      if (!record) throw ApiError.notFound(`No country matched "${query}"`);

      return assertUsable(normalise(record), query);
    },
  });
}

/** Every country, trimmed to what a picker needs. Used by the UI's selectors. */
export async function listCountries({ forceRefresh = false } = {}) {
  return wrap({
    key: cacheKey('country-list', { v: 1 }),
    ttl: config.cacheTtl.country,
    provider: 'restcountries-dataset',
    forceRefresh,
    fetcher: async () => {
      const { records } = await getIndex();
      return records
        .filter((r) => r.name?.common && r.cca2)
        .map((r) => ({
          name: r.name.common,
          code: r.cca2,
          currency: Object.keys(r.currencies ?? {})[0] ?? null,
          flag: r.flag ?? null,
          region: r.region ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** Test hook. */
export function resetCountryIndex() {
  indexCache = { builtAt: 0, value: null };
}

export default { getCountry, listCountries, resetCountryIndex };
