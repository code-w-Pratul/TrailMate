import nock from 'nock';

/**
 * Upstream fixtures.
 *
 * Each payload mirrors the real provider's response shape closely enough that
 * the normalisers are genuinely under test — including the awkward parts, like
 * Open-Meteo's parallel arrays and Wikipedia's split pagination.
 */

export const HOSTS = {
  openMeteoGeo: 'https://geocoding-api.open-meteo.com',
  openMeteo: 'https://api.open-meteo.com',
  openMeteoArchive: 'https://archive-api.open-meteo.com',
  frankfurter: 'https://api.frankfurter.app',
  wikipedia: 'https://en.wikipedia.org',
  nominatim: 'https://nominatim.openstreetmap.org',
  countriesCdn: 'https://cdn.jsdelivr.net',
  openWeather: 'https://api.openweathermap.org',
};

/* -------------------------------------------------------------------------- */
/* Geocoding                                                                   */
/* -------------------------------------------------------------------------- */

export const kyotoGeocode = {
  results: [
    {
      id: 1857910,
      name: 'Kyoto',
      latitude: 35.0211,
      longitude: 135.7539,
      elevation: 50,
      country_code: 'JP',
      country: 'Japan',
      admin1: 'Kyoto',
      timezone: 'Asia/Tokyo',
      population: 1463723,
    },
    {
      id: 2222222,
      name: 'Kyoto',
      latitude: 34.9,
      longitude: 135.6,
      country_code: 'JP',
      country: 'Japan',
      admin1: 'Osaka',
      timezone: 'Asia/Tokyo',
      population: 12000,
    },
  ],
};

export function mockGeocode(payload = kyotoGeocode, times = 1) {
  return nock(HOSTS.openMeteoGeo).get('/v1/search').query(true).times(times).reply(200, payload);
}

/** Empty result set — Open-Meteo omits `results` entirely rather than sending []. */
export function mockGeocodeEmpty(times = 1) {
  return nock(HOSTS.openMeteoGeo)
    .get('/v1/search')
    .query(true)
    .times(times)
    .reply(200, { generationtime_ms: 0.4 });
}

/* -------------------------------------------------------------------------- */
/* Weather (Open-Meteo)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Three days: overcast (WMO 3), rain (61), clear (0).
 * Chosen so the derived summary is non-trivial to compute:
 *  - wetDays must be 1
 *  - dominantCondition must break a 1/1/1 tie toward the most severe (rain)
 *  - maxC must come from day 1 and minC from day 2
 */
export const kyotoForecast = {
  latitude: 35.0,
  longitude: 135.75,
  timezone: 'Asia/Tokyo',
  current: {
    time: '2026-08-01T05:00',
    temperature_2m: 30.2,
    relative_humidity_2m: 70,
    apparent_temperature: 35.1,
    is_day: 1,
    precipitation: 0,
    weather_code: 3,
    wind_speed_10m: 8.4,
    wind_direction_10m: 180,
    surface_pressure: 1008,
  },
  daily: {
    time: ['2026-08-01', '2026-08-02', '2026-08-03'],
    weather_code: [3, 61, 0],
    temperature_2m_max: [33.5, 29.8, 31.2],
    temperature_2m_min: [24.1, 23.5, 24.0],
    apparent_temperature_max: [39.9, 34.2, 36.0],
    sunrise: ['2026-08-01T05:06', '2026-08-02T05:07', '2026-08-03T05:08'],
    sunset: ['2026-08-01T19:00', '2026-08-02T18:59', '2026-08-03T18:58'],
    precipitation_sum: [0, 12.4, 0],
    precipitation_probability_max: [10, 85, 5],
    wind_speed_10m_max: [12.1, 22.3, 9.8],
    relative_humidity_2m_mean: [70, 82, 65],
    uv_index_max: [8.2, 5.1, 9.0],
  },
};

export function mockWeather(payload = kyotoForecast, times = 1) {
  return nock(HOSTS.openMeteo).get('/v1/forecast').query(true).times(times).reply(200, payload);
}

export function mockWeatherFailure({ status = 503, times = 1 } = {}) {
  return nock(HOSTS.openMeteo)
    .get('/v1/forecast')
    .query(true)
    .times(times)
    .reply(status, { error: true, reason: 'upstream exploded' });
}

/* -------------------------------------------------------------------------- */
/* Currency (Frankfurter)                                                      */
/* -------------------------------------------------------------------------- */

export const currencyList = {
  EUR: 'Euro',
  GBP: 'British Pound',
  INR: 'Indian Rupee',
  JPY: 'Japanese Yen',
  USD: 'United States Dollar',
};

export function mockCurrencies(times = 1) {
  return nock(HOSTS.frankfurter).get('/currencies').times(times).reply(200, currencyList);
}

export function mockLatestRate({ base = 'USD', to = 'JPY', rate = 160.24, times = 1 } = {}) {
  return nock(HOSTS.frankfurter)
    .get('/latest')
    .query(true)
    .times(times)
    .reply(200, { amount: 1, base, date: '2026-07-31', rates: { [to]: rate } });
}

/* -------------------------------------------------------------------------- */
/* Country dataset (mledoze via jsDelivr)                                      */
/* -------------------------------------------------------------------------- */

const country = (overrides) => ({
  name: { common: 'Japan', official: 'Japan' },
  tld: ['.jp'],
  cca2: 'JP',
  ccn3: '392',
  cca3: 'JPN',
  cioc: 'JPN',
  independent: true,
  unMember: true,
  currencies: { JPY: { name: 'Japanese yen', symbol: '¥' } },
  idd: { root: '+8', suffixes: ['1'] },
  capital: ['Tokyo'],
  altSpellings: ['JP', 'Nippon', 'Nihon'],
  region: 'Asia',
  subregion: 'Eastern Asia',
  languages: { jpn: 'Japanese' },
  translations: {},
  latlng: [36, 138],
  landlocked: false,
  borders: [],
  area: 377930,
  flag: '\u{1F1EF}\u{1F1F5}',
  demonyms: { eng: { f: 'Japanese', m: 'Japanese' } },
  ...overrides,
});

/**
 * The dataset loader rejects anything under 100 records, so the fixture is
 * padded with synthetic filler — that guard is itself worth exercising.
 */
export const countriesDataset = [
  country({}),
  country({
    name: { common: 'Portugal', official: 'Portuguese Republic' },
    cca2: 'PT',
    cca3: 'PRT',
    ccn3: '620',
    cioc: 'POR',
    currencies: { EUR: { name: 'Euro', symbol: '€' } },
    capital: ['Lisbon'],
    region: 'Europe',
    subregion: 'Southern Europe',
    languages: { por: 'Portuguese' },
    altSpellings: ['PT'],
    latlng: [39.5, -8],
    area: 92090,
    tld: ['.pt'],
    idd: { root: '+3', suffixes: ['51'] },
    demonyms: { eng: { f: 'Portuguese', m: 'Portuguese' } },
  }),
  country({
    name: { common: 'United Kingdom', official: 'United Kingdom of Great Britain' },
    cca2: 'GB',
    cca3: 'GBR',
    ccn3: '826',
    cioc: 'GBR',
    currencies: { GBP: { name: 'British pound', symbol: '£' } },
    capital: ['London'],
    region: 'Europe',
    subregion: 'Northern Europe',
    languages: { eng: 'English' },
    altSpellings: ['GB', 'UK'],
    latlng: [54, -2],
    tld: ['.uk'],
    idd: { root: '+4', suffixes: ['4'] },
  }),
  ...Array.from({ length: 120 }, (_, i) =>
    country({
      name: { common: `Testland ${i}`, official: `Republic of Testland ${i}` },
      cca2: `T${String(i).padStart(2, '0')}`.slice(0, 2),
      cca3: `T${String(i).padStart(2, '0')}`,
      ccn3: String(900 + i),
      cioc: `T${String(i).padStart(2, '0')}`,
      altSpellings: [],
    })
  ),
];

export function mockCountriesDataset(times = 1) {
  return nock(HOSTS.countriesCdn)
    .get('/gh/mledoze/countries@master/countries.json')
    .times(times)
    .reply(200, countriesDataset);
}

/* -------------------------------------------------------------------------- */
/* Places (Wikipedia + Nominatim)                                              */
/* -------------------------------------------------------------------------- */

export const wikiGeosearch = {
  batchcomplete: true,
  query: {
    geosearch: [
      { pageid: 1, ns: 0, title: 'Nijō Castle', lat: 35.0142, lon: 135.7475, dist: 966.1 },
      { pageid: 2, ns: 0, title: 'Kyoto Imperial Palace', lat: 35.0254, lon: 135.762, dist: 889.4 },
      {
        pageid: 3,
        ns: 0,
        title: 'Kyoto International Manga Museum',
        lat: 35.01,
        lon: 135.759,
        dist: 1158,
      },
      // Must be filtered: a historical event, not a place.
      { pageid: 4, ns: 0, title: 'Kinmon incident', lat: 35.023, lon: 135.7597, dist: 210 },
      // Must be filtered: administrative area.
      { pageid: 5, ns: 0, title: 'Kamigyō-ku, Kyoto', lat: 35.03, lon: 135.75, dist: 400 },
      // Must be filtered: institution.
      {
        pageid: 6,
        ns: 0,
        title: 'Agency for Cultural Affairs',
        lat: 35.0205,
        lon: 135.7561,
        dist: 211,
      },
      // Must be filtered: the destination's own article.
      { pageid: 7, ns: 0, title: 'Kyoto', lat: 35.0211, lon: 135.7539, dist: 3 },
    ],
  },
};

export const wikiInfo = {
  query: {
    pages: [
      { pageid: 1, title: 'Nijō Castle', length: 15827 },
      { pageid: 2, title: 'Kyoto Imperial Palace', length: 48331 },
      { pageid: 3, title: 'Kyoto International Manga Museum', length: 11831 },
    ],
  },
};

export const wikiDetails = {
  query: {
    pages: [
      {
        pageid: 1,
        title: 'Nijō Castle',
        extract: 'Nijō Castle is a flatland castle in Kyoto, Japan.',
        thumbnail: { source: 'https://upload.wikimedia.org/nijo.jpg', width: 640, height: 480 },
      },
      {
        pageid: 2,
        title: 'Kyoto Imperial Palace',
        extract: 'The Kyoto Imperial Palace is the former palace of the Emperor of Japan.',
        thumbnail: { source: 'https://upload.wikimedia.org/palace.jpg', width: 640, height: 480 },
      },
      {
        pageid: 3,
        title: 'Kyoto International Manga Museum',
        extract: 'The Kyoto International Manga Museum is a museum in Kyoto.',
        thumbnail: { source: 'https://upload.wikimedia.org/manga.jpg', width: 640, height: 480 },
      },
    ],
  },
};

/**
 * Wikipedia is queried three times with different `prop` combinations. The
 * interceptors are distinguished by inspecting the query string, which also
 * documents the three-call design.
 */
export function mockWikipedia() {
  const scope = nock(HOSTS.wikipedia);

  scope
    .get('/w/api.php')
    .query((q) => q.list === 'geosearch')
    .reply(200, wikiGeosearch);

  scope
    .get('/w/api.php')
    .query((q) => q.prop === 'info')
    .reply(200, wikiInfo);

  scope
    .get('/w/api.php')
    .query((q) => typeof q.prop === 'string' && q.prop.includes('extracts'))
    .reply(200, wikiDetails);

  return scope;
}

export const nominatimRestaurants = [
  {
    place_id: 269241463,
    osm_type: 'node',
    osm_id: 1851309586,
    lat: '34.9959508',
    lon: '135.7458019',
    category: 'amenity',
    type: 'restaurant',
    name: 'RAJU',
    display_name: 'RAJU, Kyoto, Japan',
    address: { road: 'Gojo', city: 'Kyoto', postcode: '600-8811' },
    extratags: { cuisine: 'indian', website: 'https://example.test/raju' },
  },
  {
    place_id: 268870401,
    osm_type: 'node',
    osm_id: 5010530023,
    lat: '34.9946716',
    lon: '135.7360629',
    category: 'amenity',
    type: 'restaurant',
    name: 'キッチン DON FREAK',
    display_name: 'DON FREAK, Kyoto, Japan',
    address: { city: 'Kyoto' },
    extratags: { cuisine: 'japanese', 'name:en': 'Kitchen Don Freak' },
  },
];

export const nominatimCafes = [
  {
    place_id: 111,
    osm_type: 'node',
    osm_id: 222,
    lat: '35.0100',
    lon: '135.7600',
    category: 'amenity',
    type: 'cafe',
    name: 'Zip Cafe',
    display_name: 'Zip Cafe, Kyoto, Japan',
    address: { city: 'Kyoto' },
    extratags: {},
  },
];

export function mockNominatim() {
  const scope = nock(HOSTS.nominatim);
  scope
    .get('/search')
    .query((q) => q.q === 'restaurant')
    .reply(200, nominatimRestaurants);
  scope
    .get('/search')
    .query((q) => q.q === 'cafe')
    .reply(200, nominatimCafes);
  return scope;
}

/** Everything a `/api/plan` request needs, in one call. */
export function mockFullPlan() {
  mockGeocode(kyotoGeocode, 1);
  mockWeather();
  mockWikipedia();
  mockNominatim();
  mockCountriesDataset();
  mockCurrencies();
  mockLatestRate({ base: 'USD', to: 'JPY', rate: 160.24 });
  // The 30-day series for the currency card; a failure here must not break it.
  nock(HOSTS.frankfurter)
    .get(/^\/\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}/)
    .query(true)
    .reply(200, {
      amount: 1,
      base: 'USD',
      rates: { '2026-07-15': { JPY: 159.1 }, '2026-07-31': { JPY: 160.24 } },
    });
}

export default {
  HOSTS,
  mockGeocode,
  mockGeocodeEmpty,
  mockWeather,
  mockWeatherFailure,
  mockCurrencies,
  mockLatestRate,
  mockCountriesDataset,
  mockWikipedia,
  mockNominatim,
  mockFullPlan,
};
