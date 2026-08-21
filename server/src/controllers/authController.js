import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { sendCreated, sendData } from '../lib/respond.js';
import { signAuthToken } from '../lib/token.js';
import User from '../models/User.js';
import Trip from '../models/Trip.js';

/** Shape returned to the client after any successful credential exchange. */
const authPayload = (user) => {
  const { token, expiresIn } = signAuthToken(user);
  return { user: user.toJSON(), token, expiresIn };
};

/**
 * A real bcrypt hash of a random throwaway string, computed once on first use.
 *
 * When login is attempted with an unknown email there is no hash to compare
 * against, so a naive implementation returns immediately while a wrong password
 * on a *real* account takes ~300 ms. That difference is enough to enumerate
 * registered emails. Comparing against this decoy makes both paths cost the
 * same.
 */
let decoyHash = null;
const getDecoyHash = () => {
  decoyHash ??= bcrypt.hashSync(randomBytes(24).toString('hex'), 12);
  return decoyHash;
};

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, homeCurrency } = req.valid.body;

  const existing = await User.exists({ email });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists', {
      code: 'EMAIL_IN_USE',
      details: [{ field: 'email', message: 'Already registered' }],
    });
  }

  const user = await User.register({ name, email, password, homeCurrency });
  user.lastLoginAt = new Date();
  await user.save();

  return sendCreated(res, authPayload(user));
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.valid.body;

  // `passwordHash` is `select: false`, so it must be requested explicitly.
  const user = await User.findOne({ email }).select('+passwordHash');

  /* One response for both "no such user" and "wrong password", and one cost. */
  const valid = user
    ? await user.verifyPassword(password)
    : await bcrypt.compare(password, getDecoyHash());

  if (!user || !valid) {
    throw ApiError.unauthorized('Email or password is incorrect', { code: 'INVALID_CREDENTIALS' });
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return sendData(res, authPayload(user));
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  const tripCount = await Trip.countDocuments({ userId: req.userId });
  return sendData(res, {
    user: req.user.toJSON(),
    stats: { trips: tripCount },
  });
});

/** PATCH /api/auth/me */
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, homeCurrency, preferences } = req.valid.body;

  if (name !== undefined) req.user.name = name;
  if (homeCurrency !== undefined) req.user.homeCurrency = homeCurrency;
  if (preferences) {
    req.user.preferences = { ...req.user.preferences.toObject?.(), ...preferences };
  }

  await req.user.save();
  return sendData(res, { user: req.user.toJSON() });
});

/** POST /api/auth/change-password */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;

  const user = await User.findById(req.userId).select('+passwordHash');
  if (!user || !(await user.verifyPassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect', {
      code: 'INVALID_CREDENTIALS',
      details: [{ field: 'currentPassword', message: 'Incorrect' }],
    });
  }

  user.passwordHash = newPassword; // re-hashed by the pre-save hook
  await user.save();

  // Issuing a fresh token keeps the current device signed in after the change.
  return sendData(res, { ...authPayload(user), message: 'Password updated' });
});

export default { register, login, me, updateProfile, changePassword };
