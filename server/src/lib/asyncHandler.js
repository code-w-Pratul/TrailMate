/**
 * Wraps an async route handler so a rejected promise reaches Express' error
 * pipeline instead of becoming an unhandled rejection.
 *
 * Express 5 forwards async rejections natively, so this is belt-and-braces
 * rather than strictly required. It stays for two reasons: it makes the intent
 * explicit at every call site, and it keeps the handlers portable if this code
 * is ever lifted into a project still on Express 4.
 *
 * @template {import('express').RequestHandler} T
 * @param {T} handler
 * @returns {import('express').RequestHandler}
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export default asyncHandler;
