/**
 * Response envelope.
 *
 * Every successful response is `{ success: true, data, meta }` and every failure
 * is `{ success: false, error }`. One shape means the client needs exactly one
 * unwrapping helper and one error path.
 *
 * Cache provenance is also mirrored into headers (`X-Cache`, `Age`) so it shows
 * up in the browser network tab and in curl without having to read the body —
 * genuinely useful when demonstrating that caching works.
 */

/**
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {object|null} [meta]
 * @param {{ status?: number }} [options]
 */
export function sendData(res, data, meta = null, { status = 200 } = {}) {
  if (meta) {
    res.setHeader('X-Cache', meta.degraded ? 'STALE' : meta.cached ? 'HIT' : 'MISS');
    if (Number.isFinite(meta.ageSeconds)) res.setHeader('Age', String(meta.ageSeconds));
    if (meta.provider) res.setHeader('X-Data-Provider', String(meta.provider));
  }

  return res.status(status).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

/** 201 + Location header for newly created resources. */
export function sendCreated(res, data, { location, meta = null } = {}) {
  if (location) res.setHeader('Location', location);
  return sendData(res, data, meta, { status: 201 });
}

export function sendNoContent(res) {
  return res.status(204).end();
}

/** Paginated list payload. */
export function sendPage(res, items, { page, limit, total }) {
  return res.status(200).json({
    success: true,
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  });
}

export default { sendData, sendCreated, sendNoContent, sendPage };
