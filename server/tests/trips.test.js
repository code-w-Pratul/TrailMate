import request from 'supertest';
import { createApp } from '../src/app.js';
import { startTestDb, clearCollections } from './helpers/db.js';
import { mockFullPlan } from './helpers/fixtures.js';

const app = createApp();

let db;
let token;

const authHeader = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  db = await startTestDb();
  if (!db.ok) console.warn(`\n[trips.test] Skipping database-backed tests: ${db.reason}\n`);
});

afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  if (!db?.ok) return;
  await clearCollections();
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Traveller', email: 'trip@example.com', password: 'wander1lust' });
  token = res.body.data.token;
});

const ready = () => Boolean(db?.ok);

/**
 * Saved trips: ownership, snapshotting and public sharing.
 *
 * Note that creating a trip never accepts a weather/places payload from the
 * client — the server captures its own snapshot. These tests mock the upstreams
 * to prove that, and to prove the snapshot is stored in our normalised shape.
 */
describe('trips', () => {
  it('captures a server-side snapshot on create rather than trusting the client', async () => {
    if (!ready()) return;
    mockFullPlan();

    const res = await request(app)
      .post('/api/trips')
      .set(authHeader())
      .send({
        city: 'Kyoto',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        notes: 'Temples and coffee',
        // Deliberately hostile: an attempt to inject a fake snapshot.
        snapshot: { weather: { summary: { maxC: 999 } } },
      })
      .expect(201);

    const trip = res.body.data;

    expect(trip.title).toMatch(/Kyoto/);
    expect(trip.destination).toMatchObject({ name: 'Kyoto', countryCode: 'JP' });
    expect(trip.durationDays).toBe(3);

    /* The injected payload must have been ignored entirely. */
    expect(trip.snapshot.weather.summary.maxC).toBe(33.5);
    expect(trip.snapshot.weather.location.name).toBe('Kyoto');
    expect(trip.snapshot.country.name).toBe('Japan');
    expect(trip.snapshot.currency.to).toBe('JPY');
    expect(trip.snapshot.capturedAt).toBeDefined();

    /* The packing list is materialised so the user can tick items off. */
    expect(trip.packingList.length).toBeGreaterThan(5);
    expect(trip.packingList.every((i) => i.packed === false)).toBe(true);

    expect(res.headers.location).toBe(`/api/trips/${trip.id}`);
  });

  it('allows several unshared trips to coexist', async () => {
    if (!ready()) return;

    /* Regression test. The share-token index was originally `sparse: true` with
       `token` defaulting to `null`. A sparse index still indexes an explicit
       null, so the *second* unshared trip died with a duplicate-key error on
       `share.token: null`. Creating two plain trips is the whole test — and it
       is the one the original suite was missing, which is why a seed run found
       the bug before the tests did. */
    mockFullPlan();
    await request(app).post('/api/trips').set(authHeader()).send({ city: 'Kyoto' }).expect(201);

    mockFullPlan();
    await request(app)
      .post('/api/trips')
      .set(authHeader())
      .send({ city: 'Kyoto', title: 'Second Kyoto trip' })
      .expect(201);

    const res = await request(app).get('/api/trips').set(authHeader()).expect(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((trip) => trip.isShared === false)).toBe(true);
  });

  it("lists a user's trips without the heavy snapshot payloads", async () => {
    if (!ready()) return;
    mockFullPlan();
    await request(app).post('/api/trips').set(authHeader()).send({ city: 'Kyoto' }).expect(201);

    const res = await request(app).get('/api/trips').set(authHeader()).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 1, total: 1, totalPages: 1, hasNextPage: false });
    // List responses stay small: snapshots are projected out.
    expect(res.body.data[0].snapshot?.weather).toBeUndefined();
    expect(res.body.data[0].destination.name).toBe('Kyoto');
  });

  it("refuses to leak another user's trip, reporting 404 rather than 403", async () => {
    if (!ready()) return;
    mockFullPlan();

    const created = await request(app)
      .post('/api/trips')
      .set(authHeader())
      .send({ city: 'Kyoto' })
      .expect(201);

    const other = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Someone Else', email: 'other@example.com', password: 'other1password' })
      .expect(201);

    // 404, not 403: a stranger must not learn that this id exists.
    await request(app)
      .get(`/api/trips/${created.body.data.id}`)
      .set({ Authorization: `Bearer ${other.body.data.token}` })
      .expect(404);

    await request(app)
      .delete(`/api/trips/${created.body.data.id}`)
      .set({ Authorization: `Bearer ${other.body.data.token}` })
      .expect(404);
  });

  it('updates editable fields and preserves packing progress', async () => {
    if (!ready()) return;
    mockFullPlan();

    const created = await request(app)
      .post('/api/trips')
      .set(authHeader())
      .send({ city: 'Kyoto' })
      .expect(201);

    const packingList = created.body.data.packingList.map((item, index) => ({
      ...item,
      packed: index < 2,
    }));

    const res = await request(app)
      .patch(`/api/trips/${created.body.data.id}`)
      .set(authHeader())
      .send({ title: 'Autumn in Kyoto', notes: 'Book Nijō early', packingList })
      .expect(200);

    expect(res.body.data.title).toBe('Autumn in Kyoto');
    expect(res.body.data.packingList.filter((i) => i.packed)).toHaveLength(2);
  });

  it('rejects an end date before the start date at the model level too', async () => {
    if (!ready()) return;
    mockFullPlan();

    const created = await request(app)
      .post('/api/trips')
      .set(authHeader())
      .send({ city: 'Kyoto' })
      .expect(201);

    const res = await request(app)
      .patch(`/api/trips/${created.body.data.id}`)
      .set(authHeader())
      .send({ startDate: '2026-09-10', endDate: '2026-09-01' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deletes a trip', async () => {
    if (!ready()) return;
    mockFullPlan();

    const created = await request(app)
      .post('/api/trips')
      .set(authHeader())
      .send({ city: 'Kyoto' })
      .expect(201);

    await request(app).delete(`/api/trips/${created.body.data.id}`).set(authHeader()).expect(204);
    await request(app).get(`/api/trips/${created.body.data.id}`).set(authHeader()).expect(404);
  });

  describe('public sharing', () => {
    it('mints an unguessable token and serves the trip without auth', async () => {
      if (!ready()) return;
      mockFullPlan();

      const created = await request(app)
        .post('/api/trips')
        .set(authHeader())
        .send({ city: 'Kyoto' })
        .expect(201);

      const shared = await request(app)
        .post(`/api/trips/${created.body.data.id}/share`)
        .set(authHeader())
        .expect(200);

      const { token: shareToken, path } = shared.body.data;
      expect(shareToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      expect(path).toBe(`/share/${shareToken}`);

      /* No Authorization header at all on the public read. */
      const publicView = await request(app).get(`/api/share/${shareToken}`).expect(200);

      expect(publicView.body.data.destination.name).toBe('Kyoto');
      expect(publicView.body.meta.readOnly).toBe(true);

      /* Nothing about the owner may leak through a share link. */
      expect(publicView.body.data.userId).toBeUndefined();
      expect(publicView.body.data.share).toBeUndefined();
      expect(JSON.stringify(publicView.body)).not.toContain('trip@example.com');
    });

    it('stops serving the trip once sharing is revoked', async () => {
      if (!ready()) return;
      mockFullPlan();

      const created = await request(app)
        .post('/api/trips')
        .set(authHeader())
        .send({ city: 'Kyoto' })
        .expect(201);

      const shared = await request(app)
        .post(`/api/trips/${created.body.data.id}/share`)
        .set(authHeader())
        .expect(200);

      await request(app).get(`/api/share/${shared.body.data.token}`).expect(200);

      await request(app)
        .delete(`/api/trips/${created.body.data.id}/share`)
        .set(authHeader())
        .expect(200);

      await request(app).get(`/api/share/${shared.body.data.token}`).expect(404);
    });

    it('returns 404 for a well-formed but unknown token', async () => {
      if (!ready()) return;
      await request(app)
        .get(`/api/share/${'a'.repeat(32)}`)
        .expect(404);
    });
  });
});
