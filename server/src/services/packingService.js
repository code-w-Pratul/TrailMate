import { WET_CONDITIONS, COLD_CONDITIONS } from './normalizers/weatherCodes.js';

/**
 * Packing list generator — deterministic, rule-based, zero dependencies.
 *
 * Why rules and not "just ask the LLM": a packing list is a *derivation*, not a
 * creative task. Rules are reproducible, instant, free, testable, and they
 * cannot hallucinate an item. The LLM layer sits on top to add colour and
 * destination-specific advice; if it is unavailable, the list is still complete
 * and correct. Every item carries the `reason` that triggered it, so the UI can
 * explain itself ("umbrella — rain expected on 3 of 5 days").
 */

/* -------------------------------------------------------------------------- */
/* Plug / voltage reference for common destinations                            */
/* -------------------------------------------------------------------------- */

const PLUGS = {
  US: 'A/B (120 V)',
  CA: 'A/B (120 V)',
  MX: 'A/B (127 V)',
  JP: 'A/B (100 V)',
  GB: 'G (230 V)',
  IE: 'G (230 V)',
  MT: 'G (230 V)',
  CY: 'G (230 V)',
  AE: 'G (230 V)',
  SG: 'G (230 V)',
  MY: 'G (240 V)',
  HK: 'G (220 V)',
  IN: 'C/D/M (230 V)',
  LK: 'D/G (230 V)',
  NP: 'C/D/M (230 V)',
  PK: 'C/D (230 V)',
  FR: 'C/E (230 V)',
  BE: 'C/E (230 V)',
  PL: 'C/E (230 V)',
  CZ: 'C/E (230 V)',
  DE: 'C/F (230 V)',
  ES: 'C/F (230 V)',
  PT: 'C/F (230 V)',
  NL: 'C/F (230 V)',
  AT: 'C/F (230 V)',
  SE: 'C/F (230 V)',
  NO: 'C/F (230 V)',
  FI: 'C/F (230 V)',
  GR: 'C/F (230 V)',
  HR: 'C/F (230 V)',
  HU: 'C/F (230 V)',
  TR: 'C/F (230 V)',
  RU: 'C/F (230 V)',
  ID: 'C/F (230 V)',
  TH: 'A/B/C (230 V)',
  VN: 'A/C (220 V)',
  IT: 'C/F/L (230 V)',
  CH: 'C/J (230 V)',
  DK: 'C/E/F/K (230 V)',
  AU: 'I (230 V)',
  NZ: 'I (230 V)',
  CN: 'A/C/I (220 V)',
  AR: 'C/I (220 V)',
  BR: 'C/N (127–220 V)',
  ZA: 'D/M/N (230 V)',
  KR: 'C/F (220 V)',
  IL: 'C/H (230 V)',
  EG: 'C/F (220 V)',
  MA: 'C/E (220 V)',
  KE: 'G (240 V)',
  PE: 'A/C (220 V)',
  CL: 'C/L (220 V)',
  CO: 'A/B (110 V)',
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const CATEGORY_ORDER = [
  'documents',
  'clothing',
  'footwear',
  'weather',
  'health',
  'electronics',
  'money',
  'daypack',
  'extras',
];

/** Cap repeated garments so a 3-week trip does not suggest 21 pairs of socks. */
const perDay = (days, max = 8) => Math.min(Math.max(days, 1), max);

/* -------------------------------------------------------------------------- */
/* Rule engine                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} input
 * @param {object} [input.weather]  normalised weather payload
 * @param {object} [input.country]  normalised country payload
 * @param {object} [input.places]   normalised places payload
 * @param {number} [input.days]     trip length; defaults to the forecast length
 * @param {string} [input.homeCountryCode]
 * @param {string} [input.homeCurrency]
 * @param {string[]} [input.activities] optional user-selected activities
 */
export function generatePackingList({
  weather = null,
  country = null,
  places = null,
  days,
  homeCountryCode = null,
  homeCurrency = null,
  activities = [],
} = {}) {
  const summary = weather?.summary ?? {};
  const daily = weather?.daily ?? [];
  const tripDays = Math.max(1, Math.round(Number(days) || summary.days || daily.length || 3));

  /** @type {Array<{item:string, category:string, reason:string, essential:boolean, quantity?:number}>} */
  const items = [];
  const add = (item, category, reason, { essential = false, quantity } = {}) => {
    // First rule to claim an item wins, so its reason is the most specific one.
    if (items.some((existing) => existing.item.toLowerCase() === item.toLowerCase())) return;
    items.push({ item, category, reason, essential, ...(quantity ? { quantity } : {}) });
  };

  const isInternational = Boolean(
    country?.code && homeCountryCode && country.code !== homeCountryCode
  );

  /* --- Always-on essentials --------------------------------------------- */
  add(isInternational ? 'Passport' : 'Photo ID', 'documents', 'Required to travel', {
    essential: true,
  });
  add('Phone + charging cable', 'electronics', 'Maps, tickets and bookings live on it', {
    essential: true,
  });
  add('Wallet with debit/credit card', 'money', 'Primary payment method', { essential: true });
  add('Any prescription medication', 'health', 'Not always available at your destination', {
    essential: true,
  });
  add('Reusable water bottle', 'extras', 'Cheaper than buying bottled water daily');
  add('Toiletries kit', 'extras', 'Basic hygiene');
  add('Underwear', 'clothing', `About one set per day (${tripDays}-day trip)`, {
    quantity: perDay(tripDays),
  });
  add('Socks', 'clothing', `About one pair per day (${tripDays}-day trip)`, {
    quantity: perDay(tripDays),
  });

  /* --- Temperature bands ------------------------------------------------ */
  const maxC = summary.maxC ?? summary.avgMaxC ?? null;
  const minC = summary.minC ?? summary.avgMinC ?? null;

  if (minC !== null && minC <= 0) {
    add('Insulated winter boots', 'footwear', `Lows around ${minC}°C — below freezing`, {
      essential: true,
    });
    add('Thermal base layers', 'clothing', `Lows around ${minC}°C`, { essential: true });
    add('Gloves', 'clothing', 'Sub-zero temperatures forecast');
    add('Beanie or warm hat', 'clothing', 'Sub-zero temperatures forecast');
    add('Scarf or neck gaiter', 'clothing', 'Wind chill below freezing');
    add('Lip balm', 'health', 'Cold, dry air chaps lips fast');
  } else if (minC !== null && minC <= 7) {
    add('Warm coat', 'clothing', `Lows around ${minC}°C`, { essential: true });
    add('Sweater or fleece', 'clothing', 'Cool mornings and evenings');
    add('Gloves', 'clothing', `Lows around ${minC}°C`);
  }

  if (maxC !== null) {
    if (maxC <= 12) {
      add('Long-sleeve tops', 'clothing', `Highs only around ${maxC}°C`, {
        quantity: Math.ceil(perDay(tripDays) / 2),
      });
      add('Warm trousers', 'clothing', 'Cold daytime temperatures');
    } else if (maxC <= 20) {
      add('Light jacket', 'clothing', `Mild highs around ${maxC}°C`, { essential: true });
      add('Layerable long sleeves', 'clothing', 'Comfortable across a 10°C daily swing', {
        quantity: Math.ceil(perDay(tripDays) / 2),
      });
    } else if (maxC <= 28) {
      add('T-shirts', 'clothing', `Warm highs around ${maxC}°C`, {
        quantity: perDay(tripDays, 7),
      });
      add('Sunglasses', 'extras', 'Bright, warm days ahead');
      add('Sunscreen SPF 30+', 'health', `Highs around ${maxC}°C`);
      add('Light layer for evenings', 'clothing', `Evenings drop to about ${minC ?? '—'}°C`);
    } else {
      add('Breathable, loose clothing', 'clothing', `Hot highs around ${maxC}°C`, {
        essential: true,
      });
      add('Sun hat', 'clothing', 'Extended sun exposure');
      add('Sunscreen SPF 50', 'health', `Highs above 28°C (${maxC}°C forecast)`, {
        essential: true,
      });
      add('Electrolyte sachets', 'health', 'Heat plus sightseeing dehydrates quickly');
      add('Cooling towel', 'extras', 'Genuinely helps above 30°C');
    }
  }

  /* --- Precipitation ---------------------------------------------------- */
  const wetDays = summary.wetDays ?? daily.filter((d) => WET_CONDITIONS.has(d.condition)).length;
  const rainChance = summary.rainChanceMax ?? 0;

  if (wetDays > 0 || rainChance >= 50) {
    const reason =
      wetDays > 0
        ? `Rain expected on ${wetDays} of ${daily.length || tripDays} forecast days`
        : `Up to ${rainChance}% chance of rain`;
    add('Compact umbrella', 'weather', reason, { essential: wetDays >= 2 });
    add('Waterproof jacket', 'weather', reason);
    add('Dry bag or zip pouch for electronics', 'weather', 'Keeps phone and charger dry');
    if (wetDays >= Math.ceil((daily.length || tripDays) / 2)) {
      add('Quick-dry footwear', 'footwear', 'More than half the trip looks wet');
      add('Spare set of socks in your daypack', 'clothing', 'Wet feet ruin a sightseeing day');
    }
  }

  const snowy = daily.some((d) => COLD_CONDITIONS.has(d.condition));
  if (snowy) {
    add('Waterproof snow boots', 'footwear', 'Snow or freezing rain in the forecast', {
      essential: true,
    });
    add('Slip-on ice grips', 'footwear', 'Icy pavements are the usual holiday injury');
  }

  /* --- Wind, UV, humidity ---------------------------------------------- */
  if ((summary.windKphMax ?? 0) >= 40) {
    add('Windbreaker', 'weather', `Gusts up to ${summary.windKphMax} km/h`);
  }
  const maxUv = Math.max(0, ...daily.map((d) => d.uvIndex ?? 0));
  if (maxUv >= 6) {
    add('Sunscreen SPF 50', 'health', `UV index reaches ${maxUv}`, { essential: true });
    add('Sunglasses', 'extras', `UV index reaches ${maxUv}`);
  }
  const avgHumidity =
    daily.length && daily.some((d) => d.humidity !== null)
      ? Math.round(
          daily.reduce((s, d) => s + (d.humidity ?? 0), 0) /
            daily.filter((d) => d.humidity !== null).length
        )
      : null;
  if (avgHumidity !== null && avgHumidity >= 75 && (maxC ?? 0) >= 24) {
    add('Moisture-wicking shirts', 'clothing', `Humid conditions (~${avgHumidity}%)`);
    add('Anti-chafe balm', 'health', 'Hot and humid walking days');
  }

  /* --- What the destination is actually like ---------------------------- */
  const categories = places?.counts?.byCategory ?? {};
  const outdoorish =
    (categories.park ?? 0) + (categories.viewpoint ?? 0) + (categories.historic ?? 0);

  if ((places?.counts?.attractions ?? 0) > 0) {
    add('Comfortable walking shoes', 'footwear', 'Sightseeing means a lot of steps', {
      essential: true,
    });
    add('Daypack', 'daypack', 'Carries water, layers and souvenirs');
    add('Power bank', 'electronics', 'Maps and photos drain a phone by mid-afternoon');
  }
  if (outdoorish >= 3) {
    add('Refillable snack pouch', 'daypack', 'Parks and viewpoints are short on shops');
  }
  if ((categories.museum ?? 0) + (categories.gallery ?? 0) >= 2) {
    add('Foldable tote', 'daypack', 'Many museums require bags to be checked');
  }
  if ((categories.restaurant ?? 0) + (categories.cafe ?? 0) >= 5) {
    add('One smart-casual outfit', 'clothing', 'Some restaurants expect more than shorts');
  }

  /* --- International logistics ----------------------------------------- */
  if (isInternational) {
    const plug = country?.code ? PLUGS[country.code] : null;
    add(
      plug ? `Plug adapter — type ${plug}` : 'Universal travel adapter',
      'electronics',
      plug
        ? `${country?.name ?? 'This country'} uses type ${plug}`
        : 'Socket type differs from home',
      { essential: true }
    );
    add('Travel insurance details', 'documents', 'Cross-border medical cover', { essential: true });
    add('Offline map of the city', 'electronics', 'Roaming data is not guaranteed');

    const localCurrency = country?.primaryCurrency?.code;
    if (localCurrency && localCurrency !== homeCurrency) {
      add(
        `Small amount of ${localCurrency} cash`,
        'money',
        `${country?.name ?? 'Your destination'} uses ${localCurrency}; cards are not accepted everywhere`
      );
    }
    if (country?.primaryLanguage) {
      add(
        'Offline translation app',
        'electronics',
        `${country.primaryLanguage} is the main language`
      );
    }
    if (country?.drivingSide && country.drivingSide !== 'right') {
      add('Note: traffic drives on the left', 'documents', 'Look right first when crossing');
    }
  }

  /* --- Trip length ------------------------------------------------------ */
  if (tripDays >= 7) {
    add('Laundry detergent sheets', 'extras', `${tripDays}-day trip — you will need a wash`);
    add('Packing cubes', 'extras', 'Keeps a long trip organised');
  }
  if (tripDays >= 4) {
    add('Basic first-aid kit', 'health', 'Plasters, painkillers, antihistamine');
  }

  /* --- Optional user activities ----------------------------------------- */
  const activityRules = {
    hiking: [
      ['Hiking boots', 'footwear', 'You listed hiking'],
      ['Blister plasters', 'health', 'You listed hiking'],
    ],
    swimming: [
      ['Swimwear', 'clothing', 'You listed swimming'],
      ['Quick-dry towel', 'extras', 'You listed swimming'],
    ],
    business: [
      ['Formal outfit', 'clothing', 'You listed business'],
      ['Laptop + charger', 'electronics', 'You listed business'],
    ],
    photography: [
      ['Camera + spare battery', 'electronics', 'You listed photography'],
      ['Memory cards', 'electronics', 'You listed photography'],
    ],
    beach: [
      ['Flip-flops', 'footwear', 'You listed the beach'],
      ['After-sun lotion', 'health', 'You listed the beach'],
    ],
    skiing: [
      ['Ski goggles', 'extras', 'You listed skiing'],
      ['Thermal socks', 'clothing', 'You listed skiing'],
    ],
  };
  for (const activity of activities) {
    for (const [item, category, reason] of activityRules[String(activity).toLowerCase()] ?? []) {
      add(item, category, reason, { essential: false });
    }
  }

  /* --- Group and return ------------------------------------------------- */
  const grouped = CATEGORY_ORDER.map((name) => ({
    name,
    label: name[0].toUpperCase() + name.slice(1),
    items: items.filter((i) => i.category === name),
  })).filter((group) => group.items.length);

  return {
    generatedBy: 'rules',
    tripDays,
    basis: {
      minC,
      maxC,
      wetDays,
      rainChanceMax: summary.rainChanceMax ?? null,
      maxUvIndex: maxUv || null,
      dominantCondition: summary.dominantCondition ?? null,
      isInternational,
      forecastDays: daily.length,
    },
    categories: grouped,
    items,
    totals: {
      items: items.length,
      essentials: items.filter((i) => i.essential).length,
      categories: grouped.length,
    },
    note:
      daily.length && daily.length < tripDays
        ? `Forecast covers the first ${daily.length} day(s) of a ${tripDays}-day trip; later days use the same conditions.`
        : null,
  };
}

export default { generatePackingList };
