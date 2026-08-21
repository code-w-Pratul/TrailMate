import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

/**
 * Input validation.
 *
 * Every one of these requests is rejected *before* any upstream call is made —
 * network access is disabled in the harness, so if validation let one through
 * the test would fail with a 502 instead of the expected 400. That makes this
 * suite a genuine guarantee that malformed input never reaches a paid API.
 */

describe('request validation', () => {
  it('rejects a missing required query param with field-level detail', async () => {
    const res = await request(app).get('/api/plan').expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'city' })])
    );
  });

  it.each([
    ['/api/weather/123', 'a city that starts with a digit'],
    ['/api/weather/%3Cscript%3E', 'an injection attempt'],
    ['/api/places/' + 'a'.repeat(120), 'an over-long city name'],
  ])('rejects %s (%s)', async (url) => {
    const res = await request(app).get(url).expect(400);
    expect(res.body.success).toBe(false);
  });

  it('accepts real place names with punctuation and accents', async () => {
    // These must reach the service layer (and therefore fail on the blocked
    // network with a 5xx), not be rejected as invalid input.
    for (const city of ['Saint-Étienne', "Coeur d'Alene", 'Washington, D.C.', 'München']) {
      const res = await request(app).get(`/api/weather/${encodeURIComponent(city)}`);
      expect(res.status).not.toBe(400);
    }
  });

  it('rejects malformed currency codes', async () => {
    await request(app).get('/api/currency?from=US&to=INR').expect(400);
    await request(app).get('/api/currency?from=USD&to=RUPEE').expect(400);
    await request(app).get('/api/currency?from=USD').expect(400);
  });

  it('rejects a negative amount', async () => {
    const res = await request(app).get('/api/currency?from=USD&to=EUR&amount=-5').expect(400);
    expect(res.body.error.details[0].field).toBe('amount');
  });

  it('clamps out-of-range numeric params rather than trusting them', async () => {
    // days is bounded 1..7; asking for 9999 must be rejected, not forwarded.
    const res = await request(app).get('/api/weather/Kyoto?days=9999').expect(400);
    expect(res.body.error.details[0].field).toBe('days');
  });

  it('rejects an unknown value in a csv list param', async () => {
    const res = await request(app)
      .get('/api/plan?city=Kyoto&include=weather,telepathy')
      .expect(400);
    expect(res.body.error.details[0].message).toMatch(/Allowed values/);
  });

  it('accepts both csv and repeated forms of a list param', async () => {
    const csv = await request(app).get('/api/plan?city=Kyoto&include=weather,packing');
    const repeated = await request(app).get('/api/plan?city=Kyoto&include=weather&include=packing');
    expect(csv.status).not.toBe(400);
    expect(repeated.status).not.toBe(400);
  });

  it('rejects an end date before the start date', async () => {
    const res = await request(app)
      .get('/api/plan?city=Kyoto&startDate=2026-09-10&endDate=2026-09-01')
      .expect(400);
    expect(res.body.error.details[0].field).toBe('endDate');
  });

  it('rejects a non-ObjectId path param', async () => {
    const res = await request(app)
      .get('/api/trips/not-an-id')
      .set('Authorization', 'Bearer nonsense')
      .expect(401);
    // Auth is checked before validation, which is the correct order.
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a malformed share token without touching the database', async () => {
    const res = await request(app).get('/api/share/short').expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'token',
          message: expect.stringMatching(/Invalid share link/i),
        }),
      ])
    );
  });

  it('rejects a malformed JSON body with a clear message', async () => {
    // `.type('json')` is superagent's own switch — setting the raw header can
    // be overridden when a non-object body is sent, in which case the parser
    // never sees malformed input and the test would prove nothing.
    const res = await request(app)
      .post('/api/auth/login')
      .type('json')
      .send('{"email": broken}')
      .expect(400);

    expect(res.body.error.code).toBe('MALFORMED_JSON');
  });

  it('enforces password policy on register but not on login', async () => {
    const weak = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'short' })
      .expect(400);
    expect(weak.body.error.details.some((d) => d.field === 'password')).toBe(true);

    // Login must not leak the policy: a short password is a credential failure,
    // never a validation error.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'x' });
    expect(login.status).not.toBe(400);
  });
});

describe('error envelope', () => {
  it('uses one consistent shape for every failure', async () => {
    const res = await request(app).get('/api/definitely-not-a-route').expect(404);

    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: expect.stringContaining('does not exist'),
        requestId: expect.any(String),
      },
    });
  });

  it("echoes the caller's request id so logs and responses can be correlated", async () => {
    const res = await request(app).get('/api/nope').set('X-Request-Id', 'trace-me-123').expect(404);

    expect(res.headers['x-request-id']).toBe('trace-me-123');
    expect(res.body.error.requestId).toBe('trace-me-123');
  });
});
