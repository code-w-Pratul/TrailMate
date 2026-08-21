import config from '../config/env.js';
import logger from '../lib/logger.js';
import { createUpstreamClient } from '../lib/httpClient.js';
import { cacheKey, wrapWithFallback } from '../cache/index.js';
import { isBudgetExhausted } from '../lib/apiUsage.js';
import { distanceMeters, boundsOf } from '../lib/geo.js';
import { resolveCity } from './geocodeService.js';

/**
 * Points of interest.
 *
 * Provider chain, in order:
 *   1. **Geoapify Places** — when GEOAPIFY_API_KEY is set (3k credits/day).
 *   2. **Wikipedia GeoSearch + Nominatim** — the keyless default. Wikipedia
 *      supplies notable sights *with a thumbnail and a two-sentence summary*,
 *      Nominatim supplies food venues. Both are fast and dependable.
 *   3. **Overpass (OpenStreetMap)** — last resort only.
 *
 * Why Overpass is last rather than first: it is community-run and routinely
 * saturated. During development the public instances returned a 504 and a hard
 * timeout on a normal 5 km query, which is exactly the sort of thing you only
 * discover by actually calling the API. It stays in the chain because when it
 * *is* healthy it returns the richest tag data, but nothing depends on it.
 *
 * Every provider is normalised onto one closed category vocabulary, so the map
 * pins and list UI never learn which source answered.
 */

const geoapify = createUpstreamClient({
  provider: 'geoapify',
  baseURL: 'https://api.geoapify.com/v2',
});

const wikipedia = createUpstreamClient({
  provider: 'wikipedia',
  baseURL: 'https://en.wikipedia.org/w',
  metered: false,
});

const nominatim = createUpstreamClient({
  provider: 'nominatim',
  baseURL: 'https://nominatim.openstreetmap.org',
  metered: false,
  retries: 0,
  // Nominatim's usage policy requires an identifying User-Agent.
  headers: { 'User-Agent': 'TrailMate/1.0 (travel planner; contact: via GitHub repo)' },
});

const overpass = createUpstreamClient({
  provider: 'overpass',
  baseURL: 'https://overpass-api.de/api',
  metered: false,
  timeout: Math.max(config.UPSTREAM_TIMEOUT_MS, 12_000),
  retries: 0,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

/* -------------------------------------------------------------------------- */
/* Nominatim politeness gate                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Nominatim's terms allow at most one request per second. Rather than hope our
 * traffic stays under it, requests are serialised through this gate. Combined
 * with a 60-minute cache TTL, a busy dashboard makes a handful of calls an hour.
 */
const MIN_NOMINATIM_GAP_MS = 1100;
let nominatimQueue = Promise.resolve();
let lastNominatimAt = 0;

function politeNominatim(task) {
  const run = nominatimQueue.then(async () => {
    const wait = Math.max(0, lastNominatimAt + MIN_NOMINATIM_GAP_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimAt = Date.now();
    return task();
  });
  // Keep the chain alive even when a task rejects.
  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/* -------------------------------------------------------------------------- */
/* Category taxonomy                                                           */
/* -------------------------------------------------------------------------- */

export const CATEGORIES = Object.freeze([
  'attraction',
  'museum',
  'gallery',
  'historic',
  'viewpoint',
  'park',
  'zoo',
  'theme-park',
  'artwork',
  'restaurant',
  'cafe',
  'bar',
  'other',
]);

const FOOD_CATEGORIES = new Set(['restaurant', 'cafe', 'bar']);

const CATEGORY_LABELS = {
  attraction: 'Attraction',
  museum: 'Museum',
  gallery: 'Gallery',
  historic: 'Historic site',
  viewpoint: 'Viewpoint',
  park: 'Park',
  zoo: 'Zoo & aquarium',
  'theme-park': 'Theme park',
  artwork: 'Public art',
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  other: 'Other',
};

/** Geoapify category string → TrailMate category. First match wins. */
const GEOAPIFY_MAP = [
  ['catering.restaurant', 'restaurant'],
  ['catering.fast_food', 'restaurant'],
  ['catering.cafe', 'cafe'],
  ['catering.bar', 'bar'],
  ['catering.pub', 'bar'],
  ['entertainment.museum', 'museum'],
  ['entertainment.culture.gallery', 'gallery'],
  ['entertainment.zoo', 'zoo'],
  ['entertainment.aquarium', 'zoo'],
  ['entertainment.theme_park', 'theme-park'],
  ['tourism.attraction.viewpoint', 'viewpoint'],
  ['tourism.attraction.artwork', 'artwork'],
  ['tourism.sights.memorial', 'historic'],
  ['tourism.sights.castle', 'historic'],
  ['tourism.sights.ruines', 'historic'],
  ['tourism.sights.archaeological_site', 'historic'],
  ['tourism.sights.place_of_worship', 'historic'],
  ['tourism.sights', 'attraction'],
  ['tourism.attraction', 'attraction'],
  ['leisure.park', 'park'],
  ['natural', 'viewpoint'],
];

function categoryFromGeoapify(categories = []) {
  for (const [needle, mapped] of GEOAPIFY_MAP) {
    if (categories.some((c) => c === needle || c.startsWith(`${needle}.`))) return mapped;
  }
  return 'other';
}

function categoryFromOsmTags(tags = {}) {
  const { tourism, amenity, historic, leisure } = tags;
  if (amenity === 'restaurant' || amenity === 'fast_food') return 'restaurant';
  if (amenity === 'cafe') return 'cafe';
  if (amenity === 'bar' || amenity === 'pub') return 'bar';
  if (tourism === 'museum') return 'museum';
  if (tourism === 'gallery') return 'gallery';
  if (tourism === 'viewpoint') return 'viewpoint';
  if (tourism === 'zoo' || tourism === 'aquarium') return 'zoo';
  if (tourism === 'theme_park') return 'theme-park';
  if (tourism === 'artwork') return 'artwork';
  if (tourism === 'attraction') return 'attraction';
  if (historic) return 'historic';
  if (leisure === 'park' || leisure === 'garden') return 'park';
  return 'other';
}

/** Nominatim `type` (OSM value) → TrailMate category. */
function categoryFromNominatim(type) {
  return categoryFromOsmTags({
    amenity: ['restaurant', 'fast_food', 'cafe', 'bar', 'pub'].includes(type) ? type : undefined,
    tourism: [
      'museum',
      'gallery',
      'viewpoint',
      'zoo',
      'aquarium',
      'theme_park',
      'attraction',
    ].includes(type)
      ? type
      : undefined,
    leisure: ['park', 'garden'].includes(type) ? type : undefined,
  });
}

/* -------------------------------------------------------------------------- */
/* Provider: Geoapify                                                          */
/* -------------------------------------------------------------------------- */

const GEOAPIFY_CATEGORIES = [
  'tourism.sights',
  'tourism.attraction',
  'entertainment.museum',
  'entertainment.culture',
  'entertainment.zoo',
  'entertainment.theme_park',
  'leisure.park',
  'catering.restaurant',
  'catering.cafe',
].join(',');

async function fetchFromGeoapify(location, radiusM, limit) {
  const body = await geoapify.get('/places', {
    params: {
      categories: GEOAPIFY_CATEGORIES,
      filter: `circle:${location.longitude},${location.latitude},${radiusM}`,
      bias: `proximity:${location.longitude},${location.latitude}`,
      limit,
      lang: 'en',
      apiKey: config.GEOAPIFY_API_KEY,
    },
  });

  return (body?.features ?? [])
    .map((feature) => {
      const p = feature?.properties ?? {};
      const raw = p.datasource?.raw ?? {};
      const latitude = p.lat ?? feature?.geometry?.coordinates?.[1];
      const longitude = p.lon ?? feature?.geometry?.coordinates?.[0];
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      const category = categoryFromGeoapify(p.categories ?? []);
      return place({
        id: `ga:${p.place_id ?? `${latitude},${longitude}`}`,
        name: p.name ?? p.address_line1,
        category,
        rawCategories: p.categories ?? [],
        latitude,
        longitude,
        address: p.formatted ?? p.address_line2 ?? null,
        distanceM: p.distance ?? distanceMeters(location, { latitude, longitude }),
        website: p.website ?? raw.website ?? raw['contact:website'] ?? null,
        phone: p.contact?.phone ?? raw.phone ?? null,
        openingHours: p.opening_hours ?? raw.opening_hours ?? null,
        cuisine: splitList(raw.cuisine),
        wikidata: p.wiki_and_media?.wikidata ?? raw.wikidata ?? null,
        source: 'geoapify',
      });
    })
    .filter((p) => p && p.name);
}

/* -------------------------------------------------------------------------- */
/* Provider: Wikipedia GeoSearch (notable sights, keyless)                     */
/* -------------------------------------------------------------------------- */

/**
 * GeoSearch returns *articles* near a point, which includes things that are not
 * places — historical events, administrative areas, list pages. These filters
 * keep the list to things a traveller could actually stand in front of.
 */
const NON_PLACE_TITLE = new RegExp(
  [
    /* Events, not places */
    'incident',
    'rebellion',
    'battle of',
    'siege of',
    'massacre',
    'uprising',
    'coup',
    'bombing',
    'earthquake',
    'typhoon',
    'disaster',
    'riot',
    'protest',
    'treaty',
    'election',
    'scandal',
    'murder',
    'trial of',
    /* Meta articles */
    'timeline',
    '^list of',
    '^history of',
    '^culture of',
    '^economy of',
    '^geography of',
    '^outline of',
    '^\\d{4}',
    /* Administrative areas — you cannot visit a ward */
    'prefecture$',
    'metropolis$',
    '\\b(ward|borough|district|municipality|subdivision)\\b',
    '-ku,',
    '-shi,',
    '-cho,',
    /* Institutions and organisations that happen to have an address */
    '\\b(agency|ministry|bureau|commission|department of|embassy|consulate)\\b',
    '\\b(university|college|school|academy|kindergarten|campus)\\b',
    '\\b(hospital|clinic|prison|courthouse|police station|fire station)\\b',
    '\\b(corporation|company|holdings|co\\., ltd|inc\\.|group plc)\\b',
    '\\b(newspaper|broadcasting|television network|radio station)\\b',
    '\\b(federation|association|institute|instituto|foundation|society|council|union|committee|organisation|organization|syndicate|patriarchate|diocese|archdiocese)\\b',
    /* Transport infrastructure that is not itself a sight */
    '\\b(bus stop|bus terminal|car park|parking)\\b',
  ].join('|'),
  'i'
);

const WIKI_CATEGORY_RULES = [
  [/\b(railway station|train station|metro station|subway station|airport)\b/i, 'other'],
  [/\b(museum|memorial hall|treasure house)\b/i, 'museum'],
  [/\b(art gallery|gallery of art|pinacoteca)\b/i, 'gallery'],
  [/\b(zoo|aquarium|botanical garden)\b/i, 'zoo'],
  [/\b(theme park|amusement park|water park)\b/i, 'theme-park'],
  [/\b(park|garden|forest|riverside|promenade)\b/i, 'park'],
  /* `historic` deliberately precedes `viewpoint`: a hilltop castle is a
     historic site that happens to have a view, not a viewpoint that happens to
     have a castle. Rule order is the whole classification strategy here. */
  [
    /\b(temple|shrine|church|cathedral|basilica|chapel|mosque|synagogue|pagoda|monastery|convent|cloister|hermitage|abbey|castle|palace|fort|fortress|citadel|ruins|tomb|mausoleum|pantheon|monument|memorial|aqueduct|lighthouse|triumphal arch|obelisk|city walls|gate|bridge|villa|manor)\b/i,
    'historic',
  ],
  /* Generic landform words (hill, mount) are excluded: they appear in the intro
     of almost any elevated landmark and would swallow the historic category. */
  [
    /\b(tower|observatory|observation deck|viewpoint|belvedere|mirador|mountain|peak|summit|funicular|cable car|elevator|lift)\b/i,
    'viewpoint',
  ],
  [/\b(statue|sculpture|mural|fountain|column of)\b/i, 'artwork'],
  [/\b(theatre|theater|opera house|concert hall|stadium|arena|market|bazaar)\b/i, 'attraction'],
];

/**
 * Classify a Wikipedia article.
 *
 * `strong` records whether an explicit rule matched, as opposed to falling
 * through to the generic "attraction" bucket. Ranking uses it to float
 * confidently-typed sights (a temple, a castle, a museum) above articles we
 * merely failed to rule out.
 *
 * @returns {{ category: string, strong: boolean }}
 */
function categoryFromWikipedia(title, extract) {
  const haystack = `${title} ${extract ?? ''}`;
  for (const [pattern, category] of WIKI_CATEGORY_RULES) {
    if (pattern.test(haystack)) return { category, strong: category !== 'other' };
  }
  return { category: 'attraction', strong: false };
}

/**
 * GeoSearch centred on a city inevitably returns the city's own article, plus
 * its districts. Neither is a place to visit *within* the trip.
 */
function isSelfReference(title, location) {
  const t = title.trim().toLowerCase();
  const candidates = [location.name, location.region, location.country]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  return candidates.some((c) => t === c || t === `${c} city` || t.startsWith(`${c}, `));
}

/**
 * Wikipedia lookup, in three deliberate steps.
 *
 * The MediaWiki API paginates `prop` results independently of the generator: ask
 * for 50 nearby pages with extracts and images and you get 50 titles but only
 * ~20 extracts and ~10 of anything else, with a `continue` token. Code that
 * ignores that quietly ends up ranking mostly-empty records — which is exactly
 * how an early version of this served "Euronext Lisbon" ahead of São Jorge
 * Castle.
 *
 * So the work is split to respect each endpoint's real limits:
 *   1. `list=geosearch` — coordinates and distance for 50 candidates, unpaginated.
 *   2. `prop=info` — article byte length for all survivors in one call. Length is
 *      a solid notability proxy: a landmark's article dwarfs an office block's.
 *   3. `prop=extracts|pageimages` — descriptions and thumbnails for the top 20
 *      only, which is precisely the `extracts` batch limit.
 *
 * Three fast keyless calls, complete data, cached for an hour.
 */
async function fetchFromWikipedia(location, radiusM, limit) {
  /* --- Step 1: cast a wide net ------------------------------------------ */
  /* GeoSearch returns the *nearest* articles, and a dense city centre exhausts
     a 50-result limit within a few hundred metres — which is how São Jorge
     Castle, 1.9 km out, missed the list entirely on an earlier attempt. Asking
     for the full 500 covers the whole radius; the filtering below is what turns
     that into a shortlist. */
  const geo = await wikipedia.get('/api.php', {
    params: {
      action: 'query',
      format: 'json',
      formatversion: 2,
      list: 'geosearch',
      gscoord: `${location.latitude}|${location.longitude}`,
      gsradius: Math.min(radiusM, 10_000), // GeoSearch hard-caps at 10 km
      gslimit: 500,
      origin: '*',
    },
  });

  const candidates = (geo?.query?.geosearch ?? [])
    .filter(
      (entry) =>
        entry?.title &&
        Number.isFinite(entry.lat) &&
        Number.isFinite(entry.lon) &&
        !NON_PLACE_TITLE.test(entry.title) &&
        !isSelfReference(entry.title, location)
    )
    .map((entry) => ({ entry, ...categoryFromWikipedia(entry.title, null) }));

  if (!candidates.length) return [];

  /* --- Step 2: pick 50 to investigate ----------------------------------- */
  /* `prop=info` accepts at most 50 ids per anonymous request, so the pool has
     to be narrowed first. Confidently-typed places (a castle, a museum, a park)
     go in ahead of everything else regardless of distance; whatever room is
     left is backfilled with the nearest unclassified candidates. */
  const byDistance = (a, b) => (a.entry.dist ?? 0) - (b.entry.dist ?? 0);
  const strong = candidates.filter((c) => c.strong).sort(byDistance);
  const weak = candidates.filter((c) => !c.strong).sort(byDistance);
  const pool = [...strong, ...weak].slice(0, 50);

  /* --- Step 3: notability signal for the pool --------------------------- */
  const lengths = await fetchArticleLengths(pool.map((c) => c.entry.pageid));

  const ranked = pool
    .map((candidate) => ({
      ...candidate,
      articleLength: lengths.get(candidate.entry.pageid) ?? null,
      preScore:
        Math.min(((lengths.get(candidate.entry.pageid) ?? 0) / 1000) * 1.2, 30) +
        (candidate.strong ? 12 : 0) +
        (HEADLINE_CATEGORIES.has(candidate.category) ? 10 : 0) -
        Math.min(((candidate.entry.dist ?? 0) / 1000) * 2.5, 20),
    }))
    .sort((a, b) => b.preScore - a.preScore);

  /* --- Step 4: enrich only what we will actually show ------------------- */
  const shortlist = ranked.slice(0, Math.min(Math.max(limit * 2, 12), 20));
  const details = await fetchArticleDetails(shortlist.map((r) => r.entry.pageid));

  return shortlist.map(({ entry, articleLength }) => {
    const detail = details.get(entry.pageid) ?? {};
    // Re-classify with the extract in hand — the intro often names the type of
    // place ("… is a Gothic convent …") when the title does not.
    const { category, strong } = categoryFromWikipedia(entry.title, detail.extract);

    return place({
      id: `wiki:${entry.pageid}`,
      name: entry.title,
      category,
      rawCategories: ['wikipedia'],
      latitude: entry.lat,
      longitude: entry.lon,
      address: null,
      distanceM: Math.round(
        entry.dist ?? distanceMeters(location, { latitude: entry.lat, longitude: entry.lon })
      ),
      website: `https://en.wikipedia.org/?curid=${entry.pageid}`,
      description: cleanExtract(detail.extract),
      imageUrl: detail.thumbnail ?? null,
      notable: strong,
      popularity: articleLength,
      source: 'wikipedia',
    });
  });
}

/** `prop=info` is not batch-limited, so one call covers every candidate. */
async function fetchArticleLengths(pageIds) {
  const lengths = new Map();
  if (!pageIds.length) return lengths;

  try {
    const body = await wikipedia.get('/api.php', {
      params: {
        action: 'query',
        format: 'json',
        formatversion: 2,
        pageids: pageIds.join('|'),
        prop: 'info',
        origin: '*',
      },
    });
    for (const page of body?.query?.pages ?? []) {
      if (Number.isFinite(page.length)) lengths.set(page.pageid, page.length);
    }
  } catch (error) {
    // Ranking degrades to distance-only; still a usable list.
    logger.debug('Wikipedia info lookup failed', { message: error.message });
  }
  return lengths;
}

/** Extracts are capped at 20 pages per request — never ask for more. */
async function fetchArticleDetails(pageIds) {
  const details = new Map();
  if (!pageIds.length) return details;

  try {
    const body = await wikipedia.get('/api.php', {
      params: {
        action: 'query',
        format: 'json',
        formatversion: 2,
        pageids: pageIds.slice(0, 20).join('|'),
        prop: 'extracts|pageimages',
        exintro: 1,
        explaintext: 1,
        exsentences: 2,
        piprop: 'thumbnail',
        pithumbsize: 640,
        origin: '*',
      },
    });
    for (const page of body?.query?.pages ?? []) {
      details.set(page.pageid, {
        extract: page.extract ?? null,
        thumbnail: page.thumbnail?.source ?? null,
      });
    }
  } catch (error) {
    logger.debug('Wikipedia detail lookup failed', { message: error.message });
  }
  return details;
}

/** Strip the pronunciation/IPA clutter Wikipedia intros often open with. */
function cleanExtract(extract) {
  if (!extract) return null;
  return String(extract)
    .replace(/\s*\([^)]*(?:pronunciation|IPA|listen|Japanese:|Chinese:|Korean:)[^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 320);
}

/* -------------------------------------------------------------------------- */
/* Provider: Nominatim (food venues, keyless)                                  */
/* -------------------------------------------------------------------------- */

/** Convert a radius into the viewbox Nominatim expects. */
function viewboxFor(location, radiusM) {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(Math.cos((location.latitude * Math.PI) / 180), 0.01));
  const west = location.longitude - dLon;
  const east = location.longitude + dLon;
  const north = location.latitude + dLat;
  const south = location.latitude - dLat;
  return `${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)},${south.toFixed(5)}`;
}

async function fetchFoodFromNominatim(location, radiusM, limit) {
  const viewbox = viewboxFor(location, radiusM);

  const query = (term, cap) =>
    politeNominatim(() =>
      nominatim.get('/search', {
        params: {
          q: term,
          format: 'jsonv2',
          limit: cap,
          bounded: 1,
          viewbox,
          addressdetails: 1,
          extratags: 1,
        },
      })
    );

  /* Sequential, not parallel — see the politeness gate above. */
  const results = [];
  for (const [term, cap] of [
    ['restaurant', Math.min(limit, 25)],
    ['cafe', Math.min(Math.ceil(limit / 2), 15)],
  ]) {
    try {
      const body = await query(term, cap);
      results.push(...(Array.isArray(body) ? body : []));
    } catch (error) {
      logger.debug(`nominatim "${term}" lookup failed`, { message: error.message });
    }
  }

  return results
    .map((entry) => {
      const latitude = Number(entry.lat);
      const longitude = Number(entry.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !entry.name) return null;

      const category = categoryFromNominatim(entry.type);
      return place({
        id: `nom:${entry.osm_type?.[0] ?? 'n'}${entry.osm_id ?? entry.place_id}`,
        // Prefer the English name when OSM carries one — most travellers cannot
        // read the local script, and OSM often tags both.
        name: entry.extratags?.['name:en'] ?? entry.name,
        category: category === 'other' ? 'restaurant' : category,
        rawCategories: [entry.category, entry.type].filter(Boolean),
        latitude,
        longitude,
        address: composeNominatimAddress(entry.address) ?? entry.display_name ?? null,
        distanceM: distanceMeters(location, { latitude, longitude }),
        website: entry.extratags?.website ?? null,
        phone: entry.extratags?.phone ?? null,
        openingHours: entry.extratags?.opening_hours ?? null,
        cuisine: splitList(entry.extratags?.cuisine),
        source: 'openstreetmap',
      });
    })
    .filter(Boolean);
}

function composeNominatimAddress(address) {
  if (!address) return null;
  const parts = [
    [address.house_number, address.road].filter(Boolean).join(' '),
    address.neighbourhood ?? address.suburb,
    address.city ?? address.town ?? address.village,
    address.postcode,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/* -------------------------------------------------------------------------- */
/* Provider: Overpass (last resort)                                            */
/* -------------------------------------------------------------------------- */

function overpassQuery(location, radiusM) {
  const around = `around:${radiusM},${location.latitude},${location.longitude}`;
  return `
[out:json][timeout:20];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"](${around});
  nwr["historic"~"^(monument|memorial|castle|ruins)$"]["name"](${around});
  nwr["amenity"~"^(restaurant|cafe)$"]["name"](${around});
);
out center 120;`.trim();
}

async function fetchFromOverpass(location, radiusM, limit) {
  const body = await overpass.request({
    method: 'POST',
    url: '/interpreter',
    data: new URLSearchParams({ data: overpassQuery(location, radiusM) }).toString(),
  });

  const places = (body?.elements ?? [])
    .map((element) => {
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      const tags = element.tags ?? {};
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !tags.name) return null;

      const category = categoryFromOsmTags(tags);
      return place({
        id: `osm:${element.type}/${element.id}`,
        name: tags.name,
        category,
        rawCategories: [tags.tourism, tags.amenity, tags.historic, tags.leisure].filter(Boolean),
        latitude,
        longitude,
        address: composeOsmAddress(tags),
        distanceM: distanceMeters(location, { latitude, longitude }),
        website: tags.website ?? tags['contact:website'] ?? null,
        phone: tags.phone ?? null,
        openingHours: tags.opening_hours ?? null,
        cuisine: splitList(tags.cuisine),
        wikidata: tags.wikidata ?? null,
        source: 'openstreetmap',
      });
    })
    .filter(Boolean);

  return dedupe(places).slice(0, limit);
}

function composeOsmAddress(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const parts = [street, tags['addr:city'], tags['addr:postcode']].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/* -------------------------------------------------------------------------- */
/* Shared normalisation                                                        */
/* -------------------------------------------------------------------------- */

/** The single POI shape every provider must produce. */
function place({
  id,
  name,
  category,
  rawCategories = [],
  latitude,
  longitude,
  address = null,
  distanceM = null,
  website = null,
  phone = null,
  openingHours = null,
  cuisine = [],
  wikidata = null,
  description = null,
  imageUrl = null,
  notable = false,
  popularity = null,
  source,
}) {
  return {
    id,
    name: name?.trim() ?? null,
    category,
    categoryLabel: CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other,
    rawCategories,
    latitude,
    longitude,
    address,
    distanceM,
    website,
    phone,
    openingHours,
    cuisine,
    wikidata,
    description,
    imageUrl,
    notable,
    popularity,
    source,
  };
}

const splitList = (value) =>
  typeof value === 'string'
    ? value
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/** The same venue often appears twice across providers (or as node + way). */
function dedupe(places) {
  const seen = new Map();
  for (const item of places) {
    if (!item?.name) continue;
    const fingerprint = `${item.name.toLowerCase()}|${item.latitude.toFixed(3)}|${item.longitude.toFixed(3)}`;
    const existing = seen.get(fingerprint);
    // Prefer the richer record when duplicates collide.
    if (!existing || richness(item) > richness(existing)) seen.set(fingerprint, item);
  }
  return [...seen.values()];
}

const richness = (p) =>
  (p.description ? 3 : 0) + (p.imageUrl ? 3 : 0) + (p.website ? 2 : 0) + (p.address ? 1 : 0);

/**
 * Ranking. A place with a photo, a description and a nearby location is more
 * useful on a dashboard than an unlabelled node two suburbs away.
 */
/** Categories that represent a destination in their own right. */
const HEADLINE_CATEGORIES = new Set([
  'historic',
  'museum',
  'gallery',
  'park',
  'viewpoint',
  'zoo',
  'theme-park',
]);

function score(p) {
  let s = 0;

  /* `popularity` is the Wikipedia article's byte length — a proxy for how much
     the world has bothered to write about a place, and the signal that lets a
     famous monastery outrank a nearer office block. Capped at 30 so one very
     long article cannot dominate the whole list. */
  if (Number.isFinite(p.popularity) && p.popularity > 0) {
    s += Math.min((p.popularity / 1000) * 1.2, 30);
  }

  if (p.notable) s += 12;
  if (HEADLINE_CATEGORIES.has(p.category)) s += 10;
  if (p.imageUrl) s += 8;
  if (p.description) s += 6;
  if (p.website) s += 4;
  if (p.openingHours) s += 4;
  if (p.wikidata) s += 4;
  if (p.address) s += 2;
  // "other" survived every filter but matched no rule: keep it, rank it last.
  if (p.category === 'other') s -= 14;

  /* Distance still matters for a walkable itinerary, but it can no longer
     outrank fame — capped well below the popularity ceiling. */
  s -= Math.min(((p.distanceM ?? 0) / 1000) * 2.5, 20);
  return s;
}

function assemble({ location, radiusM, places, provider, limit }) {
  const ranked = dedupe(places).sort((a, b) => score(b) - score(a));

  const attractions = ranked.filter((p) => !FOOD_CATEGORIES.has(p.category)).slice(0, limit);
  const food = ranked.filter((p) => FOOD_CATEGORIES.has(p.category)).slice(0, limit);
  const all = [...attractions, ...food];

  const byCategory = all.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  return {
    location: {
      name: location.name,
      label: location.label ?? location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      country: location.country ?? null,
    },
    radiusM,
    counts: {
      attractions: attractions.length,
      restaurants: food.length,
      total: all.length,
      byCategory,
    },
    attractions,
    restaurants: food,
    bounds: boundsOf([location, ...all]),
    provider,
    attribution: attributionFor(all),
  };
}

/** Both keyless sources are ODbL / CC-BY-SA and require attribution. */
function attributionFor(places) {
  const sources = new Set(places.map((p) => p.source));
  const notes = [];
  if (sources.has('openstreetmap')) {
    notes.push({
      label: '© OpenStreetMap contributors',
      url: 'https://openstreetmap.org/copyright',
    });
  }
  if (sources.has('wikipedia')) {
    notes.push({
      label: 'Descriptions from Wikipedia (CC BY-SA)',
      url: 'https://en.wikipedia.org',
    });
  }
  if (sources.has('geoapify')) {
    notes.push({ label: 'Places data by Geoapify', url: 'https://www.geoapify.com/' });
  }
  return notes;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export async function getPlacesByCity(city, options = {}) {
  const location = await resolveCity(city);
  return getPlacesByLocation(location, options);
}

/**
 * @param {object} location resolved location
 * @param {{ radiusM?: number, limit?: number, forceRefresh?: boolean }} [options]
 */
export async function getPlacesByLocation(
  location,
  { radiusM = 5000, limit = 20, forceRefresh = false } = {}
) {
  const radius = Math.min(Math.max(Number(radiusM) || 5000, 500), 50_000);
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const key = cacheKey('places', {
    lat: location.latitude,
    lon: location.longitude,
    radius,
    limit: cap,
  });

  return wrapWithFallback({
    key,
    ttl: config.cacheTtl.places,
    forceRefresh,
    resource: `places near ${location.name}`,
    providers: [
      {
        name: 'geoapify',
        enabled: Boolean(config.GEOAPIFY_API_KEY) && !isBudgetExhausted('geoapify'),
        fetch: async () =>
          assemble({
            location,
            radiusM: radius,
            provider: 'geoapify',
            limit: cap,
            // Over-fetch so ranking has something to work with.
            places: await fetchFromGeoapify(location, radius, Math.min(cap * 3, 100)),
          }),
      },
      {
        name: 'wikipedia+osm',
        fetch: async () => {
          /* Two independent sources: sights from Wikipedia, food from
             Nominatim. Settled rather than awaited together so losing one still
             produces a usable card. */
          const [sights, food] = await Promise.allSettled([
            fetchFromWikipedia(location, radius, cap),
            fetchFoodFromNominatim(location, radius, cap),
          ]);

          const collected = [
            ...(sights.status === 'fulfilled' ? sights.value : []),
            ...(food.status === 'fulfilled' ? food.value : []),
          ];

          if (!collected.length) {
            throw new Error('Neither Wikipedia nor Nominatim returned any places');
          }

          if (sights.status === 'rejected') {
            logger.warn('Wikipedia sights lookup failed', { message: sights.reason?.message });
          }
          if (food.status === 'rejected') {
            logger.warn('Nominatim food lookup failed', { message: food.reason?.message });
          }

          return assemble({
            location,
            radiusM: radius,
            provider: 'wikipedia+osm',
            limit: cap,
            places: collected,
          });
        },
      },
      {
        name: 'overpass',
        fetch: async () =>
          assemble({
            location,
            radiusM: radius,
            provider: 'overpass',
            limit: cap,
            places: await fetchFromOverpass(location, radius, 120),
          }),
      },
    ],
  });
}

export default { getPlacesByCity, getPlacesByLocation, CATEGORIES };
