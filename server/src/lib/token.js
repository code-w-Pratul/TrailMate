import jwt from 'jsonwebtoken';
import config from '../config/env.js';

/**
 * JWT helpers.
 *
 * The payload is intentionally minimal — a subject id and nothing else. Roles,
 * names and preferences all change, and a token is a cache we cannot
 * invalidate, so anything mutable is loaded fresh from the database on each
 * request instead of being trusted from the token.
 */

const ISSUER = 'trailmate';

/**
 * @param {{ id: string }} user
 * @returns {{ token: string, expiresIn: string }}
 */
export function signAuthToken(user) {
  const token = jwt.sign({ sub: String(user.id ?? user._id) }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: ISSUER,
  });
  return { token, expiresIn: config.JWT_EXPIRES_IN };
}

/**
 * Verify and decode. Throws `jsonwebtoken` errors, which the central error
 * handler maps to 401 TOKEN_EXPIRED / INVALID_TOKEN.
 * @param {string} token
 */
export function verifyAuthToken(token) {
  return jwt.verify(token, config.JWT_SECRET, { issuer: ISSUER });
}

/** Pull a bearer token out of the Authorization header. */
export function extractBearerToken(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

export default { signAuthToken, verifyAuthToken, extractBearerToken };
