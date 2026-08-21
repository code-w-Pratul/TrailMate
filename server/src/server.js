import config from './config/env.js';
import logger from './lib/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { closeCache } from './cache/index.js';
import { createApp } from './app.js';

/**
 * Process bootstrap.
 *
 * Responsibilities kept separate from `app.js`: connect the database, start
 * listening, and shut down cleanly. Nothing here is imported by tests.
 */

async function start() {
  const dbReady = await connectDb();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`TrailMate API listening on http://localhost:${config.PORT}`, {
      env: config.NODE_ENV,
      database: dbReady ? 'connected' : 'unavailable (degraded mode)',
      cache: config.REDIS_URL ? 'redis' : 'memory',
      weather: config.providers.weather,
      places: config.providers.places,
      photos: config.providers.photo,
      ai: config.ai.provider,
    });

    if (!config.OPENWEATHER_API_KEY && !config.GEOAPIFY_API_KEY) {
      logger.info(
        'Running entirely on keyless providers (Open-Meteo, OpenStreetMap, Frankfurter, ' +
          'REST Countries). Add API keys to server/.env to upgrade any source.'
      );
    }
  });

  // Slightly above a typical 60s load-balancer idle timeout, so the balancer
  // closes connections rather than us cutting them mid-response.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  return server;
}

/* -------------------------------------------------------------------------- */
/* Graceful shutdown                                                           */
/* -------------------------------------------------------------------------- */

let shuttingDown = false;

function attachShutdown(server) {
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);

    // Stop accepting new connections, then drain.
    server.close(async () => {
      try {
        await Promise.allSettled([disconnectDb(), closeCache()]);
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { message: error.message });
        process.exit(1);
      }
    });

    // Do not hang forever on a stuck connection.
    setTimeout(() => {
      logger.error('Forced exit after 10s shutdown timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack?.split('\n').slice(0, 5) : undefined,
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception — exiting', { message: error.message, stack: error.stack });
    // An uncaught exception leaves the process in an unknown state; restart is
    // the only safe response. Process managers and orchestrators handle that.
    process.exit(1);
  });
}

start()
  .then(attachShutdown)
  .catch((error) => {
    logger.error('Failed to start TrailMate API', { message: error.message, stack: error.stack });
    process.exit(1);
  });
