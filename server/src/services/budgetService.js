import { convertCurrency } from './currencyService.js';
import logger from '../lib/logger.js';

/**
 * Daily budget estimator.
 *
 * Numbeo's API is paywalled beyond a token free tier, so rather than pretend to
 * have live cost-of-living data, TrailMate uses a **transparent, documented
 * model** and says so in the response:
 *
 *     daily cost = BASE × countryIndex × cityPremium × styleMultiplier
 *
 * `BASE` is one mid-range traveller-day at a global-average destination. The
 * country index is a static table (1.0 = that global average), the city premium
 * scales with population and capital status, and the style multiplier spans
 * backpacker to luxury. The result is then converted into both the destination
 * currency and the user's home currency using live ECB rates.
 *
 * Every input is echoed back in the response so the number is auditable rather
 * than magic — which is the honest way to ship an estimate.
 */

/** One mid-range traveller-day, in USD, at a global-average destination. */
const BASE_DAILY_USD = 100;

/** Relative daily cost for a mid-range traveller. 1.0 ≈ USD 100/day. */
const COUNTRY_INDEX = {
  // Europe
  CH: 1.85,
  IS: 1.8,
  NO: 1.75,
  DK: 1.55,
  LU: 1.5,
  GB: 1.45,
  IE: 1.4,
  NL: 1.4,
  FR: 1.4,
  SE: 1.35,
  FI: 1.35,
  BE: 1.3,
  AT: 1.3,
  DE: 1.25,
  IT: 1.2,
  ES: 1.05,
  MT: 1.05,
  CY: 1.0,
  GR: 0.95,
  SI: 0.95,
  PT: 0.95,
  HR: 0.9,
  EE: 0.9,
  LV: 0.85,
  CZ: 0.85,
  LT: 0.8,
  SK: 0.8,
  PL: 0.75,
  HU: 0.75,
  ME: 0.7,
  RO: 0.7,
  BG: 0.65,
  RS: 0.6,
  RU: 0.6,
  BA: 0.55,
  AL: 0.55,
  MK: 0.55,
  TR: 0.55,
  UA: 0.45,
  // Americas
  US: 1.55,
  BS: 1.6,
  CA: 1.35,
  JM: 0.95,
  BB: 1.3,
  UY: 0.85,
  CR: 0.85,
  CL: 0.8,
  PA: 0.8,
  DO: 0.75,
  MX: 0.65,
  BR: 0.65,
  CU: 0.65,
  AR: 0.6,
  EC: 0.55,
  GT: 0.55,
  PE: 0.5,
  CO: 0.5,
  PY: 0.45,
  BO: 0.4,
  // Asia-Pacific
  AU: 1.45,
  SG: 1.4,
  HK: 1.35,
  NZ: 1.3,
  JP: 1.2,
  KR: 1.05,
  MV: 1.7,
  BT: 0.9,
  TW: 0.85,
  FJ: 0.85,
  CN: 0.7,
  MY: 0.55,
  MN: 0.5,
  TH: 0.5,
  ID: 0.45,
  PH: 0.45,
  VN: 0.4,
  KH: 0.4,
  LA: 0.4,
  MM: 0.4,
  LK: 0.4,
  IN: 0.35,
  NP: 0.35,
  PK: 0.35,
  BD: 0.35,
  KZ: 0.55,
  UZ: 0.4,
  // Middle East
  IL: 1.45,
  QA: 1.3,
  AE: 1.25,
  KW: 1.05,
  BH: 1.0,
  SA: 0.95,
  OM: 0.9,
  JO: 0.75,
  LB: 0.7,
  // Africa
  SC: 1.4,
  MU: 0.9,
  BW: 0.7,
  NA: 0.65,
  ZA: 0.6,
  KE: 0.6,
  TZ: 0.6,
  GH: 0.55,
  SN: 0.55,
  MA: 0.55,
  ZW: 0.55,
  MZ: 0.55,
  RW: 0.5,
  NG: 0.5,
  UG: 0.5,
  TN: 0.45,
  DZ: 0.45,
  ET: 0.45,
  EG: 0.4,
};

/** Used when a country is not in the table — better than defaulting to 1.0. */
const SUBREGION_INDEX = {
  'Northern Europe': 1.45,
  'Western Europe': 1.35,
  'Southern Europe': 1.05,
  'Central Europe': 0.85,
  'Eastern Europe': 0.7,
  'North America': 1.45,
  'Central America': 0.65,
  'South America': 0.6,
  Caribbean: 0.95,
  'Eastern Asia': 1.0,
  'South-Eastern Asia': 0.5,
  'Southern Asia': 0.38,
  'Western Asia': 1.0,
  'Central Asia': 0.5,
  'Northern Africa': 0.45,
  'Sub-Saharan Africa': 0.55,
  'Eastern Africa': 0.55,
  'Western Africa': 0.55,
  'Southern Africa': 0.6,
  'Middle Africa': 0.55,
  'Australia and New Zealand': 1.4,
  Melanesia: 0.85,
  Polynesia: 1.1,
  Micronesia: 1.0,
};

const REGION_INDEX = {
  Europe: 1.05,
  Americas: 0.85,
  Asia: 0.65,
  Africa: 0.55,
  Oceania: 1.3,
};

/** Travel style multipliers, applied to the mid-range baseline. */
export const TRAVEL_STYLES = Object.freeze({
  backpacker: { multiplier: 0.5, label: 'Backpacker — hostels, street food, transit' },
  budget: { multiplier: 0.7, label: 'Budget — guesthouses, casual meals' },
  midrange: { multiplier: 1.0, label: 'Mid-range — 3★ hotels, restaurant meals' },
  comfort: { multiplier: 1.7, label: 'Comfort — 4★ hotels, taxis, paid tours' },
  luxury: { multiplier: 3.2, label: 'Luxury — 5★ hotels, fine dining, private guides' },
});

/** How a traveller-day divides up. Kept fixed so the breakdown is explainable. */
const SHARES = Object.freeze({
  accommodation: 0.42,
  food: 0.26,
  activities: 0.16,
  localTransport: 0.09,
  misc: 0.07,
});

/* -------------------------------------------------------------------------- */
/* Index resolution                                                            */
/* -------------------------------------------------------------------------- */

function resolveCountryIndex(country) {
  if (country?.code && COUNTRY_INDEX[country.code]) {
    return { value: COUNTRY_INDEX[country.code], basis: `country table (${country.code})` };
  }
  if (country?.subregion && SUBREGION_INDEX[country.subregion]) {
    return { value: SUBREGION_INDEX[country.subregion], basis: `subregion (${country.subregion})` };
  }
  if (country?.region && REGION_INDEX[country.region]) {
    return { value: REGION_INDEX[country.region], basis: `region (${country.region})` };
  }
  return { value: 0.85, basis: 'global fallback' };
}

/**
 * Big cities and capitals cost more than the national average.
 * Capped so the premium never dominates the estimate.
 */
function resolveCityPremium({ location, country }) {
  let premium = 1;
  const reasons = [];

  const population = Number(location?.population) || null;
  if (population) {
    if (population >= 10_000_000) {
      premium *= 1.15;
      reasons.push('mega-city (10M+)');
    } else if (population >= 5_000_000) {
      premium *= 1.1;
      reasons.push('large city (5M+)');
    } else if (population >= 1_000_000) {
      premium *= 1.05;
      reasons.push('major city (1M+)');
    }
  }

  const cityName = String(location?.name ?? '').toLowerCase();
  const capital = String(country?.capital ?? '').toLowerCase();
  if (capital && cityName && capital === cityName) {
    premium *= 1.05;
    reasons.push('capital city');
  }

  return {
    value: Math.round(Math.min(premium, 1.25) * 1000) / 1000,
    reasons: reasons.length ? reasons : ['national average'],
  };
}

/* -------------------------------------------------------------------------- */
/* Money helpers                                                               */
/* -------------------------------------------------------------------------- */

const money = (n) => Math.round(Number(n) * 100) / 100;
const whole = (n) => Math.round(Number(n));

function breakdownOf(dailyAmount) {
  return Object.fromEntries(
    Object.entries(SHARES).map(([key, share]) => [key, money(dailyAmount * share)])
  );
}

/**
 * Convert a USD figure into `code`. Returns null (with a reason) when the pair
 * is not priced by the ECB, so the UI can show "USD only" instead of an error.
 */
async function toCurrency(usdAmount, code) {
  if (!code) return null;
  if (code === 'USD') {
    return { currency: 'USD', rate: 1, amount: money(usdAmount), supported: true };
  }
  try {
    const { data } = await convertCurrency({ from: 'USD', to: code, amount: usdAmount });
    return { currency: code, rate: data.rate, amount: money(data.converted), supported: true };
  } catch (error) {
    logger.debug(`budget conversion USD→${code} unavailable`, { message: error.message });
    return { currency: code, rate: null, amount: null, supported: false, reason: error.message };
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} input
 * @param {object} input.location  resolved location (name, population)
 * @param {object} [input.country] normalised country payload
 * @param {number} [input.days]
 * @param {number} [input.travellers]
 * @param {keyof typeof TRAVEL_STYLES} [input.style]
 * @param {string} [input.homeCurrency]
 */
export async function estimateBudget({
  location,
  country = null,
  days = 5,
  travellers = 1,
  style = 'midrange',
  homeCurrency = 'USD',
} = {}) {
  const styleKey = TRAVEL_STYLES[style] ? style : 'midrange';
  const styleDef = TRAVEL_STYLES[styleKey];

  const tripDays = Math.min(Math.max(Math.round(Number(days) || 5), 1), 365);
  const people = Math.min(Math.max(Math.round(Number(travellers) || 1), 1), 20);

  const countryIndex = resolveCountryIndex(country);
  const cityPremium = resolveCityPremium({ location, country });

  const effectiveIndex =
    Math.round(countryIndex.value * cityPremium.value * styleDef.multiplier * 1000) / 1000;

  const perPersonPerDayUsd = money(BASE_DAILY_USD * effectiveIndex);
  const totalUsd = money(perPersonPerDayUsd * tripDays * people);

  /* Accommodation is per-room, not per-person: sharing a room is the single
     biggest saving, so modelling it as fully per-person would overstate group
     trips by a wide margin. */
  const sharedRoomSaving =
    people > 1
      ? money(perPersonPerDayUsd * SHARES.accommodation * (people - 1) * 0.4 * tripDays)
      : 0;
  const adjustedTotalUsd = money(totalUsd - sharedRoomSaving);

  const destinationCurrencyCode = country?.primaryCurrency?.code ?? null;
  const [home, destinationCurrency] = await Promise.all([
    toCurrency(perPersonPerDayUsd, homeCurrency),
    destinationCurrencyCode ? toCurrency(perPersonPerDayUsd, destinationCurrencyCode) : null,
  ]);

  const homeTotal = home?.rate ? money(adjustedTotalUsd * home.rate) : null;
  const destinationTotal = destinationCurrency?.rate
    ? money(adjustedTotalUsd * destinationCurrency.rate)
    : null;

  return {
    destination: {
      city: location?.name ?? null,
      country: country?.name ?? null,
      countryCode: country?.code ?? null,
    },
    style: { key: styleKey, label: styleDef.label, multiplier: styleDef.multiplier },
    trip: { days: tripDays, travellers: people },

    model: {
      baseDailyUsd: BASE_DAILY_USD,
      countryIndex: countryIndex.value,
      countryIndexBasis: countryIndex.basis,
      cityPremium: cityPremium.value,
      cityPremiumReasons: cityPremium.reasons,
      styleMultiplier: styleDef.multiplier,
      effectiveIndex,
      formula: 'baseDailyUsd × countryIndex × cityPremium × styleMultiplier',
      shares: SHARES,
    },

    perPersonPerDay: {
      usd: perPersonPerDayUsd,
      breakdownUsd: breakdownOf(perPersonPerDayUsd),
      home: home ? { ...home, breakdown: home.amount ? breakdownOf(home.amount) : null } : null,
      destination: destinationCurrency
        ? {
            ...destinationCurrency,
            breakdown: destinationCurrency.amount ? breakdownOf(destinationCurrency.amount) : null,
          }
        : null,
    },

    total: {
      usd: adjustedTotalUsd,
      home: homeTotal === null ? null : { currency: homeCurrency, amount: homeTotal },
      destination:
        destinationTotal === null
          ? null
          : { currency: destinationCurrencyCode, amount: destinationTotal },
      groupSavingUsd: sharedRoomSaving || null,
      groupSavingNote:
        people > 1
          ? 'Assumes travellers share accommodation, which cuts the per-person room cost.'
          : null,
    },

    rounded: {
      perDayUsd: whole(perPersonPerDayUsd),
      totalUsd: whole(adjustedTotalUsd),
    },

    confidence: 'estimate',
    disclaimer:
      'A transparent model, not live pricing. Actual costs vary with season, ' +
      'booking date and personal habits — treat it as a planning starting point.',
  };
}

export default { estimateBudget, TRAVEL_STYLES };
