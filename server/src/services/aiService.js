import { createHash } from 'node:crypto';
import { z } from 'zod';
import config from '../config/env.js';
import logger from '../lib/logger.js';
import { createUpstreamClient } from '../lib/httpClient.js';
import { cacheKey, wrap } from '../cache/index.js';
import { WET_CONDITIONS } from './normalizers/weatherCodes.js';

/**
 * AI trip summary.
 *
 * Three things make this production-shaped rather than a demo:
 *
 * 1. **Grounding.** The model never browses or recalls. It is handed a compact
 *    JSON brief built entirely from data we already fetched and normalised
 *    (weather, POIs, country facts, budget) and told to work only from that.
 *    Hallucinated attractions are the classic failure mode here, so the prompt
 *    forbids inventing place names.
 *
 * 2. **Schema-validated output.** The reply is parsed and validated with Zod. A
 *    malformed or partial response is discarded, not forwarded.
 *
 * 3. **A real fallback.** If no provider is configured, the call fails, times
 *    out, or returns junk, a deterministic narrative generator produces the same
 *    shape from the same data. The feature degrades in quality, never in
 *    availability — so the dashboard has no "AI is down" state.
 */

/* -------------------------------------------------------------------------- */
/* Output contract                                                             */
/* -------------------------------------------------------------------------- */

const summarySchema = z.object({
  headline: z.string().min(3).max(120),
  overview: z.string().min(40).max(1200),
  whatToExpect: z.array(z.string().min(3).max(280)).min(2).max(6),
  packingHighlights: z.array(z.string().min(2).max(160)).max(6).default([]),
  localTips: z.array(z.string().min(3).max(280)).max(6).default([]),
  dayPlan: z
    .array(
      z.object({
        day: z.number().int().min(1).max(30),
        theme: z.string().min(3).max(80),
        suggestion: z.string().min(10).max(400),
      })
    )
    .max(7)
    .default([]),
});

const SYSTEM_PROMPT = `You are TrailMate's travel briefing writer.

Rules you must follow:
- Use ONLY the facts in the provided JSON brief. Never invent attraction names, restaurants, prices, or events.
- If you mention a place, it must appear in the brief's "topAttractions" or "topFood" lists, spelled exactly as given.
- Be concrete and useful. Reference actual temperatures, rain chances and currency figures from the brief.
- Warm, practical tone. British-neutral English. No emoji, no marketing language, no exclamation marks.
- Respond with a single JSON object and nothing else. No markdown fences, no commentary.

JSON shape:
{
  "headline": "short phrase, max 12 words",
  "overview": "2-4 sentences on what the trip will feel like",
  "whatToExpect": ["2-6 bullet strings covering weather, crowds, getting around"],
  "packingHighlights": ["up to 6 items, each with a one-clause reason"],
  "localTips": ["up to 6 practical tips: money, language, etiquette, timing"],
  "dayPlan": [{"day": 1, "theme": "short label", "suggestion": "one or two sentences using only brief place names"}]
}`;

/* -------------------------------------------------------------------------- */
/* Brief construction                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Compress the dashboard payloads into the smallest brief that still supports a
 * good summary. Token budget is a real cost even on free tiers, and a tighter
 * brief measurably reduces drift.
 */
export function buildBrief({ location, weather, places, country, budget, trip = {} }) {
  const daily = (weather?.daily ?? []).slice(0, 7).map((d) => ({
    date: d.date,
    minC: d.minC,
    maxC: d.maxC,
    condition: d.condition,
    rainChance: d.precipitationChance,
  }));

  const named = (list, count) =>
    (list ?? []).slice(0, count).map((p) => ({
      name: p.name,
      category: p.category,
      ...(p.distanceM ? { distanceM: p.distanceM } : {}),
    }));

  return {
    destination: {
      city: location?.name ?? null,
      label: location?.label ?? null,
      country: country?.name ?? location?.country ?? null,
      timezone: location?.timezone ?? null,
      population: location?.population ?? null,
    },
    trip: {
      startDate: trip.startDate ?? null,
      endDate: trip.endDate ?? null,
      days: trip.days ?? weather?.summary?.days ?? null,
      travellers: trip.travellers ?? 1,
    },
    weather: weather
      ? {
          summary: {
            minC: weather.summary?.minC,
            maxC: weather.summary?.maxC,
            avgMaxC: weather.summary?.avgMaxC,
            wetDays: weather.summary?.wetDays,
            rainChanceMax: weather.summary?.rainChanceMax,
            windKphMax: weather.summary?.windKphMax,
            dominant: weather.summary?.dominantCondition,
          },
          daily,
          units: 'celsius',
        }
      : null,
    topAttractions: named(places?.attractions, 10),
    topFood: named(places?.restaurants, 6),
    country: country
      ? {
          languages: (country.languages ?? []).map((l) => l.name).slice(0, 3),
          currency: country.primaryCurrency?.code ?? null,
          currencyName: country.primaryCurrency?.name ?? null,
          timezone: country.primaryTimezone ?? null,
          drivingSide: country.drivingSide ?? null,
          callingCode: country.callingCode ?? null,
        }
      : null,
    budget: budget
      ? {
          style: budget.style?.key ?? null,
          perDay: budget.perPersonPerDay?.home?.amount ?? budget.perPersonPerDay?.usd ?? null,
          currency: budget.perPersonPerDay?.home?.currency ?? 'USD',
          total: budget.total?.home?.amount ?? budget.total?.usd ?? null,
        }
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                   */
/* -------------------------------------------------------------------------- */

const AI_TIMEOUT_MS = Math.max(config.UPSTREAM_TIMEOUT_MS, 20_000);

const groq = createUpstreamClient({
  provider: 'groq',
  baseURL: 'https://api.groq.com/openai/v1',
  timeout: AI_TIMEOUT_MS,
  retries: 0,
  metered: false,
  headers: config.GROQ_API_KEY ? { Authorization: `Bearer ${config.GROQ_API_KEY}` } : {},
});

const gemini = createUpstreamClient({
  provider: 'gemini',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta',
  timeout: AI_TIMEOUT_MS,
  retries: 0,
  metered: false,
});

const ollama = createUpstreamClient({
  provider: 'ollama',
  baseURL: config.ai.ollamaBaseUrl || 'http://127.0.0.1:11434',
  timeout: Math.max(AI_TIMEOUT_MS, 60_000), // local models can be slow to warm
  retries: 0,
  metered: false,
});

async function callGroq(brief) {
  const body = await groq.request({
    method: 'POST',
    url: '/chat/completions',
    data: {
      model: config.ai.groqModel,
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(brief) },
      ],
    },
  });
  return {
    text: body?.choices?.[0]?.message?.content ?? '',
    model: body?.model ?? config.ai.groqModel,
  };
}

async function callGemini(brief) {
  const body = await gemini.request({
    method: 'POST',
    url: `/models/${config.ai.geminiModel}:generateContent`,
    params: { key: config.GEMINI_API_KEY },
    data: {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(brief) }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
      },
    },
  });
  const text = (body?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return { text, model: config.ai.geminiModel };
}

async function callOllama(brief) {
  const body = await ollama.request({
    method: 'POST',
    url: '/api/chat',
    data: {
      model: config.ai.ollamaModel,
      stream: false,
      format: 'json',
      options: { temperature: 0.6 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(brief) },
      ],
    },
  });
  return { text: body?.message?.content ?? '', model: config.ai.ollamaModel };
}

const PROVIDERS = {
  groq: { call: callGroq, isConfigured: () => Boolean(config.GROQ_API_KEY) },
  gemini: { call: callGemini, isConfigured: () => Boolean(config.GEMINI_API_KEY) },
  ollama: { call: callOllama, isConfigured: () => Boolean(config.ai.ollamaBaseUrl) },
};

/** Resolution order when AI_PROVIDER=auto, best free option first. */
function providerChain() {
  if (config.ai.provider === 'rules') return [];
  if (config.ai.provider !== 'auto') {
    const chosen = PROVIDERS[config.ai.provider];
    return chosen?.isConfigured() ? [config.ai.provider] : [];
  }
  return Object.keys(PROVIDERS).filter((name) => PROVIDERS[name].isConfigured());
}

/* -------------------------------------------------------------------------- */
/* Response parsing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Models wrap JSON in prose or fences even when told not to. Recover the object
 * rather than discarding an otherwise good response.
 */
function extractJson(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('Empty model response');

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Model response contained no JSON object');
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

/**
 * Reject place names the model invented. Grounding enforced after the fact, not
 * just requested in the prompt.
 */
function stripUngroundedPlaces(summary, brief) {
  const known = new Set(
    [...(brief.topAttractions ?? []), ...(brief.topFood ?? [])].map((p) =>
      String(p.name).toLowerCase()
    )
  );
  if (!known.size) return { summary, removed: 0 };

  // Heuristic: a capitalised multi-word phrase that is not in the brief and not
  // the destination itself is treated as fabricated.
  const cityWords = new Set(
    [brief.destination?.city, brief.destination?.country]
      .filter(Boolean)
      .flatMap((v) => String(v).toLowerCase().split(/\s+/))
  );

  let removed = 0;
  const check = (sentence) => {
    const phrases = String(sentence).match(
      /\b(?:[A-Z][\w'’-]+)(?:\s+(?:[A-Z][\w'’-]+|de|of|la|le|du|del)){1,4}\b/g
    );
    if (!phrases) return true;
    for (const phrase of phrases) {
      const lower = phrase.toLowerCase();
      if (known.has(lower)) continue;
      if ([...known].some((k) => k.includes(lower) || lower.includes(k))) continue;
      if (lower.split(/\s+/).every((w) => cityWords.has(w))) continue;
      removed += 1;
      return false;
    }
    return true;
  };

  const filtered = {
    ...summary,
    dayPlan: (summary.dayPlan ?? []).filter((d) => check(d.suggestion)),
  };
  return { summary: filtered, removed };
}

/* -------------------------------------------------------------------------- */
/* Deterministic fallback narrative                                            */
/* -------------------------------------------------------------------------- */

const list = (names) => {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * Rule-based briefing. Not a stub — it reads the same brief and produces the
 * same schema, so the UI cannot tell the difference structurally.
 */
export function generateRuleBasedSummary(brief) {
  const city = brief.destination?.city ?? 'your destination';
  const country = brief.destination?.country;
  const w = brief.weather?.summary ?? {};
  const daily = brief.weather?.daily ?? [];
  const days = brief.trip?.days ?? daily.length ?? null;

  const attractionNames = (brief.topAttractions ?? []).map((p) => p.name);
  const foodNames = (brief.topFood ?? []).map((p) => p.name);

  const tempPhrase =
    w.maxC !== null && w.maxC !== undefined && w.minC !== null && w.minC !== undefined
      ? `between ${w.minC}°C and ${w.maxC}°C`
      : 'variable';

  const feel =
    (w.avgMaxC ?? w.maxC ?? 18) >= 28
      ? 'genuinely hot — plan indoor breaks around midday'
      : (w.avgMaxC ?? w.maxC ?? 18) >= 20
        ? 'comfortably warm for walking all day'
        : (w.avgMaxC ?? w.maxC ?? 18) >= 12
          ? 'mild, with layers doing most of the work'
          : 'cold enough that a proper coat matters';

  const wetDays = w.wetDays ?? 0;
  const rainSentence =
    wetDays > 0
      ? `Rain is expected on ${wetDays} of the ${daily.length} forecast days, peaking around a ${w.rainChanceMax ?? 0}% chance.`
      : 'The forecast is dry across the whole window.';

  const overview = [
    `${city}${country ? `, ${country}` : ''} looks ${feel}, with temperatures ${tempPhrase}.`,
    rainSentence,
    attractionNames.length
      ? `There is plenty within reach — ${list(attractionNames.slice(0, 3))} all sit close to the centre.`
      : 'Points of interest are sparse in the immediate area, so widen the search radius if the list looks thin.',
    brief.budget?.perDay
      ? `Budget roughly ${brief.budget.perDay} ${brief.budget.currency} per person per day at a ${brief.budget.style ?? 'mid-range'} pace.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const whatToExpect = [
    `Daytime highs near ${w.avgMaxC ?? w.maxC ?? '—'}°C, overnight lows near ${w.minC ?? '—'}°C.`,
    wetDays > 0
      ? `Wet weather on ${wetDays} day(s) — keep a flexible indoor option per day.`
      : 'A dry forecast, so outdoor plans should hold.',
    (w.windKphMax ?? 0) >= 40
      ? `Windy spells up to ${w.windKphMax} km/h; exposed viewpoints will feel colder than the numbers suggest.`
      : 'Winds stay moderate throughout.',
    attractionNames.length >= 6
      ? `Around ${attractionNames.length} notable sights nearby — two or three per day is a realistic pace.`
      : 'A compact set of sights, easily covered in a day or two.',
  ];
  if (brief.country?.currency) {
    whatToExpect.push(
      `Prices are in ${brief.country.currency}${brief.country.currencyName ? ` (${brief.country.currencyName})` : ''}.`
    );
  }

  const packingHighlights = [];
  if (wetDays > 0) packingHighlights.push('Compact umbrella — rain on multiple days');
  if ((w.minC ?? 99) <= 7) packingHighlights.push('Warm coat — lows near freezing');
  if ((w.maxC ?? 0) >= 28) packingHighlights.push('High-SPF sunscreen — sustained heat');
  if ((w.windKphMax ?? 0) >= 40) packingHighlights.push('Windbreaker — strong gusts forecast');
  packingHighlights.push('Comfortable walking shoes — sightseeing days add up');
  if (brief.country?.drivingSide === 'left') {
    packingHighlights.push('Remember traffic drives on the left');
  }

  const localTips = [];
  if (brief.country?.languages?.length) {
    localTips.push(
      `${list(brief.country.languages)} ${brief.country.languages.length > 1 ? 'are' : 'is'} spoken locally — download an offline phrasebook.`
    );
  }
  if (brief.country?.currency) {
    localTips.push(`Carry a small amount of ${brief.country.currency} in cash for smaller venues.`);
  }
  if (brief.destination?.timezone) {
    localTips.push(`Local time runs on ${brief.destination.timezone}.`);
  }
  if (foodNames.length) {
    localTips.push(`For food, ${list(foodNames.slice(0, 3))} came up in the local listings.`);
  }
  if (brief.country?.callingCode) {
    localTips.push(`Dialling code is ${brief.country.callingCode}.`);
  }

  /* Spread the known attractions across the trip, two per day. */
  const dayPlan = [];
  const planDays = Math.min(Math.max(days ?? 3, 1), 5);
  for (let i = 0; i < planDays; i += 1) {
    const slice = attractionNames.slice(i * 2, i * 2 + 2);
    if (!slice.length) break;
    const day = daily[i];
    const wet = day && WET_CONDITIONS.has(day.condition);
    dayPlan.push({
      day: i + 1,
      theme: wet ? 'Indoor-leaning day' : 'Sightseeing day',
      suggestion:
        `${list(slice)}${slice.length > 1 ? ' pair well in one outing' : ' is a solid anchor for the day'}.` +
        (day
          ? ` Expect ${day.minC}–${day.maxC}°C${wet ? ` with a ${day.rainChance ?? 0}% chance of rain, so keep a covered option in reserve` : ''}.`
          : ''),
    });
  }

  return {
    headline: `${city}: ${wetDays > 0 ? 'pack for showers' : 'a dry window'}, ${Math.round(w.avgMaxC ?? w.maxC ?? 0)}°C days`,
    overview,
    whatToExpect: whatToExpect.slice(0, 6),
    packingHighlights: packingHighlights.slice(0, 6),
    localTips: localTips.slice(0, 6),
    dayPlan,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

const briefFingerprint = (brief) =>
  createHash('sha1').update(JSON.stringify(brief)).digest('hex').slice(0, 20);

/**
 * Generate a trip briefing. Never rejects for provider reasons — worst case it
 * returns the rule-based version with `generatedBy: 'rules'`.
 *
 * @param {object} input see buildBrief
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function generateTripSummary(input, { forceRefresh = false } = {}) {
  const brief = buildBrief(input);
  const key = cacheKey('ai-summary', {
    fp: briefFingerprint(brief),
    provider: config.ai.provider,
  });

  return wrap({
    key,
    ttl: config.cacheTtl.ai,
    forceRefresh,
    provider: config.ai.provider,
    fetcher: async () => {
      const chain = providerChain();

      for (const name of chain) {
        const startedAt = Date.now();
        try {
          const { text, model } = await PROVIDERS[name].call(brief);
          const parsed = summarySchema.parse(extractJson(text));
          const { summary, removed } = stripUngroundedPlaces(parsed, brief);

          logger.info(`AI summary generated via ${name}`, {
            model,
            ms: Date.now() - startedAt,
            ungroundedRemoved: removed,
          });

          return {
            ...summary,
            generatedBy: name,
            model,
            grounded: true,
            ungroundedSuggestionsRemoved: removed,
            generatedAt: new Date().toISOString(),
            disclaimer:
              'Generated from the live weather, places and country data on this page. Verify opening hours and prices before you go.',
          };
        } catch (error) {
          logger.warn(`AI provider "${name}" failed — trying next`, {
            message: error.message,
            ms: Date.now() - startedAt,
          });
        }
      }

      /* Everything failed, or nothing was configured. */
      return {
        ...generateRuleBasedSummary(brief),
        generatedBy: 'rules',
        model: 'trailmate-rules-v1',
        grounded: true,
        ungroundedSuggestionsRemoved: 0,
        generatedAt: new Date().toISOString(),
        disclaimer: chain.length
          ? 'The AI provider was unavailable, so this briefing was assembled directly from the trip data.'
          : 'No AI provider is configured, so this briefing was assembled directly from the trip data. Set GROQ_API_KEY or GEMINI_API_KEY for a richer narrative.',
      };
    },
  });
}

/** Reported by `GET /api/meta/config` so the UI can label the AI card. */
export function aiStatus() {
  const chain = providerChain();
  return {
    provider: chain[0] ?? 'rules',
    configured: chain.length > 0,
    available: [...chain, 'rules'],
    mode: config.ai.provider,
  };
}

export default { generateTripSummary, generateRuleBasedSummary, buildBrief, aiStatus };
