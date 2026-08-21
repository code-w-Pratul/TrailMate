import mongoose from 'mongoose';
import config from './env.js';
import logger from '../lib/logger.js';

mongoose.set('strictQuery', true);

/**
 * Connection states mapped to something human readable, surfaced by
 * `GET /api/health` so ops tooling can distinguish "API is up but the database
 * is unreachable" from "API is down".
 */
const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialised'];

export function dbStatus() {
  return {
    state: STATES[mongoose.connection.readyState] ?? 'unknown',
    ready: mongoose.connection.readyState === 1,
    name: mongoose.connection.name ?? null,
  };
}

export function isDbReady() {
  return mongoose.connection.readyState === 1;
}

let listenersBound = false;

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected', { db: mongoose.connection.name });
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — persistence routes will degrade');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { message: err.message });
  });
}

/**
 * Connect to MongoDB.
 *
 * Resolves `true` on success. On failure it resolves `false` in development so
 * the read-only proxy routes (weather, places, currency, …) remain usable
 * without a database — but rejects in production, where a missing database is
 * a genuine deployment failure.
 *
 * @param {string} [uri]
 */
export async function connectDb(uri = config.MONGODB_URI) {
  bindListeners();

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 10,
      autoIndex: !config.isProduction,
    });
    return true;
  } catch (error) {
    logger.error('Failed to connect to MongoDB', { uri: redactUri(uri), message: error.message });

    if (config.isProduction) throw error;

    logger.warn(
      'Continuing without a database. Auth and trip persistence will return 503; ' +
        'all external-API routes still work.'
    );
    return false;
  }
}

export async function disconnectDb() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
}

/** Strips credentials before a URI ever reaches a log line. */
function redactUri(uri) {
  return String(uri).replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

export default { connectDb, disconnectDb, dbStatus, isDbReady };
