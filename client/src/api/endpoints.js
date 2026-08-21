import { request, requestData } from './client.js';

/**
 * Typed-ish wrappers for every API route, in one place.
 *
 * Keeping URL strings out of components means a route rename is a one-file
 * change, and it gives React Query a natural place to hang stable query keys
 * off (see `keys` at the bottom).
 */

/* -------------------------------------------------------------------------- */
/* Meta                                                                       */
/* -------------------------------------------------------------------------- */

export const getHealth = () => requestData({ url: '/health' });
export const getServerConfig = () => requestData({ url: '/meta/config' });
export const getApiUsage = () => requestData({ url: '/meta/usage' });

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export const register = (payload) =>
  requestData({ url: '/auth/register', method: 'POST', data: payload });
export const login = (payload) =>
  requestData({ url: '/auth/login', method: 'POST', data: payload });
export const getMe = () => requestData({ url: '/auth/me' });
export const updateProfile = (payload) =>
  requestData({ url: '/auth/me', method: 'PATCH', data: payload });
export const changePassword = (payload) =>
  requestData({ url: '/auth/change-password', method: 'POST', data: payload });

/* -------------------------------------------------------------------------- */
/* Discovery & individual data sources                                        */
/* -------------------------------------------------------------------------- */

export const searchDestinations = (q, limit = 6) =>
  requestData({ url: '/search', params: { q, limit } });

export const getWeather = (city, days = 5) =>
  request({ url: `/weather/${encodeURIComponent(city)}`, params: { days } });
export const getPlaces = (city, params = {}) =>
  request({ url: `/places/${encodeURIComponent(city)}`, params });
export const getCountry = (name) => request({ url: `/country/${encodeURIComponent(name)}` });
export const getPhoto = (city) => request({ url: `/photo/${encodeURIComponent(city)}` });
export const getClimate = (city, years = 3) =>
  request({ url: `/climate/${encodeURIComponent(city)}`, params: { years } });

export const convertCurrency = ({ from, to, amount = 1, series = false }) =>
  request({ url: '/currency', params: { from, to, amount, series } });
export const getCurrencyList = () => requestData({ url: '/currency/list' });
export const getCountryList = () => requestData({ url: '/country' });

/* -------------------------------------------------------------------------- */
/* Composite planning                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The dashboard's single call. Returns `{ data, meta }` where `data.sections`
 * is a map of independently-successful-or-failed cards.
 */
export const getPlan = (params) => request({ url: '/plan', params });

export const getMultiCityItinerary = (payload) =>
  requestData({ url: '/plan/multi-city', method: 'POST', data: payload });

export const getPackingList = (params) => requestData({ url: '/packing', params });
export const getBudget = (params) => requestData({ url: '/budget', params });
export const getBudgetStyles = () => requestData({ url: '/budget/styles' });
export const generateAiSummary = (payload) =>
  request({ url: '/ai/summary', method: 'POST', data: payload });

/* -------------------------------------------------------------------------- */
/* Trips                                                                      */
/* -------------------------------------------------------------------------- */

export const listTrips = (params = {}) => request({ url: '/trips', params });
export const createTrip = (payload) =>
  requestData({ url: '/trips', method: 'POST', data: payload });
export const getTrip = (id) => request({ url: `/trips/${id}` });
export const updateTrip = (id, payload) =>
  requestData({ url: `/trips/${id}`, method: 'PATCH', data: payload });
export const deleteTrip = (id) => requestData({ url: `/trips/${id}`, method: 'DELETE' });
export const refreshTrip = (id, include) =>
  requestData({ url: `/trips/${id}/refresh`, method: 'POST', data: include ? { include } : {} });

export const shareTrip = (id) => requestData({ url: `/trips/${id}/share`, method: 'POST' });
export const unshareTrip = (id) => requestData({ url: `/trips/${id}/share`, method: 'DELETE' });
export const getSharedTrip = (token) => request({ url: `/share/${token}` });

/* -------------------------------------------------------------------------- */
/* React Query keys                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Centralised key factory. Hierarchical so a broad invalidation
 * (`queryClient.invalidateQueries({ queryKey: keys.trips.all })`) sweeps every
 * related query without hunting for string literals.
 */
export const keys = {
  config: ['config'],
  usage: ['usage'],
  me: ['me'],
  search: (q) => ['search', q],
  plan: (params) => ['plan', params],
  climate: (city, years) => ['climate', city, years],
  currency: (params) => ['currency', params],
  currencyList: ['currency', 'list'],
  packing: (params) => ['packing', params],
  budget: (params) => ['budget', params],
  multiCity: (payload) => ['multi-city', payload],
  trips: {
    all: ['trips'],
    list: (params) => ['trips', 'list', params],
    detail: (id) => ['trips', 'detail', id],
  },
  shared: (token) => ['shared', token],
};

export default {
  getHealth,
  getServerConfig,
  getApiUsage,
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  searchDestinations,
  getWeather,
  getPlaces,
  getCountry,
  getPhoto,
  getClimate,
  convertCurrency,
  getCurrencyList,
  getCountryList,
  getPlan,
  getMultiCityItinerary,
  getPackingList,
  getBudget,
  getBudgetStyles,
  generateAiSummary,
  listTrips,
  createTrip,
  getTrip,
  updateTrip,
  deleteTrip,
  refreshTrip,
  shareTrip,
  unshareTrip,
  getSharedTrip,
  keys,
};
