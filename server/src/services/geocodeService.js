import config from '../config/env.js';
import ApiError from '../lib/ApiError.js';
import { createUpstreamClient } from '../lib/httpClient.js';
import { cacheKey, wrapWithFallback } from '../cache/index.js';

/**
 * City → coordinates.
 *
 * Everything downstream (weather, places, the map) is coordinate-driven, so
 * this service is the funnel every city name passes through exactly once. It is
 * cached for a week because a city's latitude does not change.
 *
 * Primary provider is Open-Meteo's geocoder: keyless, unmetered and it returns
 * an IANA timezone, which we need for grouping forecasts into local days.
 * OpenWeatherMap's geocoder is used as a secondary when a key is present.
 */

const openMeteoGeo = createUpstreamClient({
  provider: 'open-meteo-geocoding',
  baseURL: 'https://geocoding-api.open-meteo.com/v1',
  metered: false,
});

const openWeatherGeo = createUpstreamClient({
  provider: 'openweather',
  baseURL: 'https://api.openweathermap.org/geo/1.0',
});

/* -------------------------------------------------------------------------- */
/* Query parsing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Splits "Paris, France" / "Springfield, US" into a name and a country hint so
 * ambiguous city names can be disambiguated by the caller.
 * @param {string} raw
 */
export function parseCityQuery(raw) {
  const trimmed = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!trimmed) throw ApiError.badRequest('A city name is required');

  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    name: parts[0],
    countryHint: parts.length > 1 ? parts[parts.length - 1] : null,
    raw: trimmed,
  };
}

function matchesCountry(location, hint) {
  if (!hint) return true;
  const needle = hint.toLowerCase();
  return (
    location.country?.toLowerCase() === needle ||
    location.countryCode?.toLowerCase() === needle ||
    location.country?.toLowerCase().includes(needle)
  );
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

function buildLabel({ name, region, country }) {
  return [name, region, country].filter(Boolean).join(', ');
}

function fromOpenMeteo(result) {
  const base = {
    id: `om:${result.id}`,
    name: result.name,
    latitude: round(result.latitude, 4),
    longitude: round(result.longitude, 4),
    country: result.country ?? null,
    countryCode: result.country_code ?? null,
    region: result.admin1 ?? null,
    timezone: result.timezone ?? null,
    population: result.population ?? null,
    elevation: result.elevation ?? null,
  };
  return { ...base, label: buildLabel(base) };
}

function fromOpenWeather(result) {
  const base = {
    id: `ow:${result.lat},${result.lon}`,
    name: result.name,
    latitude: round(result.lat, 4),
    longitude: round(result.lon, 4),
    country: result.country ?? null,
    countryCode: result.country ?? null,
    region: result.state ?? null,
    timezone: null,
    population: null,
    elevation: null,
  };
  return { ...base, label: buildLabel(base) };
}

const round = (n, dp) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  const f = 10 ** dp;
  return Math.round(num * f) / f;
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Search for candidate cities.
 * @param {string} query
 * @param {{ limit?: number, forceRefresh?: boolean }} [options]
 * @returns {Promise<{ data: Array<object>, meta: object }>}
 */
export async function searchCities(query, { limit = 6, forceRefresh = false } = {}) {
  const { name, countryHint, raw } = parseCityQuery(query);
  const key = cacheKey('geocode', { q: raw, limit });

  const result = await wrapWithFallback({
    key,
    ttl: config.cacheTtl.geocode,
    forceRefresh,
    resource: `location "${raw}"`,
    providers: [
      {
        name: 'open-meteo-geocoding',
        fetch: async () => {
          const body = await openMeteoGeo.get('/search', {
            params: { name, count: Math.max(limit, 10), language: 'en', format: 'json' },
          });
          const all = (body?.results ?? []).map(fromOpenMeteo);
          return pick(all, countryHint, limit);
        },
      },
      {
        name: 'openweather-geocoding',
        enabled: Boolean(config.OPENWEATHER_API_KEY),
        fetch: async () => {
          const body = await openWeatherGeo.get('/direct', {
            params: {
              q: countryHint ? `${name},${countryHint}` : name,
              limit: Math.max(limit, 5),
              appid: config.OPENWEATHER_API_KEY,
            },
          });
          const all = (Array.isArray(body) ? body : []).map(fromOpenWeather);
          return pick(all, countryHint, limit);
        },
      },
    ],
  });

  if (!result.data.length) {
    throw ApiError.notFound(
      `No place matched "${raw}". Try a different spelling or add a country.`
    );
  }
  return result;
}

/** Prefer country-hint matches, then largest population, then original order. */
function pick(all, countryHint, limit) {
  const filtered = countryHint ? all.filter((l) => matchesCountry(l, countryHint)) : all;
  const pool = filtered.length ? filtered : all;
  return [...pool].sort((a, b) => (b.population ?? 0) - (a.population ?? 0)).slice(0, limit);
}

/**
 * Resolve a single best-match location — the common path for every
 * city-keyed route.
 * @param {string} query
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<object>} normalised location
 */
export async function resolveCity(query, options = {}) {
  const { data } = await searchCities(query, { ...options, limit: 6 });
  return data[0];
}

export default { searchCities, resolveCity, parseCityQuery };
