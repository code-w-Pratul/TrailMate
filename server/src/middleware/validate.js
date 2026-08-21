import { ZodError } from 'zod';
import ApiError from '../lib/ApiError.js';

/**
 * Zod request validation.
 *
 * Parsed output is written to `req.valid` rather than back onto `req.query` /
 * `req.params`: in Express 4 those are prototype getters, so assigning to them
 * throws under ESM strict mode. `req.valid` also makes it obvious at the call
 * site that a controller is reading *validated* input, not raw user data.
 *
 * @param {{ params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, body?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      req.valid = {
        params: schemas.params ? schemas.params.parse(req.params) : req.params,
        query: schemas.query ? schemas.query.parse(req.query) : req.query,
        body: schemas.body ? schemas.body.parse(req.body ?? {}) : req.body,
      };
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          ApiError.badRequest('Request validation failed', {
            code: 'VALIDATION_ERROR',
            details: error.issues.map((issue) => ({
              field: issue.path.join('.') || '(root)',
              message: issue.message,
            })),
          })
        );
      }
      return next(error);
    }
  };
}

export default validate;
