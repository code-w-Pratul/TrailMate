import { randomUUID } from 'node:crypto';

/**
 * Attaches a stable id to every request so a client-visible error message can
 * be tied back to a specific line in the server logs.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

export default requestId;
