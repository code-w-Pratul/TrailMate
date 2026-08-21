import config from '../config/env.js';
import ApiError from '../lib/ApiError.js';
import { createUpstreamClient } from '../lib/httpClient.js';
import { cacheKey, wrapWithFallback } from '../cache/index.js';
import { isBudgetExhausted } from '../lib/apiUsage.js';
import { resolveCity } from './geocodeService.js';
import {
  conditionLabel,
  fromOpenWeatherId,
  fromWmoCode,
  wmoDescription,
  WET_CONDITIONS,
} from './normalizers/weatherCodes.js';

/**
 * Weather.
 *
 * Two interchangeable providers behind one normalised contract:
 *   • OpenWeatherMap  — used when OPENWEATHER_API_KEY is set (1k calls/day)
 *   • Open-Meteo      — keyless fallback, also used once the OWM budget is spent
 *
 * Design notes
 * ------------
 * The API is deliberately single-unit: everything leaves here in Celsius,
 * km/h and millimetres. Imperial display is a *presentation* concern handled by
 * the client's unit toggle, which keeps cache keys and AI prompts unambiguous.
 *
 * Forecasts are grouped into **local** calendar days using the destination's
 * timezone, not the server's — otherwise a Tokyo forecast rendered from a
 * European server drifts by a day.
 */

const openWeather = createUpstreamClient({
  provider: 'openweather',
  baseURL: 'https://api.openweathermap.org/data/2.5',
});

const openMeteo = createUpstreamClient({
  provider: 'open-meteo',
  baseURL: 'https://api.open-meteo.com/v1',
  metered: false,
});

const openMeteoArchive = createUpstreamClient({
  provider: 'open-meteo-archive',
  baseURL: 'https://archive-api.open-meteo.com/v1',
  metered: false,
  timeout: Math.max(config.UPSTREAM_TIMEOUT_MS, 12_000),
});

const MAX_FORECAST_DAYS = 7;

/* -------------------------------------------------------------------------- */
/* Small numeric helpers                                                       */
/* -------------------------------------------------------------------------- */

const r1 = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 10) / 10 : null);
const r0 = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : null);
const msToKph = (ms) =>
  Number.isFinite(Number(ms)) ? Math.round(Number(ms) * 3.6 * 10) / 10 : null;
const avg = (list) => {
  const nums = list.filter((n) => Number.isFinite(n));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
};

/** How "notable" a condition is — used to pick a day's headline condition. */
const SEVERITY = {
  unknown: 0,
  clear: 1,
  'partly-cloudy': 2,
  cloudy: 3,
  fog: 4,
  wind: 5,
  drizzle: 6,
  rain: 7,
  snow: 8,
  'freezing-rain': 9,
  thunderstorm: 10,
  hail: 11,
};

/**
 * Pick the headline condition for a set of observations: the most frequent one,
 * with ties broken toward the more severe. "Mostly cloudy with one rain slot"
 * stays cloudy; "half rain, half cloud" becomes rain.
 * @param {string[]} conditions
 */
function dominantCondition(conditions) {
  if (!conditions.length) return 'unknown';
  const counts = new Map();
  for (const c of conditions) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (SEVERITY[b[0]] ?? 0) - (SEVERITY[a[0]] ?? 0);
  })[0][0];
}

/** `YYYY-MM-DD` for an epoch-seconds timestamp shifted into a fixed offset. */
function localDateFromEpoch(epochSeconds, offsetSeconds) {
  return new Date((epochSeconds + offsetSeconds) * 1000).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Provider: Open-Meteo                                                        */
/* -------------------------------------------------------------------------- */

async function fetchFromOpenMeteo(location, days) {
  const body = await openMeteo.get('/forecast', {
    params: {
      latitude: location.latitude,
      longitude: location.longitude,
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,uv_index_max',
      timezone: location.timezone || 'auto',
      forecast_days: days,
    },
  });

  const c = body?.current ?? {};
  const currentCondition = fromWmoCode(c.weather_code);

  const current = {
    tempC: r1(c.temperature_2m),
    feelsLikeC: r1(c.apparent_temperature),
    condition: currentCondition,
    conditionLabel: conditionLabel(currentCondition),
    description: wmoDescription(c.weather_code),
    humidity: r0(c.relative_humidity_2m),
    windKph: r1(c.wind_speed_10m),
    windDirection: r0(c.wind_direction_10m),
    pressureHpa: r0(c.surface_pressure),
    precipitationMm: r1(c.precipitation),
    uvIndex: r1(body?.daily?.uv_index_max?.[0]),
    isDay: c.is_day === undefined ? null : Boolean(c.is_day),
    observedAt: c.time ? new Date(c.time).toISOString() : new Date().toISOString(),
  };

  const d = body?.daily ?? {};
  const daily = (d.time ?? []).map((date, i) => {
    const condition = fromWmoCode(d.weather_code?.[i]);
    return {
      date,
      minC: r1(d.temperature_2m_min?.[i]),
      maxC: r1(d.temperature_2m_max?.[i]),
      feelsLikeMaxC: r1(d.apparent_temperature_max?.[i]),
      condition,
      conditionLabel: conditionLabel(condition),
      description: wmoDescription(d.weather_code?.[i]),
      precipitationMm: r1(d.precipitation_sum?.[i]),
      precipitationChance: r0(d.precipitation_probability_max?.[i]),
      windKph: r1(d.wind_speed_10m_max?.[i]),
      humidity: r0(d.relative_humidity_2m_mean?.[i]),
      uvIndex: r1(d.uv_index_max?.[i]),
      sunrise: d.sunrise?.[i] ?? null,
      sunset: d.sunset?.[i] ?? null,
    };
  });

  return assemble({
    location: { ...location, timezone: body?.timezone ?? location.timezone },
    current,
    daily,
    provider: 'open-meteo',
  });
}

/* -------------------------------------------------------------------------- */
/* Provider: OpenWeatherMap                                                    */
/* -------------------------------------------------------------------------- */

async function fetchFromOpenWeather(location, days) {
  // Two calls, issued in parallel: /weather is authoritative for "right now",
  // /forecast supplies the 3-hourly series we fold into local days.
  const [nowBody, forecastBody] = await Promise.all([
    openWeather.get('/weather', {
      params: {
        lat: location.latitude,
        lon: location.longitude,
        units: 'metric',
        appid: config.OPENWEATHER_API_KEY,
      },
    }),
    openWeather.get('/forecast', {
      params: {
        lat: location.latitude,
        lon: location.longitude,
        units: 'metric',
        appid: config.OPENWEATHER_API_KEY,
      },
    }),
  ]);

  const offsetSeconds = forecastBody?.city?.timezone ?? nowBody?.timezone ?? 0;

  const nowCondition = fromOpenWeatherId(nowBody?.weather?.[0]?.id);
  const current = {
    tempC: r1(nowBody?.main?.temp),
    feelsLikeC: r1(nowBody?.main?.feels_like),
    condition: nowCondition,
    conditionLabel: conditionLabel(nowCondition),
    description: capitalise(nowBody?.weather?.[0]?.description),
    humidity: r0(nowBody?.main?.humidity),
    windKph: msToKph(nowBody?.wind?.speed),
    windDirection: r0(nowBody?.wind?.deg),
    pressureHpa: r0(nowBody?.main?.pressure),
    precipitationMm: r1(nowBody?.rain?.['1h'] ?? nowBody?.snow?.['1h'] ?? 0),
    uvIndex: null, // not available on the free /weather endpoint
    isDay: nowBody?.weather?.[0]?.icon?.endsWith('d') ?? null,
    observedAt: nowBody?.dt ? new Date(nowBody.dt * 1000).toISOString() : new Date().toISOString(),
  };

  /* Fold the 3-hourly series into local calendar days. */
  const buckets = new Map();
  for (const slot of forecastBody?.list ?? []) {
    const date = localDateFromEpoch(slot.dt, offsetSeconds);
    if (!buckets.has(date)) buckets.set(date, []);
    buckets.get(date).push(slot);
  }

  const daily = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, days)
    .map(([date, slots]) => {
      const conditions = slots.map((s) => fromOpenWeatherId(s.weather?.[0]?.id));
      const condition = dominantCondition(conditions);

      // Describe the day using the slot nearest local noon — more
      // representative than an overnight reading.
      const noonSlot = slots.reduce((best, slot) => {
        const hour = new Date((slot.dt + offsetSeconds) * 1000).getUTCHours();
        const bestHour = new Date((best.dt + offsetSeconds) * 1000).getUTCHours();
        return Math.abs(hour - 12) < Math.abs(bestHour - 12) ? slot : best;
      }, slots[0]);

      const precip = slots.reduce(
        (sum, s) => sum + (s.rain?.['3h'] ?? 0) + (s.snow?.['3h'] ?? 0),
        0
      );

      return {
        date,
        minC: r1(Math.min(...slots.map((s) => s.main.temp_min ?? s.main.temp))),
        maxC: r1(Math.max(...slots.map((s) => s.main.temp_max ?? s.main.temp))),
        feelsLikeMaxC: r1(Math.max(...slots.map((s) => s.main.feels_like))),
        condition,
        conditionLabel: conditionLabel(condition),
        description: capitalise(noonSlot?.weather?.[0]?.description),
        precipitationMm: r1(precip),
        precipitationChance: r0(Math.max(...slots.map((s) => (s.pop ?? 0) * 100))),
        windKph: msToKph(Math.max(...slots.map((s) => s.wind?.speed ?? 0))),
        humidity: r0(avg(slots.map((s) => s.main.humidity))),
        uvIndex: null,
        sunrise: null,
        sunset: null,
      };
    });

  return assemble({
    location: {
      ...location,
      name: forecastBody?.city?.name ?? location.name,
      timezoneOffsetSeconds: offsetSeconds,
    },
    current,
    daily,
    provider: 'openweather',
  });
}

const capitalise = (s) =>
  typeof s === 'string' && s.length ? s[0].toUpperCase() + s.slice(1) : (s ?? null);

/* -------------------------------------------------------------------------- */
/* Shared assembly                                                             */
/* -------------------------------------------------------------------------- */

/** Adds the derived trip-level summary that packing, budget and AI all consume. */
function assemble({ location, current, daily, provider }) {
  const maxTemps = daily.map((d) => d.maxC).filter(Number.isFinite);
  const minTemps = daily.map((d) => d.minC).filter(Number.isFinite);
  const wetDays = daily.filter((d) => WET_CONDITIONS.has(d.condition)).length;

  return {
    location: {
      name: location.name,
      label: location.label ?? location.name,
      country: location.country ?? null,
      countryCode: location.countryCode ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone ?? null,
      timezoneOffsetSeconds: location.timezoneOffsetSeconds ?? null,
    },
    current,
    daily,
    summary: {
      days: daily.length,
      from: daily[0]?.date ?? null,
      to: daily[daily.length - 1]?.date ?? null,
      minC: minTemps.length ? r1(Math.min(...minTemps)) : null,
      maxC: maxTemps.length ? r1(Math.max(...maxTemps)) : null,
      avgMaxC: r1(avg(maxTemps)),
      avgMinC: r1(avg(minTemps)),
      wetDays,
      rainChanceMax: daily.length
        ? r0(Math.max(...daily.map((d) => d.precipitationChance ?? 0)))
        : null,
      totalPrecipitationMm: r1(daily.reduce((s, d) => s + (d.precipitationMm ?? 0), 0)),
      windKphMax: daily.length ? r1(Math.max(...daily.map((d) => d.windKph ?? 0))) : null,
      dominantCondition: dominantCondition(daily.map((d) => d.condition)),
    },
    units: { temperature: 'C', wind: 'kph', precipitation: 'mm' },
    provider,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Normalised forecast for a city.
 * @param {string} city
 * @param {{ days?: number, forceRefresh?: boolean }} [options]
 */
export async function getWeatherByCity(city, { days = 5, forceRefresh = false } = {}) {
  const location = await resolveCity(city);
  return getWeatherByLocation(location, { days, forceRefresh });
}

/**
 * Normalised forecast for an already-resolved location. Callers that need both
 * weather and places reuse one geocode lookup by going through this.
 * @param {object} location
 * @param {{ days?: number, forceRefresh?: boolean }} [options]
 */
export async function getWeatherByLocation(location, { days = 5, forceRefresh = false } = {}) {
  if (!location) throw ApiError.badRequest('A resolved location is required');
  const wanted = Math.min(Math.max(Number(days) || 5, 1), MAX_FORECAST_DAYS);

  const key = cacheKey('weather', {
    lat: location.latitude,
    lon: location.longitude,
    days: wanted,
  });

  return wrapWithFallback({
    key,
    ttl: config.cacheTtl.weather,
    forceRefresh,
    resource: `weather for ${location.name}`,
    providers: [
      {
        name: 'openweather',
        // Skip a provider whose daily free-tier budget is already spent rather
        // than burning a request that will 429.
        enabled: Boolean(config.OPENWEATHER_API_KEY) && !isBudgetExhausted('openweather'),
        fetch: () => fetchFromOpenWeather(location, wanted),
      },
      {
        name: 'open-meteo',
        fetch: () => fetchFromOpenMeteo(location, wanted),
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* "Best time to visit" — climate normals from historical observations          */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Monthly climate normals derived from the last few years of observations
 * (Open-Meteo's ERA5 archive — keyless), plus a simple comfort score used to
 * answer "when should I go?".
 *
 * @param {object} location
 * @param {{ years?: number, forceRefresh?: boolean }} [options]
 */
export async function getClimateNormals(location, { years = 3, forceRefresh = false } = {}) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 7); // the archive lags ~5 days
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - Math.min(Math.max(years, 1), 10));

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const key = cacheKey('climate', {
    lat: location.latitude,
    lon: location.longitude,
    startDate,
    endDate,
  });

  return wrapWithFallback({
    key,
    ttl: config.cacheTtl.geocode, // climate normals are extremely stable
    forceRefresh,
    resource: `climate normals for ${location.name}`,
    providers: [
      {
        name: 'open-meteo-archive',
        fetch: async () => {
          const body = await openMeteoArchive.get('/archive', {
            params: {
              latitude: location.latitude,
              longitude: location.longitude,
              start_date: startDate,
              end_date: endDate,
              daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
              timezone: 'UTC',
            },
          });

          const times = body?.daily?.time ?? [];
          if (!times.length) throw ApiError.badGateway('Historical archive returned no data');

          /** @type {Array<{max:number[],min:number[],precip:number[],wet:number,days:number}>} */
          const acc = Array.from({ length: 12 }, () => ({
            max: [],
            min: [],
            precip: [],
            wet: 0,
            days: 0,
          }));

          times.forEach((date, i) => {
            const m = Number(date.slice(5, 7)) - 1;
            if (m < 0 || m > 11) return;
            const bucket = acc[m];
            const mx = body.daily.temperature_2m_max?.[i];
            const mn = body.daily.temperature_2m_min?.[i];
            const pr = body.daily.precipitation_sum?.[i];
            if (Number.isFinite(mx)) bucket.max.push(mx);
            if (Number.isFinite(mn)) bucket.min.push(mn);
            if (Number.isFinite(pr)) {
              bucket.precip.push(pr);
              if (pr >= 1) bucket.wet += 1;
            }
            bucket.days += 1;
          });

          const months = acc.map((bucket, i) => {
            const avgMax = r1(avg(bucket.max));
            const avgMin = r1(avg(bucket.min));
            const mean = avgMax !== null && avgMin !== null ? (avgMax + avgMin) / 2 : null;
            const monthlyPrecip = bucket.days > 0 ? r1((avg(bucket.precip) ?? 0) * 30.4) : null;
            const wetDayShare = bucket.days > 0 ? bucket.wet / bucket.days : null;

            return {
              month: i + 1,
              name: MONTHS[i],
              avgMaxC: avgMax,
              avgMinC: avgMin,
              avgMeanC: r1(mean),
              precipitationMm: monthlyPrecip,
              wetDaysPerMonth: wetDayShare === null ? null : r0(wetDayShare * 30.4),
              comfortScore: comfortScore(mean, wetDayShare),
            };
          });

          const ranked = months
            .filter((m) => m.comfortScore !== null)
            .sort((a, b) => b.comfortScore - a.comfortScore);

          return {
            location: {
              name: location.name,
              latitude: location.latitude,
              longitude: location.longitude,
            },
            period: { startDate, endDate, years },
            months,
            bestMonths: ranked.slice(0, 3).map((m) => ({
              month: m.month,
              name: m.name,
              comfortScore: m.comfortScore,
              avgMaxC: m.avgMaxC,
            })),
            worstMonths: ranked.slice(-2).map((m) => ({
              month: m.month,
              name: m.name,
              comfortScore: m.comfortScore,
            })),
          };
        },
      },
    ],
  });
}

/**
 * 0–100 comfort score: peaks at a 21 °C mean, penalised by rainy days.
 * Intentionally simple and documented rather than a black box.
 */
function comfortScore(meanC, wetDayShare) {
  if (meanC === null || meanC === undefined) return null;
  const idealPenalty = Math.min(Math.abs(meanC - 21) * 3.2, 70);
  const rainPenalty = (wetDayShare ?? 0) * 45;
  return Math.max(0, Math.round(100 - idealPenalty - rainPenalty));
}

export default { getWeatherByCity, getWeatherByLocation, getClimateNormals };
