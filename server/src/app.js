import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import config from './config/env.js';
import logger from './lib/logger.js';
import ApiError from './lib/ApiError.js';
import routes from './routes/index.js';
import requestId from './middleware/requestId.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';

/**
 * Express application factory.
 *
 * Exported without calling `listen()` so Supertest can mount it directly — tests
 * never need a real port, and `server.js` stays a thin bootstrap around it.
 */
export function createApp() {
  const app = express();

  /* Render, Railway, Fly and friends all terminate TLS at a proxy. Without this,
     every client looks like it shares one IP and rate limiting misfires. */
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  /* ---------------------------------------------------------------------- */
  /* Security headers                                                       */
  /* ---------------------------------------------------------------------- */

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              // Map tiles, cover photos and flags are all third-party images.
              imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              connectSrc: ["'self'", 'https:'],
              fontSrc: ["'self'", 'data:'],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      // Allows the SPA to load OSM tiles and Unsplash images cross-origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  /* ---------------------------------------------------------------------- */
  /* CORS                                                                   */
  /* ---------------------------------------------------------------------- */

  const allowed = new Set(config.CORS_ORIGIN);
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: curl, server-to-server, same-origin navigation.
        if (!origin) return callback(null, true);
        if (allowed.has(origin)) return callback(null, true);
        // Any localhost port is fine while developing.
        if (!config.isProduction && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
          return callback(null, true);
        }
        logger.warn('Blocked CORS origin', { origin });
        return callback(
          ApiError.forbidden(`Origin ${origin} is not allowed by CORS`, { code: 'CORS_BLOCKED' })
        );
      },
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'X-Cache', 'Age', 'X-Data-Provider', 'RateLimit-Remaining'],
      maxAge: 86_400,
    })
  );

  /* ---------------------------------------------------------------------- */
  /* Parsing, compression, logging                                          */
  /* ---------------------------------------------------------------------- */

  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(requestId);

  if (!config.isTest) {
    morgan.token('id', (req) => req.id?.slice(0, 8) ?? '-');
    morgan.token('cache', (_req, res) => res.getHeader('X-Cache') ?? '-');
    app.use(
      morgan(':id :method :url :status :cache :response-time ms', {
        stream: { write: (line) => logger.info(line.trim()) },
        skip: (req) => req.path === '/api/health/live',
      })
    );
  }

  /* ---------------------------------------------------------------------- */
  /* API                                                                    */
  /* ---------------------------------------------------------------------- */

  app.use('/api', apiLimiter, routes);

  /* ---------------------------------------------------------------------- */
  /* Optional single-container mode: serve the built SPA                    */
  /* ---------------------------------------------------------------------- */

  const clientDist = path.resolve(config.serverRoot, '..', 'client', 'dist');
  const servesClient = config.isProduction && existsSync(path.join(clientDist, 'index.html'));

  /* When the SPA is not being served, a bare `/` should still say something
     useful rather than 404 — but it must not shadow the app's own index route,
     so it is only registered in API-only mode. */
  if (!servesClient) {
    app.get('/', (_req, res) =>
      res.json({
        name: 'TrailMate API',
        docs: '/api/meta/config',
        health: '/api/health',
      })
    );
  }

  if (servesClient) {
    logger.info('Serving built client from disk', { path: clientDist });

    app.use(
      express.static(clientDist, {
        // Hashed asset filenames can be cached hard; index.html must not be.
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );

    // SPA history fallback — anything not under /api renders the app shell.
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  /* ---------------------------------------------------------------------- */
  /* Terminal handlers                                                      */
  /* ---------------------------------------------------------------------- */

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
