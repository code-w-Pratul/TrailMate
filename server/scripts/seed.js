/**
 * Development seed.
 *
 * Creates a demo account and a few saved trips so a fresh clone has something
 * to look at without clicking through the UI first. Trips are built through the
 * real planning pipeline, so the snapshots are genuine normalised payloads — not
 * hand-written fixtures that could drift from the schema.
 *
 * Usage:  npm run seed --workspace server
 *         npm run seed --workspace server -- --reset
 */
import mongoose from 'mongoose';
import config from '../src/config/env.js';
import logger from '../src/lib/logger.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { closeCache } from '../src/cache/index.js';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import { buildTripPlan } from '../src/services/planService.js';

const DEMO = {
  name: 'Demo Traveller',
  email: 'demo@trailmate.dev',
  password: 'trailmate123',
  homeCurrency: 'USD',
};

const CITIES = [
  { city: 'Kyoto', days: 5, style: 'midrange', activities: ['photography'] },
  { city: 'Lisbon', days: 4, style: 'budget', activities: ['beach'] },
  { city: 'Reykjavik', days: 6, style: 'comfort', activities: ['hiking'] },
];

const reset = process.argv.includes('--reset');

/** Dates a couple of weeks out, so the forecast window overlaps the trip. */
function upcomingRange(days) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 14);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days - 1);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

async function main() {
  if (config.isProduction) {
    throw new Error('Refusing to seed a production database.');
  }

  const connected = await connectDb();
  if (!connected || mongoose.connection.readyState !== 1) {
    throw new Error(`Could not connect to MongoDB at ${config.MONGODB_URI}`);
  }

  /* Mongoose creates missing indexes but never *changes* an existing one, so a
     database created against an older schema keeps the stale definition and
     fails in confusing ways. `syncIndexes()` drops and rebuilds to match the
     current schema — cheap here, and it makes the seed idempotent across
     schema changes. */
  await Promise.all([User.syncIndexes(), Trip.syncIndexes()]);
  logger.info('Indexes synchronised with the current schemas');

  if (reset) {
    logger.info('Resetting demo data');
    const existing = await User.findOne({ email: DEMO.email });
    if (existing) {
      await Trip.deleteMany({ userId: existing._id });
      await existing.deleteOne();
    }
  }

  let user = await User.findOne({ email: DEMO.email });
  if (user) {
    logger.info('Demo user already exists — reusing it', { email: DEMO.email });
  } else {
    user = await User.register(DEMO);
    logger.info('Created demo user', { email: DEMO.email, password: DEMO.password });
  }

  let created = 0;
  let skipped = 0;

  for (const target of CITIES) {
    const { startDate, endDate } = upcomingRange(target.days);

    const alreadyThere = await Trip.findOne({
      userId: user._id,
      'destination.name': new RegExp(`^${target.city}$`, 'i'),
    });
    if (alreadyThere) {
      skipped += 1;
      logger.info(`Trip to ${target.city} already saved — skipping`);
      continue;
    }

    logger.info(`Building a trip plan for ${target.city}…`);
    let plan;
    try {
      plan = await buildTripPlan({
        city: target.city,
        days: target.days,
        startDate,
        endDate,
        style: target.style,
        activities: target.activities,
        homeCurrency: user.homeCurrency,
      });
    } catch (error) {
      logger.warn(`Skipping ${target.city}: ${error.message}`);
      continue;
    }

    const { location, sections } = plan;
    const photo = sections.photo?.ok ? sections.photo.data : null;

    const trip = await Trip.create({
      userId: user._id,
      title: `${location.name} — ${target.style} trip`,
      destination: {
        name: location.name,
        label: location.label,
        country: location.country,
        countryCode: location.countryCode,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone,
      },
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      notes: `Seeded demo trip. Weather via ${sections.weather?.meta?.provider ?? 'n/a'}, places via ${sections.places?.meta?.provider ?? 'n/a'}.`,
      tags: ['demo', target.style],
      coverPhoto: photo
        ? {
            url: photo.url,
            thumbUrl: photo.thumbUrl,
            alt: photo.alt,
            provider: photo.provider,
            credit: photo.credit,
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
    });

    // Share the first trip so the public /share/:token page is demoable too.
    if (created === 0) {
      trip.enableSharing();
      await trip.save();
      logger.info(`Shared link for ${location.name}: /share/${trip.share.token}`);
    }

    created += 1;
    logger.info(`Saved trip to ${location.name}`, {
      sections: Object.entries(sections)
        .filter(([, s]) => s.ok)
        .map(([name]) => name)
        .join(','),
    });
  }

  logger.info('Seed complete', {
    user: DEMO.email,
    password: DEMO.password,
    tripsCreated: created,
    tripsSkipped: skipped,
  });
}

main()
  .then(async () => {
    await Promise.allSettled([disconnectDb(), closeCache()]);
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Seed failed', { message: error.message });
    await Promise.allSettled([disconnectDb(), closeCache()]);
    process.exit(1);
  });
