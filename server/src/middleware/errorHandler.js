import { ZodError } from 'zod';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../lib/logger.js';
import ApiError from '../lib/ApiError.js';

/**
 * The single place where any thrown value becomes an HTTP response.
 *
 * Guarantees:
 *  1. Clients always receive the same JSON envelope, never an HTML stack trace.
 *  2. Only messages we deliberately marked client-safe are echoed back.
 *  3. Unexpected errors are logged with full stack + request id, then reported
 *     as a generic 500.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args).
export function errorHandler(error, req, res, next) {
  const normalised = normalise(error);
  const { status, code, message, details } = normalised;

  const logMeta = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    ...(normalised.provider ? { provider: normalised.provider } : {}),
  };

  if (status >= 500) {
    logger.error(`${message}`, { ...logMeta, stack: (error?.stack ?? '').split('\n').slice(0, 6) });
  } else {
    logger.warn(`${message}`, logMeta);
  }

  if (res.headersSent) return;

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId: req.id,
    },
    ...(config.isProduction ? {} : { stack: shortStack(error) }),
  });
}

function normalise(error) {
  /* Our own operational errors pass straight through. */
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      provider: error.provider,
    };
  }

  /* Request validation. */
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }

  /* Mongoose schema validation. */
  if (error instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid',
      details: Object.values(error.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  }

  /* Malformed ObjectId in a path param. */
  if (error instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      code: 'INVALID_ID',
      message: `"${error.value}" is not a valid ${error.path}`,
    };
  }

  /* Unique index violation. */
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? { field: 1 })[0];
    return {
      status: 409,
      code: 'DUPLICATE_KEY',
      message: `That ${field} is already in use`,
      details: [{ field, message: 'must be unique' }],
    };
  }

  /* JWT problems. */
  if (error instanceof jwt.TokenExpiredError) {
    return { status: 401, code: 'TOKEN_EXPIRED', message: 'Your session has expired' };
  }
  if (error instanceof jwt.JsonWebTokenError) {
    return { status: 401, code: 'INVALID_TOKEN', message: 'Invalid authentication token' };
  }

  /* Malformed JSON body (raised by express.json()). */
  if (error instanceof SyntaxError && 'body' in error) {
    return { status: 400, code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' };
  }

  /* Payload too large. */
  if (error?.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
  }

  /* Anything else is a bug: never leak the message. */
  return {
    status: error?.status && error.status < 500 ? error.status : 500,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side',
  };
}

function shortStack(error) {
  if (!error?.stack) return undefined;
  return error.stack.split('\n').slice(0, 8).join('\n');
}

export default errorHandler;
