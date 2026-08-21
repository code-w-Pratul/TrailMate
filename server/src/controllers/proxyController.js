import asyncHandler from '../lib/asyncHandler.js';
import { sendData } from '../lib/respond.js';
import { resolveCity, searchCities } from '../services/geocodeService.js';
import { getWeatherByLocation, getClimateNormals } from '../services/weatherService.js';
import { getPlacesByLocation } from '../services/placesService.js';
import { convertCurrency, getSupportedCurrencies } from '../services/currencyService.js';
import { getCountry, listCountries } from '../services/countryService.js';
import { getCoverPhoto } from '../services/photoService.js';

/**
 * Thin controllers over the services layer.
 *
 * These exist so the frontend never holds an API key and never talks to a
 * third party directly: the browser calls TrailMate, TrailMate calls the world.
 * That is what makes caching, quota accounting and provider fallback possible
 * at all — none of which can be enforced from a client bundle.
 *
 * Each handler stays boring on purpose. Validation happened in middleware,
 * normalisation happened in the service; all that is left is to unwrap
 * `{ data, meta }` onto the response.
 */

/** GET /api/search?q= */
export const searchDestinations = asyncHandler(async (req, res) => {
  const { q, limit, refresh } = req.valid.query;
  const { data, meta } = await searchCities(q, { limit, forceRefresh: refresh });
  return sendData(res, data, meta);
});

/** GET /api/weather/:city */
export const getWeather = asyncHandler(async (req, res) => {
  const { city } = req.valid.params;
  const { days, refresh } = req.valid.query;

  const location = await resolveCity(city, { forceRefresh: refresh });
  const { data, meta } = await getWeatherByLocation(location, { days, forceRefresh: refresh });
  return sendData(res, data, meta);
});

/** GET /api/places/:city */
export const getPlaces = asyncHandler(async (req, res) => {
  const { city } = req.valid.params;
  const { radius, limit, refresh } = req.valid.query;

  const location = await resolveCity(city, { forceRefresh: refresh });
  const { data, meta } = await getPlacesByLocation(location, {
    radiusM: radius,
    limit,
    forceRefresh: refresh,
  });
  return sendData(res, data, meta);
});

/** GET /api/currency?from=USD&to=INR&amount=100 */
export const getCurrency = asyncHandler(async (req, res) => {
  const { from, to, amount, series, refresh } = req.valid.query;
  const { data, meta } = await convertCurrency({
    from,
    to,
    amount,
    includeSeries: series,
    forceRefresh: refresh,
  });
  return sendData(res, data, meta);
});

/** GET /api/currency/list */
export const listCurrencies = asyncHandler(async (req, res) => {
  const { data, meta } = await getSupportedCurrencies();
  return sendData(res, data, meta);
});

/** GET /api/country/:name */
export const getCountryInfo = asyncHandler(async (req, res) => {
  const { name } = req.valid.params;
  const { refresh } = req.valid.query;
  const { data, meta } = await getCountry(name, { forceRefresh: refresh });
  return sendData(res, data, meta);
});

/** GET /api/country — every country, trimmed for pickers. */
export const getCountryList = asyncHandler(async (_req, res) => {
  const { data, meta } = await listCountries();
  return sendData(res, data, meta);
});

/** GET /api/photo/:city */
export const getPhoto = asyncHandler(async (req, res) => {
  const { city } = req.valid.params;
  const { refresh } = req.valid.query;
  const { data, meta } = await getCoverPhoto(city, { forceRefresh: refresh });
  return sendData(res, data, meta);
});

/** GET /api/climate/:city — "best time to visit" data. */
export const getClimate = asyncHandler(async (req, res) => {
  const { city } = req.valid.params;
  const { years, refresh } = req.valid.query;

  const location = await resolveCity(city, { forceRefresh: refresh });
  const { data, meta } = await getClimateNormals(location, { years, forceRefresh: refresh });
  return sendData(res, data, meta);
});

export default {
  searchDestinations,
  getWeather,
  getPlaces,
  getCurrency,
  listCurrencies,
  getCountryInfo,
  getCountryList,
  getPhoto,
  getClimate,
};
