import request from 'supertest';
import nock from 'nock';
import { createApp } from '../src/app.js';
import {
  HOSTS,
  mockCountriesDataset,
  mockCurrencies,
  mockGeocode,
  mockGeocodeEmpty,
  mockLatestRate,
  mockNominatim,
  mockWeather,
  mockWeatherFailure,
  mockWikipedia,
} from './helpers/fixtures.js';

const app = createApp();

describe('GET /api/health', () => {
  it('reports status without calling any third party', async () => {
    // Net access is disabled globally, so this passing at all proves the health
    // check has no upstream dependency.
    const res = await request(app).get('/api/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.checks.api.status).toBe('ok');
    expect(res.body.data.checks.cache.store).toBe('memory');
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

describe('GET /api/weather/:city', () => {
  it("normalises Open-Meteo into TrailMate's own shape", async () => {
    mockGeocode();
    mockWeather();

    const res = await request(app).get('/api/weather/Kyoto?days=3').expect(200);
    const { location, current, daily, summary, units } = res.body.data;

    expect(location).toMatchObject({ name: 'Kyoto', country: 'Japan', timezone: 'Asia/Tokyo' });

    /* Provider vocabulary must not leak: WMO code 3 becomes "cloudy", never 3. */
    expect(current).toMatchObject({ tempC: 30.2, condition: 'cloudy', humidity: 70 });
    expect(current.weather_code).toBeUndefined();

    expect(daily).toHaveLength(3);
    expect(daily[0]).toMatchObject({
      date: '2026-08-01',
      minC: 24.1,
      maxC: 33.5,
      condition: 'cloudy',
      precipitationChance: 10,
    });
    expect(daily[1].condition).toBe('rain'); // WMO 61
    expect(daily[2].condition).toBe('clear'); // WMO 0

    /* Derived summary — the part packing, budget and AI all depend on. */
    expect(summary).toMatchObject({
      days: 3,
      minC: 23.5,
      maxC: 33.5,
      wetDays: 1,
      rainChanceMax: 85,
      // One cloudy, one rain, one clear: a three-way tie broken toward severity.
      dominantCondition: 'rain',
    });

    expect(units).toEqual({ temperature: 'C', wind: 'kph', precipitation: 'mm' });
  });

  it('serves the second identical request from cache without a second upstream call', async () => {
    // `times(1)` is the assertion: a second upstream call would 404 against nock
    // and surface as a 502.
    mockGeocode(undefined, 1);
    mockWeather(undefined, 1);

    const first = await request(app).get('/api/weather/Kyoto?days=3').expect(200);
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await request(app).get('/api/weather/Kyoto?days=3').expect(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.meta.cached).toBe(true);
    expect(second.body.data.summary).toEqual(first.body.data.summary);

    expect(nock.isDone()).toBe(true);
  });

  it('returns 404 with a helpful message for an unknown city', async () => {
    mockGeocodeEmpty();

    const res = await request(app).get('/api/weather/Nowherecity').expect(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/No place matched/i);
  });

  it('returns 502 when every weather provider fails and nothing is cached', async () => {
    mockGeocode();
    // One retry is configured by default, so allow two attempts.
    mockWeatherFailure({ status: 503, times: 3 });

    const res = await request(app).get('/api/weather/Kyoto').expect(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
    expect(res.body.error.requestId).toBeDefined();
  });
});

describe('GET /api/places/:city', () => {
  it('merges Wikipedia sights with Nominatim food and filters out non-places', async () => {
    mockGeocode();
    mockWikipedia();
    mockNominatim();

    const res = await request(app).get('/api/places/Kyoto?limit=10').expect(200);
    const { attractions, restaurants, counts, provider, attribution } = res.body.data;

    expect(provider).toBe('wikipedia+osm');

    const names = attractions.map((p) => p.name);
    expect(names).toContain('Nijō Castle');
    expect(names).toContain('Kyoto Imperial Palace');

    /* The four traps in the fixture must all be rejected. */
    expect(names).not.toContain('Kinmon incident'); // an event
    expect(names).not.toContain('Kamigyō-ku, Kyoto'); // an administrative ward
    expect(names).not.toContain('Agency for Cultural Affairs'); // an institution
    expect(names).not.toContain('Kyoto'); // the destination itself

    /* Titles are classified into our own closed vocabulary. */
    const castle = attractions.find((p) => p.name === 'Nijō Castle');
    expect(castle.category).toBe('historic');
    expect(castle.description).toContain('flatland castle');
    expect(castle.imageUrl).toMatch(/^https:\/\/upload\.wikimedia\.org/);

    const museum = attractions.find((p) => p.name === 'Kyoto International Manga Museum');
    expect(museum.category).toBe('museum');

    /* Food comes from the other provider but lands in the same shape. */
    expect(restaurants.length).toBeGreaterThan(0);
    expect(restaurants.every((p) => ['restaurant', 'cafe', 'bar'].includes(p.category))).toBe(true);

    /* OSM prefers an English name when one is tagged. */
    expect(restaurants.map((p) => p.name)).toContain('Kitchen Don Freak');

    expect(counts.total).toBe(attractions.length + restaurants.length);
    expect(attribution.map((a) => a.label).join(' ')).toMatch(/OpenStreetMap/);
  });
});

describe('GET /api/currency', () => {
  it('converts using the live rate and echoes the amount', async () => {
    mockCurrencies();
    mockLatestRate({ base: 'USD', to: 'JPY', rate: 160.24 });

    const res = await request(app).get('/api/currency?from=USD&to=JPY&amount=250').expect(200);

    expect(res.body.data).toMatchObject({
      from: 'USD',
      to: 'JPY',
      rate: 160.24,
      amount: 250,
      converted: 40060,
    });
    expect(res.body.data.inverseRate).toBeCloseTo(1 / 160.24, 6);
  });

  it('short-circuits an identical pair with no network call at all', async () => {
    const res = await request(app).get('/api/currency?from=EUR&to=EUR&amount=42').expect(200);

    expect(res.body.data).toMatchObject({ rate: 1, converted: 42, identity: true });
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('rejects a currency the ECB does not price, with an actionable message', async () => {
    mockCurrencies();

    const res = await request(app).get('/api/currency?from=USD&to=VND').expect(400);
    expect(res.body.error.code).toBe('CURRENCY_NOT_SUPPORTED');
    expect(res.body.error.message).toMatch(/not covered by ECB reference rates/i);
  });

  it('reuses the cached rate when only the amount changes', async () => {
    mockCurrencies(1);
    mockLatestRate({ base: 'USD', to: 'JPY', rate: 160.24, times: 1 });

    const a = await request(app).get('/api/currency?from=USD&to=JPY&amount=1').expect(200);
    const b = await request(app).get('/api/currency?from=USD&to=JPY&amount=1000').expect(200);

    expect(a.body.data.converted).toBe(160.24);
    expect(b.body.data.converted).toBe(160240);
    expect(nock.isDone()).toBe(true);
  });
});

describe('GET /api/country/:name', () => {
  it('flattens the dataset into arrays and derives the missing fields', async () => {
    mockCountriesDataset();

    const res = await request(app).get('/api/country/Japan').expect(200);
    const data = res.body.data;

    expect(data).toMatchObject({
      name: 'Japan',
      code: 'JP',
      code3: 'JPN',
      capital: 'Tokyo',
      region: 'Asia',
      primaryLanguage: 'Japanese',
      callingCode: '+81',
      // Derived from the bundled left-hand-traffic list.
      drivingSide: 'left',
    });

    /* Locale-keyed maps become arrays the UI can iterate. */
    expect(data.currencies).toEqual([{ code: 'JPY', name: 'Japanese yen', symbol: '¥' }]);
    expect(data.primaryCurrency.code).toBe('JPY');

    /* Flag images are constructed, not fetched. */
    expect(data.flag.svg).toBe('https://flagcdn.com/jp.svg');
  });

  it('resolves by ISO code and by alternative spelling', async () => {
    mockCountriesDataset();

    const byCode = await request(app).get('/api/country/PT').expect(200);
    expect(byCode.body.data.name).toBe('Portugal');

    const byAlias = await request(app).get('/api/country/UK').expect(200);
    expect(byAlias.body.data.name).toBe('United Kingdom');
  });

  it('rejects a dataset that fails the sanity check', async () => {
    // Reproduces the real incident: HTTP 200 with a body that is not country
    // data. Without output validation this used to yield an object of nulls.
    nock(HOSTS.countriesCdn)
      .get('/gh/mledoze/countries@master/countries.json')
      .reply(200, {
        success: false,
        errors: [{ message: 'This API version has been deprecated.' }],
      });

    const res = await request(app).get('/api/country/Japan').expect(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
    expect(res.body.error.message).toMatch(/unexpected shape/i);
  });

  it('returns 404 for a country that does not exist', async () => {
    mockCountriesDataset();
    const res = await request(app).get('/api/country/Atlantis').expect(404);
    expect(res.body.error.message).toMatch(/No country matched/i);
  });
});

describe('GET /api/photo/:city', () => {
  it('falls back to a deterministic keyless placeholder when Unsplash is unconfigured', async () => {
    const res = await request(app).get('/api/photo/Kyoto').expect(200);

    expect(res.body.data.provider).toBe('picsum');
    expect(res.body.data.isPlaceholder).toBe(true);
    expect(res.body.data.url).toContain('picsum.photos/seed/kyoto');
    // No upstream call was needed to produce it.
    expect(nock.pendingMocks()).toHaveLength(0);
  });
});
