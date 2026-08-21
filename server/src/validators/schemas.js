import { z } from 'zod';
import {
  cityName,
  csvList,
  currencyCode,
  forecastDays,
  isoDate,
  objectId,
  poiLimit,
  radiusM,
  refreshFlag,
  travelStyle,
  travellers,
  tripDays,
} from './common.js';

export const PLAN_SECTIONS = [
  'weather',
  'places',
  'country',
  'photo',
  'currency',
  'budget',
  'packing',
  'ai',
];

export const ACTIVITIES = ['hiking', 'swimming', 'business', 'photography', 'beach', 'skiing'];

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
    message: 'Password must contain at least one letter and one number',
  });

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address').max(160),
    password,
    homeCurrency: currencyCode.optional(),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
    // No complexity rules on login — that would leak policy details to attackers.
    password: z.string().min(1, 'Password is required').max(128),
  }),
};

export const updateProfileSchema = {
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      homeCurrency: currencyCode.optional(),
      preferences: z
        .object({
          theme: z.enum(['light', 'dark', 'system']).optional(),
          temperatureUnit: z.enum(['C', 'F']).optional(),
          distanceUnit: z.enum(['km', 'mi']).optional(),
        })
        .optional(),
    })
    .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' }),
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  }),
};

/* -------------------------------------------------------------------------- */
/* Proxy routes                                                                */
/* -------------------------------------------------------------------------- */

export const citySchema = {
  params: z.object({ city: cityName }),
  query: z.object({ refresh: refreshFlag }),
};

export const weatherSchema = {
  params: z.object({ city: cityName }),
  query: z.object({ days: forecastDays, refresh: refreshFlag }),
};

export const placesSchema = {
  params: z.object({ city: cityName }),
  query: z.object({ radius: radiusM, limit: poiLimit, refresh: refreshFlag }),
};

export const currencySchema = {
  query: z.object({
    from: currencyCode,
    to: currencyCode,
    amount: z.coerce.number().nonnegative().max(1_000_000_000).default(1),
    series: refreshFlag,
    refresh: refreshFlag,
  }),
};

export const countrySchema = {
  params: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Country name or code is required')
      .max(60)
      .regex(/^[\p{L}\p{M}\s'.\-()]+$/u, 'Country contains unsupported characters'),
  }),
  query: z.object({ refresh: refreshFlag }),
};

export const searchSchema = {
  query: z.object({
    q: cityName,
    limit: z.coerce.number().int().min(1).max(10).default(6),
    refresh: refreshFlag,
  }),
};

export const climateSchema = {
  params: z.object({ city: cityName }),
  query: z.object({
    years: z.coerce.number().int().min(1).max(10).default(3),
    refresh: refreshFlag,
  }),
};

/* -------------------------------------------------------------------------- */
/* Trip planning                                                               */
/* -------------------------------------------------------------------------- */

export const planSchema = {
  query: z
    .object({
      city: cityName,
      days: tripDays,
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
      homeCurrency: currencyCode.default('USD'),
      style: travelStyle,
      travellers,
      radius: radiusM,
      limit: poiLimit,
      include: csvList(PLAN_SECTIONS),
      activities: csvList(ACTIVITIES, { max: 6 }),
      refresh: refreshFlag,
    })
    .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    }),
};

export const multiCitySchema = {
  body: z.object({
    cities: z
      .array(cityName)
      .min(2, 'Provide at least two cities')
      .max(8, 'A maximum of 8 stops is supported'),
    nightsPerStop: z.coerce.number().int().min(1).max(30).default(2),
    homeCurrency: currencyCode.default('USD'),
    style: travelStyle,
    travellers,
    refresh: refreshFlag,
  }),
};

export const packingSchema = {
  query: z.object({
    city: cityName,
    days: tripDays,
    homeCurrency: currencyCode.default('USD'),
    homeCountry: z.string().trim().length(2).toUpperCase().optional(),
    activities: csvList(ACTIVITIES, { max: 6 }),
    refresh: refreshFlag,
  }),
};

export const budgetSchema = {
  query: z.object({
    city: cityName,
    days: tripDays,
    travellers,
    style: travelStyle,
    homeCurrency: currencyCode.default('USD'),
    refresh: refreshFlag,
  }),
};

export const aiSummarySchema = {
  body: z.object({
    city: cityName,
    days: tripDays,
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    travellers,
    style: travelStyle,
    homeCurrency: currencyCode.default('USD'),
    refresh: refreshFlag,
  }),
};

/* -------------------------------------------------------------------------- */
/* Trips (persistence)                                                         */
/* -------------------------------------------------------------------------- */

const stopInput = z.object({
  city: cityName,
  arrivalDate: isoDate.optional(),
  departureDate: isoDate.optional(),
  nights: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Note what is *not* here: the weather/places payloads.
 *
 * The client sends only intent (which city, which dates, which style) and the
 * server captures the snapshot itself from its own cache. That keeps a user from
 * writing arbitrary blobs into the database, guarantees every stored snapshot
 * matches our normalised schema, and costs nothing — the data was just fetched
 * for the dashboard the user is looking at.
 */
export const createTripSchema = {
  body: z
    .object({
      city: cityName,
      title: z.string().trim().min(1).max(140).optional(),
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
      days: tripDays.optional(),
      notes: z.string().trim().max(5000).default(''),
      tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
      travellers,
      style: travelStyle,
      homeCurrency: currencyCode.default('USD'),
      activities: csvList(ACTIVITIES, { max: 6 }),
      stops: z.array(stopInput).max(7).default([]),
      refresh: refreshFlag,
    })
    .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    }),
};

export const updateTripSchema = {
  params: z.object({ id: objectId }),
  body: z
    .object({
      title: z.string().trim().min(1).max(140).optional(),
      startDate: isoDate.nullable().optional(),
      endDate: isoDate.nullable().optional(),
      notes: z.string().trim().max(5000).optional(),
      tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
      packingList: z
        .array(
          z.object({
            item: z.string().trim().min(1).max(120),
            category: z.string().trim().max(40).default('general'),
            reason: z.string().trim().max(200).default(''),
            essential: z.boolean().default(false),
            packed: z.boolean().default(false),
          })
        )
        .max(200)
        .optional(),
    })
    .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' }),
};

export const tripIdSchema = {
  params: z.object({ id: objectId }),
};

export const listTripsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    sort: z.enum(['newest', 'oldest', 'startDate', 'title']).default('newest'),
    q: z.string().trim().max(80).optional(),
  }),
};

export const shareTokenSchema = {
  params: z.object({
    token: z
      .string()
      .trim()
      .min(16, 'Invalid share link')
      .max(64, 'Invalid share link')
      .regex(/^[A-Za-z0-9_-]+$/, 'Invalid share link'),
  }),
};

export const refreshTripSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ include: csvList(PLAN_SECTIONS).optional() }).default({}),
};

export default {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  citySchema,
  weatherSchema,
  placesSchema,
  currencySchema,
  countrySchema,
  searchSchema,
  climateSchema,
  planSchema,
  multiCitySchema,
  packingSchema,
  budgetSchema,
  aiSummarySchema,
  createTripSchema,
  updateTripSchema,
  tripIdSchema,
  listTripsSchema,
  shareTokenSchema,
  refreshTripSchema,
  PLAN_SECTIONS,
  ACTIVITIES,
};
