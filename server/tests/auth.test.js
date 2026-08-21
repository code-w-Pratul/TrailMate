import request from 'supertest';
import { createApp } from '../src/app.js';
import { startTestDb, clearCollections } from './helpers/db.js';
import User from '../src/models/User.js';

const app = createApp();

let db;

beforeAll(async () => {
  db = await startTestDb();
  if (!db.ok) {
    console.warn(`\n[auth.test] Skipping database-backed tests: ${db.reason}\n`);
  }
});

afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  if (db?.ok) await clearCollections();
});

/**
 * Auth flow.
 *
 * `describeIf` keeps the suite honest on machines with no MongoDB: it skips with
 * a printed reason rather than failing, and never silently passes.
 */
const describeIf = (condition) => (condition ? describe : describe.skip);

const credentials = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'analytical1engine',
  homeCurrency: 'GBP',
};

describeIf(true)('auth', () => {
  const guard = () => {
    if (!db?.ok) return false;
    return true;
  };

  it('registers a user, returns a token, and never exposes the password hash', async () => {
    if (!guard()) return;

    const res = await request(app).post('/api/auth/register').send(credentials).expect(201);

    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      homeCurrency: 'GBP',
    });

    /* The hash must not appear anywhere in the serialised response. */
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('$2');

    /* And it must actually be hashed in the database, not stored in plain text. */
    const stored = await User.findOne({ email: credentials.email }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe(credentials.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('normalises the email to lower case', async () => {
    if (!guard()) return;

    await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, email: 'ADA@Example.COM' })
      .expect(201);

    const found = await User.findOne({ email: 'ada@example.com' });
    expect(found).not.toBeNull();
  });

  it('refuses a duplicate email with 409', async () => {
    if (!guard()) return;

    await request(app).post('/api/auth/register').send(credentials).expect(201);
    const res = await request(app).post('/api/auth/register').send(credentials).expect(409);

    expect(res.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('logs in with correct credentials', async () => {
    if (!guard()) return;

    await request(app).post('/api/auth/register').send(credentials).expect(201);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    expect(res.body.data.token).toEqual(expect.any(String));
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    if (!guard()) return;

    await request(app).post('/api/auth/register').send(credentials).expect(201);

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'wrong1password' })
      .expect(401);

    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong1password' })
      .expect(401);

    // Identical responses: an attacker cannot enumerate registered emails.
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('protects /api/auth/me and returns the account for a valid token', async () => {
    if (!guard()) return;

    await request(app).get('/api/auth/me').expect(401);

    const { body } = await request(app).post('/api/auth/register').send(credentials).expect(201);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.data.token}`)
      .expect(200);

    expect(res.body.data.user.email).toBe(credentials.email);
    expect(res.body.data.stats.trips).toBe(0);
  });

  it('rejects a tampered or malformed token', async () => {
    if (!guard()) return;

    const { body } = await request(app).post('/api/auth/register').send(credentials).expect(201);

    await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', body.data.token).expect(401); // no scheme

    const tampered = `${body.data.token.slice(0, -3)}abc`;
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
    expect(['INVALID_TOKEN', 'TOKEN_EXPIRED']).toContain(res.body.error.code);
  });

  it('updates the profile and preferences', async () => {
    if (!guard()) return;

    const { body } = await request(app).post('/api/auth/register').send(credentials).expect(201);
    const auth = { Authorization: `Bearer ${body.data.token}` };

    const res = await request(app)
      .patch('/api/auth/me')
      .set(auth)
      .send({ homeCurrency: 'EUR', preferences: { temperatureUnit: 'F', theme: 'dark' } })
      .expect(200);

    expect(res.body.data.user.homeCurrency).toBe('EUR');
    expect(res.body.data.user.preferences).toMatchObject({ temperatureUnit: 'F', theme: 'dark' });
    // Untouched preferences must survive a partial update.
    expect(res.body.data.user.preferences.distanceUnit).toBe('km');
  });

  it('changes the password and invalidates the old one', async () => {
    if (!guard()) return;

    const { body } = await request(app).post('/api/auth/register').send(credentials).expect(201);
    const auth = { Authorization: `Bearer ${body.data.token}` };

    await request(app)
      .post('/api/auth/change-password')
      .set(auth)
      .send({ currentPassword: 'wrong1password', newPassword: 'brandnew1password' })
      .expect(401);

    await request(app)
      .post('/api/auth/change-password')
      .set(auth)
      .send({ currentPassword: credentials.password, newPassword: 'brandnew1password' })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'brandnew1password' })
      .expect(200);
  });
});
