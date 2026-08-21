import logger from '../lib/logger.js';
import ApiError from '../lib/ApiError.js';
import { estimateTravel } from '../lib/geo.js';
import { resolveCity } from './geocodeService.js';
import { getWeatherByLocation } from './weatherService.js';
import { getPlacesByLocation } from './placesService.js';
import { getCountry } from './countryService.js';
import { getCoverPhoto } from './photoService.js';
import { convertCurrency } from './currencyService.js';
import { estimateBudget } from './budgetService.js';
import { generatePackingList } from './packingService.js';
import { generateTripSummary } from './aiService.js';

/**
 * Dashboard aggregator.
 *
 * The frontend could fire six requests, but then it owns the fan-out, the
 * partial-failure logic and six spinners' worth of race conditions. Instead one
 * call returns one document made of independent *sections*.
 *
 * The contract that makes this safe: **a section can fail without failing the
 * response**. Every section is `{ ok, data, meta, error }`, resolved with
 * `Promise.allSettled`, so an Overpass timeout greys out the places card while
 * weather, currency and country render normally. The route only errors when the
 * destination itself cannot be resolved — the one failure that makes the rest
 * meaningless.
 */

const SECTIONS = ['weather', 'places', 'country', 'photo', 'currency', 'budget', 'packing', 'ai'];

/** Wrap a service result in the section envelope. */
function ok(result, extra = {}) {
  return {
    ok: true,
    data: result.data ?? result,
    meta: result.meta ?? null,
    error: null,
    ...extra,
  };
}

function fail(error, label) {
  const status = error?.status ?? 500;
  logger.warn(`plan section "${label}" failed`, { status, message: error?.message });
  return {
    ok: false,
    data: null,
    meta: null,
    error: {
      code: error?.code ?? 'SECTION_ERROR',
      message:
        status >= 500
          ? `${label} is temporarily unavailable. Try again in a moment.`
          : (error?.message ?? `Could not load ${label}`),
      status,
      retryable: status >= 500 || status === 429,
    },
  };
}

/** allSettled → section envelope. */
const settle = (settled, label) =>
  settled.status === 'fulfilled' ? ok(settled.value) : fail(settled.reason, label);

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} params
 * @param {string} params.city
 * @param {number} [params.days]
 * @param {string} [params.homeCurrency]
 * @param {string} [params.style]        budget travel style
 * @param {number} [params.travellers]
 * @param {number} [params.radiusM]
 * @param {number} [params.limit]        POIs per group
 * @param {string[]} [params.include]    subset of SECTIONS; defaults to all
 * @param {string[]} [params.activities] feeds the packing engine
 * @param {string}  [params.startDate]
 * @param {string}  [params.endDate]
 * @param {boolean} [params.forceRefresh]
 */
export async function buildTripPlan({
  city,
  days = 5,
  homeCurrency = 'USD',
  style = 'midrange',
  travellers = 1,
  radiusM = 5000,
  limit = 20,
  include,
  activities = [],
  startDate = null,
  endDate = null,
  forceRefresh = false,
} = {}) {
  const wanted = new Set(
    Array.isArray(include) && include.length
      ? include.filter((s) => SECTIONS.includes(s))
      : SECTIONS
  );

  /* Step 1 — resolve the destination. This one *must* succeed: without
     coordinates there is nothing to build a dashboard from. */
  const location = await resolveCity(city, { forceRefresh });
  if (!location) throw ApiError.notFound(`Could not resolve "${city}"`);

  const tripDays = deriveDays({ startDate, endDate, fallback: days });

  /* Step 2 — everything that only needs coordinates, in parallel. */
  const [weatherR, placesR, countryR, photoR] = await Promise.allSettled([
    wanted.has('weather')
      ? getWeatherByLocation(location, { days: Math.min(tripDays, 7), forceRefresh })
      : skip(),
    wanted.has('places') ? getPlacesByLocation(location, { radiusM, limit, forceRefresh }) : skip(),
    wanted.has('country') && (location.country || location.countryCode)
      ? getCountry(location.countryCode || location.country, { forceRefresh })
      : skip(),
    wanted.has('photo') ? getCoverPhoto(location.label ?? location.name, { forceRefresh }) : skip(),
  ]);

  const sections = {
    weather: wanted.has('weather') ? settle(weatherR, 'Weather') : null,
    places: wanted.has('places') ? settle(placesR, 'Places') : null,
    country: wanted.has('country') ? settle(countryR, 'Country info') : null,
    photo: wanted.has('photo') ? settle(photoR, 'Cover photo') : null,
  };

  const weather = sections.weather?.ok ? sections.weather.data : null;
  const places = sections.places?.ok ? sections.places.data : null;
  const country = sections.country?.ok ? sections.country.data : null;
  const destinationCurrency = country?.primaryCurrency?.code ?? null;

  /* Step 3 — sections that depend on step 2, again in parallel. */
  const [currencyR, budgetR] = await Promise.allSettled([
    wanted.has('currency') && destinationCurrency
      ? convertCurrency({
          from: homeCurrency,
          to: destinationCurrency,
          amount: 100,
          includeSeries: true,
          forceRefresh,
        })
      : skip(),
    wanted.has('budget')
      ? estimateBudget({
          location,
          country,
          days: tripDays,
          travellers,
          style,
          homeCurrency,
        }).then((data) => ({ data, meta: null }))
      : skip(),
  ]);

  if (wanted.has('currency')) {
    sections.currency = destinationCurrency
      ? settle(currencyR, 'Currency')
      : {
          ok: false,
          data: null,
          meta: null,
          error: {
            code: 'CURRENCY_UNKNOWN',
            message: 'The destination currency could not be determined.',
            status: 404,
            retryable: false,
          },
        };
  }
  if (wanted.has('budget')) sections.budget = settle(budgetR, 'Budget estimate');

  /* Step 4 — derived, local-only sections. These cannot fail on the network. */
  if (wanted.has('packing')) {
    try {
      sections.packing = ok({
        data: generatePackingList({
          weather,
          country,
          places,
          days: tripDays,
          homeCurrency,
          activities,
        }),
      });
    } catch (error) {
      sections.packing = fail(error, 'Packing list');
    }
  }

  /* Step 5 — the AI briefing, last because it consumes everything above. */
  if (wanted.has('ai')) {
    try {
      sections.ai = ok(
        await generateTripSummary(
          {
            location,
            weather,
            places,
            country,
            budget: sections.budget?.ok ? sections.budget.data : null,
            trip: { days: tripDays, travellers, startDate, endDate },
          },
          { forceRefresh }
        )
      );
    } catch (error) {
      sections.ai = fail(error, 'AI briefing');
    }
  }

  /* Drop sections the caller excluded. */
  for (const key of Object.keys(sections)) {
    if (sections[key] === null) delete sections[key];
  }

  const degraded = Object.entries(sections)
    .filter(([, section]) => !section.ok || section.meta?.degraded)
    .map(([name]) => name);

  return {
    location,
    trip: { days: tripDays, travellers, style, homeCurrency, startDate, endDate },
    sections,
    health: {
      requested: [...wanted],
      failed: Object.entries(sections)
        .filter(([, s]) => !s.ok)
        .map(([name]) => name),
      degraded,
      allOk: degraded.length === 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Placeholder for a skipped section so index alignment stays obvious. */
const skip = () => Promise.resolve({ data: null, meta: null });

function deriveDays({ startDate, endDate, fallback }) {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf()) && end >= start) {
      return Math.min(Math.max(Math.round((end - start) / 86_400_000) + 1, 1), 60);
    }
  }
  return Math.min(Math.max(Math.round(Number(fallback) || 5), 1), 60);
}

/* -------------------------------------------------------------------------- */
/* Multi-city itineraries                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Chain several cities into one itinerary, with an estimated hop between each.
 *
 * Weather and places are fetched per stop with the same partial-failure
 * tolerance; a broken middle stop does not sink the itinerary.
 *
 * @param {object} params
 * @param {string[]} params.cities in visit order
 * @param {number} [params.nightsPerStop]
 * @param {string} [params.homeCurrency]
 * @param {boolean} [params.forceRefresh]
 */
export async function buildMultiCityItinerary({
  cities,
  nightsPerStop = 2,
  homeCurrency = 'USD',
  style = 'midrange',
  travellers = 1,
  forceRefresh = false,
}) {
  if (!Array.isArray(cities) || cities.length < 2) {
    throw ApiError.badRequest('A multi-city itinerary needs at least two cities');
  }
  if (cities.length > 8) {
    throw ApiError.badRequest('A maximum of 8 stops is supported');
  }

  const nights = Math.min(Math.max(Math.round(Number(nightsPerStop) || 2), 1), 30);

  const settled = await Promise.allSettled(
    cities.map((city) =>
      buildTripPlan({
        city,
        days: nights,
        homeCurrency,
        style,
        travellers,
        forceRefresh,
        include: ['weather', 'places', 'country', 'photo', 'budget'],
      })
    )
  );

  const stops = [];
  const failures = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      stops.push({ order: stops.length, requested: cities[index], ...result.value });
    } else {
      failures.push({
        requested: cities[index],
        message: result.reason?.message ?? 'Could not resolve this stop',
      });
    }
  });

  if (stops.length < 2) {
    throw ApiError.badRequest('At least two stops must resolve to build an itinerary', {
      details: failures,
    });
  }

  /* Hops between consecutive resolved stops. */
  const legs = [];
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1].location;
    const to = stops[i].location;
    const travel = estimateTravel(from, to);
    legs.push({ from: from.name, to: to.name, ...travel });
    stops[i].travelFromPrevious = travel;
  }

  const totalBudgetUsd = stops.reduce(
    (sum, stop) => sum + (stop.sections?.budget?.data?.total?.usd ?? 0),
    0
  );

  return {
    stops,
    legs,
    totals: {
      cities: stops.length,
      nights: nights * stops.length,
      travelMinutes: legs.reduce((s, l) => s + (l.durationMinutes ?? 0), 0),
      travelKm: Math.round(legs.reduce((s, l) => s + (l.estimatedRouteKm ?? 0), 0)),
      estimatedBudgetUsd: Math.round(totalBudgetUsd),
    },
    unresolved: failures,
    generatedAt: new Date().toISOString(),
  };
}

export default { buildTripPlan, buildMultiCityItinerary, SECTIONS };
