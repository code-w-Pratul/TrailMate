import { z } from 'zod';

/**
 * Reusable primitives.
 *
 * Query strings are always strings, so anything numeric or boolean is coerced
 * here rather than in twenty controllers. Every bound is deliberate: caps on
 * `limit` and `days` exist so a crafted request cannot turn one API call into
 * fifty upstream calls.
 */

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid 24-character id');

export const cityName = z
  .string()
  .trim()
  .min(1, 'City is required')
  .max(80, 'City name is too long')
  // Letters (incl. accents), spaces, and the punctuation that appears in real
  // place names: Saint-Étienne, Coeur d'Alene, Washington, D.C.
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'’.\-,()]*$/u, 'City contains unsupported characters');

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO currency code');

export const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf()), 'Not a real date');

export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);

export const forecastDays = z.coerce.number().int().min(1).max(7).default(5);
export const tripDays = z.coerce.number().int().min(1).max(60).default(5);
export const travellers = z.coerce.number().int().min(1).max(20).default(1);
export const radiusM = z.coerce.number().int().min(500).max(50_000).default(5000);
export const poiLimit = z.coerce.number().int().min(1).max(50).default(20);

export const travelStyle = z
  .enum(['backpacker', 'budget', 'midrange', 'comfort', 'luxury'])
  .default('midrange');

/** `?refresh=true` bypasses a fresh cache entry. */
export const refreshFlag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1');

/**
 * Accepts either `?include=weather,places` or `?include=weather&include=places`
 * and normalises both to a string array.
 */
export const csvList = (allowed, { max = 20 } = {}) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return undefined;
      const parts = (Array.isArray(value) ? value : value.split(','))
        .flatMap((v) => String(v).split(','))
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      return [...new Set(parts)].slice(0, max);
    })
    .refine(
      (list) => !list || !allowed || list.every((item) => allowed.includes(item)),
      (list) => ({
        message: `Allowed values: ${allowed?.join(', ')}. Received: ${list?.join(', ')}`,
      })
    );

/** A date range where the end may not precede the start. */
export const dateRange = (shape) =>
  z
    .object(shape)
    .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    });

export default {
  objectId,
  cityName,
  currencyCode,
  isoDate,
  forecastDays,
  tripDays,
  travellers,
  radiusM,
  poiLimit,
  travelStyle,
  refreshFlag,
  csvList,
};
