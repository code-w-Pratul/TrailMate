import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

/**
 * A saved trip.
 *
 * Deliberate design choice: a trip stores a **snapshot**, not a live query.
 * When the user hits "Save trip" we persist the weather, places, country and
 * currency payloads exactly as they were rendered, plus `capturedAt`. Reopening
 * a trip from six months ago therefore shows what was planned, and the UI can
 * offer an explicit "refresh" instead of silently rewriting history — and a
 * shared link keeps working without spending API credits for every viewer.
 */

const pointSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    label: { type: String, trim: true, maxlength: 200 },
    country: { type: String, trim: true, maxlength: 80 },
    countryCode: { type: String, trim: true, maxlength: 3 },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    timezone: { type: String, trim: true, maxlength: 64 },
  },
  { _id: false }
);

/** One leg of a multi-city itinerary. */
const stopSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true, min: 0 },
    destination: { type: pointSchema, required: true },
    arrivalDate: { type: Date, default: null },
    departureDate: { type: Date, default: null },
    nights: { type: Number, min: 0, max: 365, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    /** Estimated hop from the previous stop — produced by lib/geo.estimateTravel. */
    travelFromPrevious: {
      mode: String,
      modeLabel: String,
      straightLineKm: Number,
      estimatedRouteKm: Number,
      durationMinutes: Number,
      durationLabel: String,
    },
  },
  { _id: false }
);

const packingItemSchema = new mongoose.Schema(
  {
    item: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, trim: true, maxlength: 40, default: 'general' },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
    essential: { type: Boolean, default: false },
    packed: { type: Boolean, default: false },
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    destination: { type: pointSchema, required: true },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 5000, default: '' },
    tags: { type: [String], default: [] },

    coverPhoto: {
      url: String,
      thumbUrl: String,
      alt: String,
      provider: String,
      credit: {
        name: String,
        profileUrl: String,
        photoUrl: String,
        sourceName: String,
        sourceUrl: String,
      },
    },

    /* Frozen payloads, stored in our normalised shapes. Mixed because these are
       read back verbatim and never queried field-by-field. */
    snapshot: {
      capturedAt: { type: Date, default: Date.now },
      weather: { type: mongoose.Schema.Types.Mixed, default: null },
      places: { type: mongoose.Schema.Types.Mixed, default: null },
      country: { type: mongoose.Schema.Types.Mixed, default: null },
      currency: { type: mongoose.Schema.Types.Mixed, default: null },
      aiSummary: { type: mongoose.Schema.Types.Mixed, default: null },
      budget: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    packingList: { type: [packingItemSchema], default: [] },

    /** Extra legs. The primary `destination` is always stop 0 conceptually. */
    stops: { type: [stopSchema], default: [] },

    share: {
      enabled: { type: Boolean, default: false },
      /* Deliberately no `default: null` — see the index note below. An unshared
         trip must not carry this key at all. */
      token: { type: String },
      createdAt: { type: Date, default: null },
      views: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* Newest-first listing per user is the single hottest query. */
tripSchema.index({ userId: 1, createdAt: -1 });

/**
 * Unique share tokens — as a **partial** index, not a sparse one.
 *
 * This is a trap worth documenting. A sparse unique index only skips documents
 * where the field is *absent*; a field explicitly set to `null` still occupies
 * the index. So with `token: { default: null }` the first unshared trip inserts
 * fine and the second fails with:
 *
 *   E11000 duplicate key error ... index: share.token_1 dup key: { share.token: null }
 *
 * A partial index keyed on `$type: 'string'` indexes only trips that actually
 * have a token, which is what "unique among shared trips" really means. The
 * `default: null` above was also removed so the key is absent until sharing is
 * switched on.
 */
tripSchema.index(
  { 'share.token': 1 },
  { unique: true, partialFilterExpression: { 'share.token': { $type: 'string' } } }
);

tripSchema.index({ userId: 1, title: 'text' });

/** Inclusive night count, or null when the trip has no dates yet. */
tripSchema.virtual('durationDays').get(function durationDays() {
  if (!this.startDate || !this.endDate) return null;
  const ms = this.endDate.getTime() - this.startDate.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
});

tripSchema.virtual('isMultiCity').get(function isMultiCity() {
  return Array.isArray(this.stops) && this.stops.length > 0;
});

/** Every city in itinerary order — handy for map bounds and AI prompts. */
tripSchema.virtual('itinerary').get(function itinerary() {
  const legs = [{ order: 0, destination: this.destination }];
  for (const stop of [...(this.stops ?? [])].sort((a, b) => a.order - b.order)) {
    legs.push(stop);
  }
  return legs;
});

tripSchema.pre('validate', function validateDates(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date must be on or after the start date');
  }
  return next();
});

/**
 * Enable public sharing and mint a URL-safe token.
 * 24 random bytes → 32 base64url chars: unguessable, but still short enough to
 * paste into a message.
 */
tripSchema.methods.enableSharing = function enableSharing() {
  if (!this.share?.token) {
    this.share = {
      enabled: true,
      token: randomBytes(24).toString('base64url'),
      createdAt: new Date(),
      views: this.share?.views ?? 0,
    };
  } else {
    this.share.enabled = true;
  }
  return this.share.token;
};

tripSchema.methods.disableSharing = function disableSharing() {
  if (!this.share) return;
  this.share.enabled = false;
};

/**
 * Projection served on the public share route: everything needed to render the
 * itinerary, and nothing that identifies the owner.
 */
tripSchema.methods.toPublicJSON = function toPublicJSON() {
  const json = this.toJSON();
  delete json.userId;
  delete json.share;
  return {
    ...json,
    shared: { views: this.share?.views ?? 0, createdAt: this.share?.createdAt ?? null },
  };
};

export const Trip = mongoose.models.Trip ?? mongoose.model('Trip', tripSchema);
export default Trip;
