import { Router } from 'express';
import validate from '../middleware/validate.js';
import { requireAuth, requireDatabase, optionalAuth } from '../middleware/auth.js';
import { authLimiter, aiLimiter, writeLimiter } from '../middleware/rateLimit.js';
import * as schemas from '../validators/schemas.js';

import * as meta from '../controllers/metaController.js';
import * as auth from '../controllers/authController.js';
import * as proxy from '../controllers/proxyController.js';
import * as plan from '../controllers/planController.js';
import * as trips from '../controllers/tripController.js';

/**
 * Route table.
 *
 * Kept in one file on purpose: with ~25 routes, a single readable map of the
 * whole API surface is worth more than a dozen tiny router modules. Each line
 * reads as method → path → middleware chain → controller.
 */
const router = Router();

/* -------------------------------------------------------------------------- */
/* Health & meta                                                               */
/* -------------------------------------------------------------------------- */

router.get('/health', meta.health);
router.get('/health/live', meta.live);
router.get('/health/ready', meta.ready);
router.get('/meta/usage', meta.usage);
router.get('/meta/config', meta.publicConfig);

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

/* Middleware order is deliberate: validate *before* requireDatabase. Input
   validation is free and local, so a malformed request should always get a
   precise 400 — even while the database is down. Checking availability first
   would mask real client errors behind a 503. */
router.post(
  '/auth/register',
  authLimiter,
  validate(schemas.registerSchema),
  requireDatabase,
  auth.register
);
router.post('/auth/login', authLimiter, validate(schemas.loginSchema), requireDatabase, auth.login);
router.get('/auth/me', requireAuth, auth.me);
router.patch('/auth/me', requireAuth, validate(schemas.updateProfileSchema), auth.updateProfile);
router.post(
  '/auth/change-password',
  authLimiter,
  validate(schemas.changePasswordSchema),
  requireAuth,
  auth.changePassword
);

/* -------------------------------------------------------------------------- */
/* External API proxies                                                        */
/* -------------------------------------------------------------------------- */

router.get('/search', validate(schemas.searchSchema), proxy.searchDestinations);
router.get('/weather/:city', validate(schemas.weatherSchema), proxy.getWeather);
router.get('/places/:city', validate(schemas.placesSchema), proxy.getPlaces);
router.get('/currency/list', proxy.listCurrencies);
router.get('/currency', validate(schemas.currencySchema), proxy.getCurrency);
router.get('/country', proxy.getCountryList);
router.get('/country/:name', validate(schemas.countrySchema), proxy.getCountryInfo);
router.get('/photo/:city', validate(schemas.citySchema), proxy.getPhoto);
router.get('/climate/:city', validate(schemas.climateSchema), proxy.getClimate);

/* -------------------------------------------------------------------------- */
/* Composite planning                                                          */
/* -------------------------------------------------------------------------- */

router.get('/plan', optionalAuth, validate(schemas.planSchema), plan.getPlan);
router.post(
  '/plan/multi-city',
  optionalAuth,
  validate(schemas.multiCitySchema),
  plan.postMultiCity
);
router.get('/packing', validate(schemas.packingSchema), plan.getPacking);
router.get('/budget/styles', plan.getBudgetStyles);
router.get('/budget', validate(schemas.budgetSchema), plan.getBudget);
router.post('/ai/summary', aiLimiter, validate(schemas.aiSummarySchema), plan.postAiSummary);

/* -------------------------------------------------------------------------- */
/* Trips (authenticated)                                                       */
/* -------------------------------------------------------------------------- */

router.get('/trips', requireAuth, validate(schemas.listTripsSchema), trips.listTrips);
router.post(
  '/trips',
  writeLimiter,
  requireAuth,
  validate(schemas.createTripSchema),
  trips.createTrip
);
router.get('/trips/:id', requireAuth, validate(schemas.tripIdSchema), trips.getTrip);
router.patch('/trips/:id', requireAuth, validate(schemas.updateTripSchema), trips.updateTrip);
router.delete('/trips/:id', requireAuth, validate(schemas.tripIdSchema), trips.deleteTrip);
router.post(
  '/trips/:id/refresh',
  writeLimiter,
  requireAuth,
  validate(schemas.refreshTripSchema),
  trips.refreshTrip
);
router.post('/trips/:id/share', requireAuth, validate(schemas.tripIdSchema), trips.shareTrip);
router.delete('/trips/:id/share', requireAuth, validate(schemas.tripIdSchema), trips.unshareTrip);

/* Public read-only share link — deliberately outside requireAuth. */
router.get('/share/:token', validate(schemas.shareTokenSchema), trips.getSharedTrip);

export default router;
