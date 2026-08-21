import ApiError from '../lib/ApiError.js';

/** Terminal 404 for unmatched API routes — funnels into the error handler. */
export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

export default notFound;
