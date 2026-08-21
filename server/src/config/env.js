import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import logger from '../lib/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..', '..');

// `quiet` suppresses dotenv v17's startup banner — our own logger reports the
// resolved configuration in a single, structured line instead.
dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true });

/* -------------------------------------------------------------------------- */
/* Coercion helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `.env` files in the wild routinely carry trailing comments
 * (`CACHE_TTL_WEATHER=1800   # 30 min`). Rather than depend on the parser's
 * comment handling, we normalise every value ourselves.
 */
const clean = (value) => {
  if (typeof value !== 'string') return value;
  const withoutComment = value.replace(/\s+#.*$/, '').trim();
  const unquoted = withoutComment.replace(/^["'](.*)["']$/s, '$1');
  return unquoted;
};

const str = (fallback) =>
  z.preprocess((v) => {
    const c = clean(v);
    return c === undefined || c === '' ? fallback : c;
  }, z.string());

/** Optional secret: empty string and whitespace both normalise to undefined. */
const optionalStr = z.preprocess((v) => {
  const c = clean(v);
  return c === '' || c === undefined ? undefined : c;
}, z.string().optional());

const int = (fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z.preprocess((v) => {
    const c = clean(v);
    if (c === undefined || c === '') return fallback;
    const n = Number(c);
    return Number.isFinite(n) ? n : c;
  }, z.number().int().min(min).max(max));

const csv = (fallback) =>
  z.preprocess((v) => {
    const c = clean(v);
    const raw = c === undefined || c === '' ? fallback : c;
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, z.array(z.string()));

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

const DEV_JWT_FALLBACK = 'trailmate-development-only-secret-do-not-use-in-production';

const schema = z.object({
  NODE_ENV: str('development').pipe(z.enum(['development', 'test', 'production'])),
  PORT: int(5000, { min: 1, max: 65535 }),
  CORS_ORIGIN: csv('http://localhost:5173,http://localhost:4173'),

  MONGODB_URI: str('mongodb://127.0.0.1:27017/trailmate'),

  JWT_SECRET: str(DEV_JWT_FALLBACK),
  JWT_EXPIRES_IN: str('7d'),

  REDIS_URL: optionalStr,
  CACHE_TTL_WEATHER: int(1800, { min: 0 }),
  CACHE_TTL_PLACES: int(3600, { min: 0 }),
  CACHE_TTL_CURRENCY: int(1800, { min: 0 }),
  CACHE_TTL_COUNTRY: int(86_400, { min: 0 }),
  CACHE_TTL_PHOTO: int(86_400, { min: 0 }),
  CACHE_TTL_GEOCODE: int(604_800, { min: 0 }),
  CACHE_TTL_AI: int(3600, { min: 0 }),
  CACHE_STALE_GRACE: int(604_800, { min: 0 }),
  CACHE_MAX_ENTRIES: int(1000, { min: 16 }),

  UPSTREAM_TIMEOUT_MS: int(5000, { min: 250, max: 60_000 }),
  UPSTREAM_RETRIES: int(1, { min: 0, max: 5 }),

  RATE_LIMIT_WINDOW_MS: int(900_000, { min: 1000 }),
  RATE_LIMIT_MAX: int(300, { min: 1 }),
  AUTH_RATE_LIMIT_MAX: int(20, { min: 1 }),
  AI_RATE_LIMIT_MAX: int(30, { min: 1 }),

  OPENWEATHER_API_KEY: optionalStr,
  GEOAPIFY_API_KEY: optionalStr,
  UNSPLASH_ACCESS_KEY: optionalStr,

  AI_PROVIDER: str('auto').pipe(z.enum(['auto', 'groq', 'gemini', 'ollama', 'rules'])),
  GROQ_API_KEY: optionalStr,
  GROQ_MODEL: str('llama-3.3-70b-versatile'),
  GEMINI_API_KEY: optionalStr,
  GEMINI_MODEL: str('gemini-1.5-flash'),
  OLLAMA_BASE_URL: optionalStr,
  OLLAMA_MODEL: str('llama3.1'),

  QUOTA_OPENWEATHER: int(1000, { min: 1 }),
  QUOTA_GEOAPIFY: int(3000, { min: 1 }),
  QUOTA_UNSPLASH: int(50, { min: 1 }),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  logger.error(`Invalid environment configuration:\n${issues}`);
  throw new Error('Environment validation failed — see log above.');
}

const value = parsed.data;

/* -------------------------------------------------------------------------- */
/* Production hardening                                                        */
/* -------------------------------------------------------------------------- */

const isProduction = value.NODE_ENV === 'production';
const isTest = value.NODE_ENV === 'test';

if (isProduction) {
  const problems = [];
  if (value.JWT_SECRET === DEV_JWT_FALLBACK) {
    problems.push('JWT_SECRET is still the development fallback.');
  }
  if (value.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters.');
  }
  if (problems.length) {
    problems.forEach((p) => logger.error(p));
    throw new Error('Refusing to start in production with an insecure configuration.');
  }
} else if (value.JWT_SECRET === DEV_JWT_FALLBACK && !isTest) {
  logger.warn('JWT_SECRET not set — using an insecure development fallback.');
}

/* -------------------------------------------------------------------------- */
/* Derived, ready-to-consume config                                            */
/* -------------------------------------------------------------------------- */

/** Which upstream provider each data source will actually use. */
const providers = {
  weather: value.OPENWEATHER_API_KEY ? 'openweather' : 'open-meteo',
  // Keyless places come from Wikipedia (sights) plus Nominatim (food);
  // Overpass remains in the chain as a last resort but is never the headline.
  places: value.GEOAPIFY_API_KEY ? 'geoapify' : 'wikipedia+osm',
  photo: value.UNSPLASH_ACCESS_KEY ? 'unsplash' : 'picsum',
  currency: 'frankfurter',
  country: 'restcountries-dataset',
  geocode: 'open-meteo',
};

function resolveAiProvider() {
  if (value.AI_PROVIDER !== 'auto') return value.AI_PROVIDER;
  if (value.GROQ_API_KEY) return 'groq';
  if (value.GEMINI_API_KEY) return 'gemini';
  if (value.OLLAMA_BASE_URL) return 'ollama';
  return 'rules';
}

export const config = Object.freeze({
  ...value,
  isProduction,
  isTest,
  isDevelopment: value.NODE_ENV === 'development',
  serverRoot,
  providers: Object.freeze(providers),
  ai: Object.freeze({
    provider: resolveAiProvider(),
    groqModel: value.GROQ_MODEL,
    geminiModel: value.GEMINI_MODEL,
    ollamaModel: value.OLLAMA_MODEL,
    ollamaBaseUrl: value.OLLAMA_BASE_URL,
  }),
  cacheTtl: Object.freeze({
    weather: value.CACHE_TTL_WEATHER,
    places: value.CACHE_TTL_PLACES,
    currency: value.CACHE_TTL_CURRENCY,
    country: value.CACHE_TTL_COUNTRY,
    photo: value.CACHE_TTL_PHOTO,
    geocode: value.CACHE_TTL_GEOCODE,
    ai: value.CACHE_TTL_AI,
  }),
  quotas: Object.freeze({
    openweather: value.QUOTA_OPENWEATHER,
    geoapify: value.QUOTA_GEOAPIFY,
    unsplash: value.QUOTA_UNSPLASH,
  }),
});

export default config;
