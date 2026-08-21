import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Trip from '../../src/models/Trip.js';

/**
 * Test database bootstrap, with a deliberate fallback chain.
 *
 * `mongodb-memory-server` is ideal — a throwaway in-process mongod — but it
 * downloads a binary on first use, which fails on an offline machine or a
 * locked-down CI runner. Rather than let that turn into a red build on someone
 * else's laptop, this tries several strategies in order and reports honestly:
 *
 *   0. `MONGODB_TEST_URI` if provided (CI points this at a service container)
 *   1. an in-memory mongod
 *   2. a local mongod on the default port, using a clearly-named scratch database
 *   3. nothing — the caller skips its suite with a printed reason
 *
 * The scratch database name is namespaced and dropped afterwards so a developer's
 * real `trailmate` data is never touched.
 */

const SCRATCH_URI = 'mongodb://127.0.0.1:27017/trailmate_test_scratch';

/**
 * Build indexes before the first write.
 *
 * Mongoose creates indexes in the background, so without waiting a test can
 * insert before a unique index exists — and a constraint test would pass for
 * entirely the wrong reason. `syncIndexes` also drops stale definitions, which
 * matters when a schema's index has changed.
 */
async function prepareIndexes() {
  await Promise.all([User.syncIndexes(), Trip.syncIndexes()]);
}

async function finish(kind, stop) {
  await prepareIndexes();
  return { ok: true, kind, stop };
}

export async function startTestDb() {
  /* Attempt 0: an explicitly provided database.
     CI sets MONGODB_TEST_URI to a service container, which skips the
     mongodb-memory-server binary download entirely — faster and hermetic. */
  if (process.env.MONGODB_TEST_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_TEST_URI, { serverSelectionTimeoutMS: 5000 });
      return finish('provided-uri', async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      });
    } catch (error) {
      // Fall through to the other strategies rather than failing outright.
      console.warn(`MONGODB_TEST_URI unreachable (${error.message}); trying alternatives.`);
    }
  }

  /* Attempt 1: in-memory server. */
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri(), { dbName: 'trailmate_test' });
    return finish('memory-server', async () => {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await server.stop();
    });
  } catch (memoryError) {
    /* Attempt 2: a real local mongod. */
    try {
      await mongoose.connect(SCRATCH_URI, { serverSelectionTimeoutMS: 2500 });
      return finish('local-mongod', async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      });
    } catch (localError) {
      return {
        ok: false,
        kind: 'none',
        reason: `in-memory mongod unavailable (${memoryError.message}); local mongod unavailable (${localError.message})`,
        async stop() {},
      };
    }
  }
}

/**
 * Empty every collection between tests without paying for a reconnect.
 * Documents are deleted rather than collections dropped, so the indexes built
 * by `prepareIndexes` survive for the whole run.
 */
export async function clearCollections() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export default { startTestDb, clearCollections };
