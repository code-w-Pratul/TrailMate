import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { sendCreated, sendData, sendNoContent, sendPage } from '../lib/respond.js';
import { estimateTravel } from '../lib/geo.js';
import Trip from '../models/Trip.js';
import { buildTripPlan } from '../services/planService.js';
import { resolveCity } from '../services/geocodeService.js';

/**
 * Saved trips.
 *
 * The snapshot is captured server-side (see `createTripSchema` for the
 * reasoning). Because the dashboard the user is looking at has already warmed
 * the cache for this city, "Save trip" almost always resolves from cache and
 * spends zero API credits.
 */

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  startDate: { startDate: 1, createdAt: -1 },
  title: { title: 1 },
};

/** Fields excluded from list responses — snapshots are large and unused there. */
const LIST_PROJECTION =
  '-snapshot.weather -snapshot.places -snapshot.country -snapshot.currency -snapshot.aiSummary -snapshot.budget -packingList';

/** Load a trip and assert ownership in one step. */
async function findOwnedTrip(id, userId) {
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('Trip not found');
  if (String(trip.userId) !== String(userId)) {
    // 404 rather than 403: a stranger should not learn that this id exists.
    throw ApiError.notFound('Trip not found');
  }
  return trip;
}

/** Turn `{ city, nights, … }` stop inputs into geocoded, costed legs. */
async function buildStops(stopInputs, primaryDestination) {
  if (!stopInputs?.length) return [];

  const stops = [];
  let previous = primaryDestination;

  for (const [index, input] of stopInputs.entries()) {
    const location = await resolveCity(input.city);
    const destination = {
      name: location.name,
      label: location.label,
      country: location.country,
      countryCode: location.countryCode,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
    };

    stops.push({
      order: index + 1,
      destination,
      arrivalDate: input.arrivalDate ? new Date(input.arrivalDate) : null,
      departureDate: input.departureDate ? new Date(input.departureDate) : null,
      nights: input.nights ?? null,
      notes: input.notes ?? '',
      travelFromPrevious: estimateTravel(previous, destination) ?? undefined,
    });
    previous = destination;
  }

  return stops;
}

/* -------------------------------------------------------------------------- */
/* CRUD                                                                        */
/* -------------------------------------------------------------------------- */

/** GET /api/trips */
export const listTrips = asyncHandler(async (req, res) => {
  const { page, limit, sort, q } = req.valid.query;

  const filter = { userId: req.userId };
  if (q) {
    // Anchored, escaped regex: a prefix match that can still use the index and
    // cannot be turned into a ReDoS payload.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: new RegExp(safe, 'i') },
      { 'destination.name': new RegExp(safe, 'i') },
      { 'destination.country': new RegExp(safe, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    Trip.find(filter)
      .select(LIST_PROJECTION)
      .sort(SORTS[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Trip.countDocuments(filter),
  ]);

  /* `.lean()` skips document hydration — a meaningful win on a list endpoint,
     but it also skips virtuals, so the two the UI needs are derived here. */
  const shaped = items.map(({ _id, __v, ...item }) => ({
    ...item,
    id: String(_id),
    durationDays: durationDaysOf(item.startDate, item.endDate),
    isMultiCity: Boolean(item.stops?.length),
    isShared: Boolean(item.share?.enabled),
    share: undefined,
    shareToken: item.share?.enabled ? item.share.token : null,
  }));

  return sendPage(res, shaped, { page, limit, total });
});

function durationDaysOf(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** POST /api/trips */
export const createTrip = asyncHandler(async (req, res) => {
  const b = req.valid.body;

  const days =
    b.days ??
    (b.startDate && b.endDate
      ? Math.round((new Date(b.endDate) - new Date(b.startDate)) / 86_400_000) + 1
      : 5);

  /* Capture the snapshot from our own services — usually straight from cache. */
  const plan = await buildTripPlan({
    city: b.city,
    days,
    startDate: b.startDate ?? null,
    endDate: b.endDate ?? null,
    homeCurrency: b.homeCurrency ?? req.user.homeCurrency,
    style: b.style,
    travellers: b.travellers,
    activities: b.activities ?? [],
    forceRefresh: b.refresh,
  });

  const { location, sections } = plan;
  const destination = {
    name: location.name,
    label: location.label,
    country: location.country,
    countryCode: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone,
  };

  const photo = sections.photo?.ok ? sections.photo.data : null;

  const trip = await Trip.create({
    userId: req.userId,
    title: b.title?.trim() || defaultTitle(location, b),
    destination,
    startDate: b.startDate ? new Date(b.startDate) : null,
    endDate: b.endDate ? new Date(b.endDate) : null,
    notes: b.notes ?? '',
    tags: b.tags ?? [],
    coverPhoto: photo
      ? {
          url: photo.url,
          thumbUrl: photo.thumbUrl,
          alt: photo.alt,
          provider: photo.provider,
          credit: photo.credit ?? undefined,
        }
      : undefined,
    snapshot: {
      capturedAt: new Date(),
      weather: sections.weather?.ok ? sections.weather.data : null,
      places: sections.places?.ok ? sections.places.data : null,
      country: sections.country?.ok ? sections.country.data : null,
      currency: sections.currency?.ok ? sections.currency.data : null,
      aiSummary: sections.ai?.ok ? sections.ai.data : null,
      budget: sections.budget?.ok ? sections.budget.data : null,
    },
    packingList: sections.packing?.ok ? sections.packing.data.items : [],
    stops: await buildStops(b.stops, destination),
  });

  return sendCreated(res, trip.toJSON(), {
    location: `/api/trips/${trip.id}`,
    meta: { capturedSections: Object.keys(sections).filter((k) => sections[k].ok) },
  });
});

function defaultTitle(location, body) {
  const where = location.name ?? 'Trip';
  if (body.startDate) {
    const month = new Date(`${body.startDate}T00:00:00Z`).toLocaleString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${where}, ${month}`;
  }
  return `${where} trip`;
}

/** GET /api/trips/:id */
export const getTrip = asyncHandler(async (req, res) => {
  const trip = await findOwnedTrip(req.valid.params.id, req.userId);
  return sendData(res, trip.toJSON(), {
    snapshotAgeDays: snapshotAgeDays(trip),
    stale: snapshotAgeDays(trip) !== null && snapshotAgeDays(trip) > 3,
  });
});

const snapshotAgeDays = (trip) => {
  const capturedAt = trip.snapshot?.capturedAt;
  if (!capturedAt) return null;
  return Math.round((Date.now() - new Date(capturedAt).getTime()) / 86_400_000);
};

/** PATCH /api/trips/:id */
export const updateTrip = asyncHandler(async (req, res) => {
  const trip = await findOwnedTrip(req.valid.params.id, req.userId);
  const b = req.valid.body;

  if (b.title !== undefined) trip.title = b.title;
  if (b.notes !== undefined) trip.notes = b.notes;
  if (b.tags !== undefined) trip.tags = b.tags;
  if (b.startDate !== undefined) trip.startDate = b.startDate ? new Date(b.startDate) : null;
  if (b.endDate !== undefined) trip.endDate = b.endDate ? new Date(b.endDate) : null;
  if (b.packingList !== undefined) trip.packingList = b.packingList;

  await trip.save();
  return sendData(res, trip.toJSON());
});

/** DELETE /api/trips/:id */
export const deleteTrip = asyncHandler(async (req, res) => {
  const trip = await findOwnedTrip(req.valid.params.id, req.userId);
  await trip.deleteOne();
  return sendNoContent(res);
});

/** POST /api/trips/:id/refresh — re-capture the snapshot for an existing trip. */
export const refreshTrip = asyncHandler(async (req, res) => {
  const trip = await findOwnedTrip(req.valid.params.id, req.userId);
  const include = req.valid.body?.include;

  const plan = await buildTripPlan({
    city: trip.destination.name,
    days: trip.durationDays ?? 5,
    startDate: trip.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: trip.endDate?.toISOString().slice(0, 10) ?? null,
    homeCurrency: req.user.homeCurrency,
    include,
    forceRefresh: true,
  });

  const s = plan.sections;
  trip.snapshot = {
    capturedAt: new Date(),
    weather: s.weather?.ok ? s.weather.data : (trip.snapshot?.weather ?? null),
    places: s.places?.ok ? s.places.data : (trip.snapshot?.places ?? null),
    country: s.country?.ok ? s.country.data : (trip.snapshot?.country ?? null),
    currency: s.currency?.ok ? s.currency.data : (trip.snapshot?.currency ?? null),
    aiSummary: s.ai?.ok ? s.ai.data : (trip.snapshot?.aiSummary ?? null),
    budget: s.budget?.ok ? s.budget.data : (trip.snapshot?.budget ?? null),
  };

  /* Packing state is user-owned: keep the checkboxes they already ticked. */
  if (s.packing?.ok) {
    const packedItems = new Set(
      trip.packingList.filter((i) => i.packed).map((i) => i.item.toLowerCase())
    );
    trip.packingList = s.packing.data.items.map((item) => ({
      ...item,
      packed: packedItems.has(item.item.toLowerCase()),
    }));
  }

  await trip.save();
  return sendData(res, trip.toJSON(), { refreshed: plan.health });
});

/* -------------------------------------------------------------------------- */
/* Sharing                                                                     */
/* -------------------------------------------------------------------------- */

/** POST /api/trips/:id/share */
export const shareTrip = asyncHandler(async (req, res) => {
  const trip = await findOwnedTrip(req.valid.params.id, req.userId);
  const token = trip.enableSharing();
  await trip.save();

  return sendData(res, {
    enabled: true,
    token,
    path: `/share/${token}`,
    apiPath: `/api/share/${token}`,
    createdAt: trip.share.createdAt,
    views: trip.share.views,
  });
});

/** DELETE /api/trips/:id/share */
export const unshareTrip = asyncHandler(async (req, res) => {
  const trip = await findOwnedTrip(req.valid.params.id, req.userId);
  trip.disableSharing();
  await trip.save();
  return sendData(res, { enabled: false });
});

/**
 * GET /api/share/:token — public, unauthenticated, read-only.
 *
 * Serves `toPublicJSON()`, which strips `userId` and the share record itself, so
 * a link reveals the itinerary and nothing about the account behind it. The view
 * counter is bumped without blocking the response.
 */
export const getSharedTrip = asyncHandler(async (req, res) => {
  const { token } = req.valid.params;

  const trip = await Trip.findOne({ 'share.token': token, 'share.enabled': true });
  if (!trip) {
    throw ApiError.notFound('This share link is invalid or has been turned off');
  }

  Trip.updateOne({ _id: trip._id }, { $inc: { 'share.views': 1 } }).catch(() => {});

  return sendData(res, trip.toPublicJSON(), {
    readOnly: true,
    snapshotAgeDays: snapshotAgeDays(trip),
  });
});

export default {
  listTrips,
  createTrip,
  getTrip,
  updateTrip,
  deleteTrip,
  refreshTrip,
  shareTrip,
  unshareTrip,
  getSharedTrip,
};
