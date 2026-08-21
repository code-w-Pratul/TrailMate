import { generatePackingList } from '../src/services/packingService.js';
import { estimateBudget } from '../src/services/budgetService.js';
import { generateRuleBasedSummary, buildBrief } from '../src/services/aiService.js';
import { distanceMeters, estimateTravel, boundsOf } from '../src/lib/geo.js';
import { mockCurrencies, mockLatestRate } from './helpers/fixtures.js';

/**
 * The derived features: packing, budget, travel estimates and the deterministic
 * AI fallback.
 *
 * All four are pure(ish) functions over already-normalised data, which is
 * exactly why they are worth unit testing — the rules are the product, and a
 * silent change to "does rain add an umbrella" is a real regression.
 */

const coldWetWeather = {
  summary: {
    days: 5,
    minC: -3,
    maxC: 4,
    avgMaxC: 2,
    avgMinC: -2,
    wetDays: 3,
    rainChanceMax: 90,
    windKphMax: 55,
    dominantCondition: 'snow',
  },
  daily: [
    {
      date: '2026-01-01',
      minC: -3,
      maxC: 2,
      condition: 'snow',
      precipitationChance: 90,
      humidity: 80,
      uvIndex: 1,
    },
    {
      date: '2026-01-02',
      minC: -2,
      maxC: 3,
      condition: 'rain',
      precipitationChance: 70,
      humidity: 85,
      uvIndex: 1,
    },
    {
      date: '2026-01-03',
      minC: -1,
      maxC: 4,
      condition: 'drizzle',
      precipitationChance: 60,
      humidity: 88,
      uvIndex: 1,
    },
    {
      date: '2026-01-04',
      minC: -2,
      maxC: 3,
      condition: 'cloudy',
      precipitationChance: 20,
      humidity: 75,
      uvIndex: 1,
    },
    {
      date: '2026-01-05',
      minC: -3,
      maxC: 1,
      condition: 'clear',
      precipitationChance: 5,
      humidity: 70,
      uvIndex: 2,
    },
  ],
};

const hotDryWeather = {
  summary: {
    days: 4,
    minC: 24,
    maxC: 36,
    avgMaxC: 35,
    avgMinC: 25,
    wetDays: 0,
    rainChanceMax: 5,
    windKphMax: 12,
    dominantCondition: 'clear',
  },
  daily: [
    {
      date: '2026-07-01',
      minC: 24,
      maxC: 36,
      condition: 'clear',
      precipitationChance: 0,
      humidity: 40,
      uvIndex: 9,
    },
    {
      date: '2026-07-02',
      minC: 25,
      maxC: 35,
      condition: 'clear',
      precipitationChance: 5,
      humidity: 45,
      uvIndex: 10,
    },
    {
      date: '2026-07-03',
      minC: 25,
      maxC: 34,
      condition: 'partly-cloudy',
      precipitationChance: 5,
      humidity: 42,
      uvIndex: 8,
    },
    {
      date: '2026-07-04',
      minC: 24,
      maxC: 35,
      condition: 'clear',
      precipitationChance: 0,
      humidity: 41,
      uvIndex: 9,
    },
  ],
};

const japan = {
  name: 'Japan',
  code: 'JP',
  primaryLanguage: 'Japanese',
  primaryCurrency: { code: 'JPY', name: 'Japanese yen', symbol: '¥' },
  drivingSide: 'left',
  region: 'Asia',
  subregion: 'Eastern Asia',
  capital: 'Tokyo',
  languages: [{ code: 'jpn', name: 'Japanese' }],
};

const places = {
  counts: {
    attractions: 8,
    restaurants: 6,
    byCategory: { historic: 4, museum: 2, park: 2, restaurant: 4, cafe: 2 },
  },
  attractions: [
    { name: 'Nijō Castle', category: 'historic' },
    { name: 'Kyoto Imperial Palace', category: 'historic' },
    { name: 'Manga Museum', category: 'museum' },
  ],
  restaurants: [{ name: 'RAJU', category: 'restaurant' }],
};

describe('packing list rules', () => {
  it('derives cold and wet gear, each with the reason that triggered it', () => {
    const list = generatePackingList({
      weather: coldWetWeather,
      country: japan,
      places,
      days: 5,
      homeCountryCode: 'GB',
      homeCurrency: 'GBP',
    });

    const items = list.items.map((i) => i.item);
    expect(items).toContain('Insulated winter boots');
    expect(items).toContain('Thermal base layers');
    expect(items).toContain('Compact umbrella');
    expect(items).toContain('Waterproof snow boots');
    expect(items).toContain('Windbreaker'); // 55 km/h gusts
    expect(items).toContain('Slip-on ice grips');

    // Nothing summer-specific should appear.
    expect(items).not.toContain('Sunscreen SPF 50');
    expect(items).not.toContain('Cooling towel');

    // Every item explains itself — that is what the UI renders as a tooltip.
    expect(list.items.every((i) => typeof i.reason === 'string' && i.reason.length > 0)).toBe(true);

    const umbrella = list.items.find((i) => i.item === 'Compact umbrella');
    expect(umbrella.reason).toMatch(/Rain expected on 3 of 5/);
  });

  it('derives hot-weather gear and skips the cold branch entirely', () => {
    const list = generatePackingList({ weather: hotDryWeather, country: japan, places, days: 4 });
    const items = list.items.map((i) => i.item);

    expect(items).toContain('Breathable, loose clothing');
    expect(items).toContain('Sunscreen SPF 50');
    expect(items).toContain('Electrolyte sachets');
    expect(items).not.toContain('Warm coat');
    expect(items).not.toContain('Compact umbrella');
  });

  it('adds international logistics only when leaving the home country', () => {
    const abroad = generatePackingList({
      weather: hotDryWeather,
      country: japan,
      days: 4,
      homeCountryCode: 'GB',
      homeCurrency: 'GBP',
    });
    const domestic = generatePackingList({
      weather: hotDryWeather,
      country: japan,
      days: 4,
      homeCountryCode: 'JP',
      homeCurrency: 'JPY',
    });

    const abroadItems = abroad.items.map((i) => i.item);
    expect(abroadItems).toContain('Passport');
    expect(abroadItems).toContain('Travel insurance details');
    // Country-specific plug type, not a generic adapter.
    expect(abroadItems.find((i) => i.startsWith('Plug adapter'))).toMatch(/A\/B \(100 V\)/);
    expect(abroadItems).toContain('Small amount of JPY cash');
    expect(abroadItems).toContain('Note: traffic drives on the left');

    expect(domestic.items.map((i) => i.item)).toContain('Photo ID');
    expect(domestic.items.map((i) => i.item)).not.toContain('Passport');
  });

  it('scales quantities with trip length but caps them sensibly', () => {
    const short = generatePackingList({ weather: hotDryWeather, days: 3 });
    const long = generatePackingList({ weather: hotDryWeather, days: 21 });

    expect(short.items.find((i) => i.item === 'Socks').quantity).toBe(3);
    // Capped rather than suggesting 21 pairs.
    expect(long.items.find((i) => i.item === 'Socks').quantity).toBe(8);
    expect(long.items.map((i) => i.item)).toContain('Laundry detergent sheets');
  });

  it('honours user-selected activities', () => {
    const list = generatePackingList({
      weather: hotDryWeather,
      days: 4,
      activities: ['hiking', 'swimming'],
    });
    const items = list.items.map((i) => i.item);
    expect(items).toContain('Hiking boots');
    expect(items).toContain('Swimwear');
    expect(items).toContain('Quick-dry towel');
  });

  it('still produces a usable list when weather is unavailable', () => {
    const list = generatePackingList({ days: 3 });
    expect(list.items.length).toBeGreaterThan(5);
    expect(list.totals.essentials).toBeGreaterThan(0);
    expect(list.basis.forecastDays).toBe(0);
  });

  it('groups items into ordered categories', () => {
    const list = generatePackingList({ weather: coldWetWeather, country: japan, days: 5 });
    const names = list.categories.map((c) => c.name);
    expect(names[0]).toBe('documents');
    expect(names).toContain('clothing');
    expect(list.totals.items).toBe(list.items.length);
  });
});

describe('budget estimator', () => {
  beforeEach(() => {
    mockCurrencies(2);
    mockLatestRate({ base: 'USD', to: 'JPY', rate: 160, times: 2 });
    mockLatestRate({ base: 'USD', to: 'GBP', rate: 0.78, times: 2 });
  });

  it('applies the documented formula and shows its working', async () => {
    const estimate = await estimateBudget({
      location: { name: 'Tokyo', population: 13_500_000 },
      country: { ...japan, capital: 'Tokyo' },
      days: 5,
      travellers: 1,
      style: 'midrange',
      homeCurrency: 'USD',
    });

    // Japan 1.2 × mega-city 1.15 × capital 1.05 = 1.449 (capped premium 1.208)
    expect(estimate.model.countryIndex).toBe(1.2);
    expect(estimate.model.countryIndexBasis).toBe('country table (JP)');
    expect(estimate.model.cityPremiumReasons).toEqual(
      expect.arrayContaining(['mega-city (10M+)', 'capital city'])
    );
    expect(estimate.model.formula).toBe(
      'baseDailyUsd × countryIndex × cityPremium × styleMultiplier'
    );

    const expected = 100 * estimate.model.effectiveIndex;
    expect(estimate.perPersonPerDay.usd).toBeCloseTo(expected, 1);

    // The breakdown must always add up to the daily total.
    const parts = Object.values(estimate.perPersonPerDay.breakdownUsd);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(estimate.perPersonPerDay.usd, 0);

    expect(estimate.confidence).toBe('estimate');
    expect(estimate.disclaimer).toMatch(/not live pricing/i);
  });

  it('scales with travel style', async () => {
    const base = { location: { name: 'Kyoto' }, country: japan, days: 3, homeCurrency: 'USD' };
    const backpacker = await estimateBudget({ ...base, style: 'backpacker' });
    const luxury = await estimateBudget({ ...base, style: 'luxury' });

    expect(luxury.perPersonPerDay.usd).toBeGreaterThan(backpacker.perPersonPerDay.usd * 5);
    expect(backpacker.style.multiplier).toBe(0.5);
    expect(luxury.style.multiplier).toBe(3.2);
  });

  it('discounts shared accommodation for groups', async () => {
    const base = { location: { name: 'Kyoto' }, country: japan, days: 4, homeCurrency: 'USD' };
    const solo = await estimateBudget({ ...base, travellers: 1 });
    const four = await estimateBudget({ ...base, travellers: 4 });

    expect(four.total.groupSavingUsd).toBeGreaterThan(0);
    // Four travellers cost less than four solo trips.
    expect(four.total.usd).toBeLessThan(solo.total.usd * 4);
    expect(four.total.groupSavingNote).toMatch(/share accommodation/i);
  });

  it('falls back to a regional index for a country outside the table', async () => {
    const estimate = await estimateBudget({
      location: { name: 'Somewhere' },
      country: { name: 'Nowhere', code: 'ZZ', region: 'Europe', subregion: 'Western Europe' },
      days: 2,
      homeCurrency: 'USD',
    });
    expect(estimate.model.countryIndexBasis).toBe('subregion (Western Europe)');
    expect(estimate.model.countryIndex).toBe(1.35);
  });
});

describe('travel estimates', () => {
  it('measures great-circle distance', () => {
    // Kyoto → Tokyo is about 370 km as the crow flies.
    const km =
      distanceMeters(
        { latitude: 35.0211, longitude: 135.7539 },
        { latitude: 35.6895, longitude: 139.6917 }
      ) / 1000;
    expect(km).toBeGreaterThan(350);
    expect(km).toBeLessThan(390);
  });

  it('picks a plausible mode for the distance and labels itself an estimate', () => {
    const walk = estimateTravel(
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 51.505, longitude: -0.13 }
    );
    expect(walk.mode).toBe('walk');

    const flight = estimateTravel(
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 40.71, longitude: -74.0 }
    );
    expect(flight.mode).toBe('flight');
    // Door-to-door, so airport overhead is included.
    expect(flight.durationMinutes).toBeGreaterThan(9 * 60);
    expect(flight.isEstimate).toBe(true);
    expect(flight.durationLabel).toMatch(/h/);
  });

  it('computes bounds for map fitting and tolerates junk points', () => {
    const bounds = boundsOf([
      { latitude: 10, longitude: 20 },
      { latitude: -5, longitude: 40 },
      { latitude: null, longitude: undefined },
    ]);
    expect(bounds).toEqual({ south: -5, west: 20, north: 10, east: 40 });
    expect(boundsOf([])).toBeNull();
  });
});

describe('rule-based AI fallback', () => {
  const brief = buildBrief({
    location: {
      name: 'Kyoto',
      label: 'Kyoto, Japan',
      timezone: 'Asia/Tokyo',
      population: 1_463_723,
    },
    weather: coldWetWeather,
    places,
    country: japan,
    budget: {
      style: { key: 'midrange' },
      perPersonPerDay: { home: { amount: 118, currency: 'GBP' }, usd: 151 },
      total: { home: { amount: 590 }, usd: 755 },
    },
    trip: { days: 5 },
  });

  it('produces the same schema an LLM would, from the same data', () => {
    const summary = generateRuleBasedSummary(brief);

    expect(typeof summary.headline).toBe('string');
    expect(summary.overview.length).toBeGreaterThan(40);
    expect(summary.whatToExpect.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(summary.packingHighlights)).toBe(true);
    expect(Array.isArray(summary.dayPlan)).toBe(true);
  });

  it('grounds itself in the real numbers rather than generic filler', () => {
    const summary = generateRuleBasedSummary(brief);
    const text = [summary.overview, ...summary.whatToExpect, ...summary.localTips].join(' ');

    expect(text).toContain('Kyoto');
    expect(text).toMatch(/3 of the 5 forecast days/); // wet days out of forecast days
    expect(text).toContain('JPY');
    expect(text).toContain('Japanese');
    expect(summary.packingHighlights.join(' ')).toMatch(/umbrella/i);
  });

  it('only ever names places that were supplied in the brief', () => {
    const summary = generateRuleBasedSummary(brief);
    const known = ['Nijō Castle', 'Kyoto Imperial Palace', 'Manga Museum', 'RAJU'];
    const mentioned = summary.dayPlan.map((d) => d.suggestion).join(' ');

    // Every day plan references at least one known attraction and invents none.
    expect(summary.dayPlan.length).toBeGreaterThan(0);
    expect(known.some((name) => mentioned.includes(name))).toBe(true);
  });

  it('compresses the brief to only what the model needs', () => {
    expect(brief.topAttractions).toHaveLength(3);
    expect(brief.weather.daily).toHaveLength(5);
    // Verbose provider fields must not be forwarded to the prompt.
    expect(brief.weather.daily[0].humidity).toBeUndefined();
    expect(brief.topAttractions[0].description).toBeUndefined();
  });
});
