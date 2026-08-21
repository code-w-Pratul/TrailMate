/**
 * Operational error type.
 *
 * Anything thrown as an ApiError is considered *expected* — a bad request, a
 * missing document, an upstream provider that returned a 503. The central
 * error handler turns these into clean JSON responses. Everything else is
 * treated as a programmer error: logged with a stack trace and reported to the
 * client as a generic 500 so internals are never leaked.
 */
export class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code
   * @param {string} message Client-safe message
   * @param {object} [options]
   * @param {string} [options.code]    Stable machine-readable error code
   * @param {unknown} [options.details] Extra context (validation issues, etc.)
   * @param {Error}  [options.cause]   Underlying error, kept for logs only
   */
  constructor(status, message, { code, details, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? defaultCodeFor(status);
    this.details = details;
    this.isOperational = true;
    if (cause) this.cause = cause;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'You do not have access to this resource', options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'Resource not found', options) {
    return new ApiError(404, message, options);
  }

  static conflict(message = 'Resource already exists', options) {
    return new ApiError(409, message, options);
  }

  static tooManyRequests(message = 'Too many requests', options) {
    return new ApiError(429, message, options);
  }

  static internal(message = 'Something went wrong on our side', options) {
    return new ApiError(500, message, options);
  }

  /** Upstream provider failed and we had no cached copy to fall back on. */
  static badGateway(message = 'Upstream service is unavailable', options) {
    return new ApiError(502, message, { code: 'UPSTREAM_ERROR', ...options });
  }

  static gatewayTimeout(message = 'Upstream service timed out', options) {
    return new ApiError(504, message, { code: 'UPSTREAM_TIMEOUT', ...options });
  }
}

function defaultCodeFor(status) {
  const map = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    502: 'UPSTREAM_ERROR',
    503: 'SERVICE_UNAVAILABLE',
    504: 'UPSTREAM_TIMEOUT',
  };
  return map[status] ?? 'ERROR';
}

export default ApiError;
