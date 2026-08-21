import asyncHandler from '../lib/asyncHandler.js';
import { sendData } from '../lib/respond.js';
import { buildTripPlan, buildMultiCityItinerary } from '../services/planService.js';
import { resolveCity } from '../services/geocodeService.js';
import { getWeatherByLocation } from '../services/weatherService.js';
import { getPlacesByLocation } from '../services/placesService.js';
import { getCountry } from '../services/countryService.js';
import { estimateBudget, TRAVEL_STYLES } from '../services/budgetService.js';
import { generatePackingList } from '../services/packingService.js';
import { generateTripSummary } from '../services/aiService.js';

/**
 * Composite endpoints — one request, one dashboard.
 *
 * `GET /api/plan` is what the frontend actually loads. Everything else here is
 * a narrower slice of the same machinery, exposed separately so the individual
 * widgets (packing list, budget slider, AI regenerate button) can refresh in
 * isolation without re-fetching the whole page.
 */

/** GET /api/plan?city=Tokyo&days=5 */
export const getPlan = asyncHandler(async (req, res) => {
  const q = req.valid.query;

  const plan = await buildTripPlan({
    city: q.city,
    days: q.days,
    startDate: q.startDate ?? null,
    endDate: q.endDate ?? null,
    homeCurrency: q.homeCurrency ?? req.user?.homeCurrency ?? 'USD',
    style: q.style,
    travellers: q.travellers,
    radiusM: q.radius,
    limit: q.limit,
    include: q.include,
    activities: q.activities ?? [],
    forceRefresh: q.refresh,
  });

  // 207 signals "it worked, but not all of it" — the client renders what it got
  // and greys out the rest. Cheap honesty at the protocol level.
  const status = plan.health.failed.length ? 207 : 200;
  return sendData(res, plan, { partial: status === 207, ...plan.health }, { status });
});

/** POST /api/plan/multi-city */
export const postMultiCity = asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const itinerary = await buildMultiCityItinerary({
    cities: b.cities,
    nightsPerStop: b.nightsPerStop,
    homeCurrency: b.homeCurrency ?? req.user?.homeCurrency ?? 'USD',
    style: b.style,
    travellers: b.travellers,
    forceRefresh: b.refresh,
  });
  return sendData(res, itinerary);
});

/** GET /api/packing?city=Oslo&days=6 */
export const getPacking = asyncHandler(async (req, res) => {
  const q = req.valid.query;

  const location = await resolveCity(q.city, { forceRefresh: q.refresh });
  const [weather, places, country] = await Promise.all([
    getWeatherByLocation(location, { days: Math.min(q.days, 7), forceRefresh: q.refresh })
      .then((r) => r.data)
      .catch(() => null),
    getPlacesByLocation(location, { forceRefresh: q.refresh })
      .then((r) => r.data)
      .catch(() => null),
    location.countryCode || location.country
      ? getCountry(location.countryCode || location.country, { forceRefresh: q.refresh })
          .then((r) => r.data)
          .catch(() => null)
      : null,
  ]);

  const list = generatePackingList({
    weather,
    places,
    country,
    days: q.days,
    homeCurrency: q.homeCurrency,
    homeCountryCode: q.homeCountry ?? null,
    activities: q.activities ?? [],
  });

  return sendData(
    res,
    { location, ...list },
    { sourcesUsed: { weather: !!weather, places: !!places, country: !!country } }
  );
});

/** GET /api/budget?city=Lisbon&days=7&style=budget */
export const getBudget = asyncHandler(async (req, res) => {
  const q = req.valid.query;

  const location = await resolveCity(q.city, { forceRefresh: q.refresh });
  const country =
    location.countryCode || location.country
      ? await getCountry(location.countryCode || location.country)
          .then((r) => r.data)
          .catch(() => null)
      : null;

  const estimate = await estimateBudget({
    location,
    country,
    days: q.days,
    travellers: q.travellers,
    style: q.style,
    homeCurrency: q.homeCurrency,
  });

  return sendData(res, { location, ...estimate });
});

/** GET /api/budget/styles — drives the style selector in the UI. */
export const getBudgetStyles = asyncHandler(async (_req, res) =>
  sendData(
    res,
    Object.entries(TRAVEL_STYLES).map(([key, value]) => ({ key, ...value }))
  )
);

/** POST /api/ai/summary */
export const postAiSummary = asyncHandler(async (req, res) => {
  const b = req.valid.body;

  const location = await resolveCity(b.city);
  const [weather, places, country] = await Promise.all([
    getWeatherByLocation(location, { days: Math.min(b.days, 7) })
      .then((r) => r.data)
      .catch(() => null),
    getPlacesByLocation(location)
      .then((r) => r.data)
      .catch(() => null),
    location.countryCode || location.country
      ? getCountry(location.countryCode || location.country)
          .then((r) => r.data)
          .catch(() => null)
      : null,
  ]);

  const budget = await estimateBudget({
    location,
    country,
    days: b.days,
    travellers: b.travellers,
    style: b.style,
    homeCurrency: b.homeCurrency,
  }).catch(() => null);

  const { data, meta } = await generateTripSummary(
    {
      location,
      weather,
      places,
      country,
      budget,
      trip: {
        days: b.days,
        travellers: b.travellers,
        startDate: b.startDate ?? null,
        endDate: b.endDate ?? null,
      },
    },
    { forceRefresh: b.refresh }
  );

  return sendData(res, { location, ...data }, meta);
});

export default {
  getPlan,
  postMultiCity,
  getPacking,
  getBudget,
  getBudgetStyles,
  postAiSummary,
};
