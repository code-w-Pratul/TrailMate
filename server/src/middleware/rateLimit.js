import rateLimit from 'express-rate-limit';
import config from '../config/env.js';
import ApiError from '../lib/ApiError.js';

/**
 * Rate limiting for *our* API.
 *
 * Two layers, because the threats are different:
 *  - a broad limit stops one client exhausting our upstream free tiers
 *  - a tight limit on auth routes makes credential stuffing impractical
 *  - a separate limit on AI routes, which are the slowest and most expensive
 *
 * All of them route rejections through `ApiError` so a 429 has the same body
 * shape as every other error.
 */

const handler = (message, code) => (req, _res, next) => {
  next(ApiError.tooManyRequests(message, { code }));
};

const shared = {
  standardHeaders: 'draft-7', // RateLimit-* headers
  legacyHeaders: false,
  // Skip limiting in tests so a fast suite cannot trip the limiter.
  skip: () => config.isTest,
};

/** Baseline limit applied to the whole /api surface. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.RATE_LIMIT_MAX,
  handler: handler('Too many requests. Please slow down and try again shortly.', 'RATE_LIMITED'),
});

/** Register / login / password change. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.AUTH_RATE_LIMIT_MAX,
  // Count only failures so a legitimate user with a working password is never
  // locked out by their own successful logins.
  skipSuccessfulRequests: true,
  handler: handler(
    'Too many authentication attempts. Try again in a few minutes.',
    'AUTH_RATE_LIMITED'
  ),
});

/** LLM calls: slow, and the easiest way to burn someone else's quota. */
export const aiLimiter = rateLimit({
  ...shared,
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.AI_RATE_LIMIT_MAX,
  handler: handler(
    'AI briefing requests are limited. Please wait a moment before generating another.',
    'AI_RATE_LIMITED'
  ),
});

/** Writes that create documents. */
export const writeLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 30,
  handler: handler(
    'Too many changes in a short period. Please retry shortly.',
    'WRITE_RATE_LIMITED'
  ),
});

export default { apiLimiter, authLimiter, aiLimiter, writeLimiter };
