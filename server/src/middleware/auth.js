import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { extractBearerToken, verifyAuthToken } from '../lib/token.js';
import { isDbReady } from '../config/db.js';
import User from '../models/User.js';

/**
 * Gate for routes that touch MongoDB.
 *
 * TrailMate stays useful without a database — every external-API route works
 * fine — so instead of crashing at boot we fail *these* routes with an honest
 * 503 and a message that says what to do about it.
 */
export function requireDatabase(_req, _res, next) {
  if (!isDbReady()) {
    return next(
      new ApiError(503, 'The database is unavailable, so accounts and saved trips are offline.', {
        code: 'DATABASE_UNAVAILABLE',
        details: 'Check MONGODB_URI and that MongoDB is running.',
      })
    );
  }
  return next();
}

/**
 * Require a valid bearer token and load the account behind it.
 * Attaches `req.user` (a Mongoose document) and `req.userId`.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw ApiError.unauthorized('Sign in to continue', { code: 'NO_TOKEN' });
  }

  const payload = verifyAuthToken(token);

  if (!isDbReady()) {
    throw new ApiError(503, 'The database is unavailable, so your session cannot be verified.', {
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    // Token is cryptographically valid but the account is gone.
    throw ApiError.unauthorized('This account no longer exists', { code: 'ACCOUNT_NOT_FOUND' });
  }

  req.user = user;
  req.userId = user.id;
  return next();
});

/**
 * Populate `req.user` when a token happens to be present, but never reject.
 * Used on public routes that behave slightly differently for signed-in users
 * (for example, showing a "save this trip" affordance).
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token || !isDbReady()) return next();

  try {
    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub);
    if (user) {
      req.user = user;
      req.userId = user.id;
    }
  } catch {
    // A bad token on an optional route is simply ignored.
  }
  return next();
});

export default { requireAuth, optionalAuth, requireDatabase };
