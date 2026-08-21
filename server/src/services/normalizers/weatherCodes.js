/**
 * Weather vocabulary normalisation.
 *
 * OpenWeatherMap speaks in numeric condition ids (500 = light rain) while
 * Open-Meteo speaks WMO codes (61 = slight rain). Neither vocabulary leaks past
 * this file: both are mapped onto TrailMate's own small, closed set of
 * condition codes, so the frontend renders one icon set regardless of which
 * provider answered — and provider swaps require zero UI changes.
 *
 * This is the response-normalisation pattern the whole services layer follows.
 */

/** The complete set of conditions the API will ever emit. */
export const CONDITIONS = Object.freeze([
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'freezing-rain',
  'snow',
  'thunderstorm',
  'hail',
  'wind',
  'unknown',
]);

/** Short, human-friendly label for each condition. */
const LABELS = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  'freezing-rain': 'Freezing rain',
  snow: 'Snow',
  thunderstorm: 'Thunderstorm',
  hail: 'Hail',
  wind: 'Windy',
  unknown: 'Unknown',
};

export const conditionLabel = (condition) => LABELS[condition] ?? LABELS.unknown;

/**
 * Map an OpenWeatherMap condition id to a TrailMate condition.
 * @param {number} id
 * @returns {string}
 */
export function fromOpenWeatherId(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return 'unknown';

  if (n >= 200 && n < 300) return 'thunderstorm';
  if (n >= 300 && n < 400) return 'drizzle';
  if (n === 511) return 'freezing-rain';
  if (n >= 500 && n < 600) return 'rain';
  if (n >= 600 && n < 700) return 'snow';
  if (n === 771 || n === 781) return 'wind';
  if (n >= 700 && n < 800) return 'fog';
  if (n === 800) return 'clear';
  if (n === 801 || n === 802) return 'partly-cloudy';
  if (n === 803 || n === 804) return 'cloudy';
  return 'unknown';
}

/**
 * Map a WMO weather interpretation code (Open-Meteo) to a TrailMate condition.
 * @param {number} code
 * @returns {string}
 */
export function fromWmoCode(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return 'unknown';

  const table = {
    0: 'clear',
    1: 'partly-cloudy',
    2: 'partly-cloudy',
    3: 'cloudy',
    45: 'fog',
    48: 'fog',
    51: 'drizzle',
    53: 'drizzle',
    55: 'drizzle',
    56: 'freezing-rain',
    57: 'freezing-rain',
    61: 'rain',
    63: 'rain',
    65: 'rain',
    66: 'freezing-rain',
    67: 'freezing-rain',
    71: 'snow',
    73: 'snow',
    75: 'snow',
    77: 'snow',
    80: 'rain',
    81: 'rain',
    82: 'rain',
    85: 'snow',
    86: 'snow',
    95: 'thunderstorm',
    96: 'hail',
    99: 'hail',
  };
  return table[n] ?? 'unknown';
}

/** Longer descriptions for WMO codes, so the keyless provider is not vaguer. */
const WMO_DESCRIPTIONS = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export const wmoDescription = (code) => WMO_DESCRIPTIONS[Number(code)] ?? 'Unknown conditions';

/** Conditions that mean "you will get wet". Used by the packing engine. */
export const WET_CONDITIONS = new Set(['drizzle', 'rain', 'freezing-rain', 'thunderstorm', 'hail']);

/** Conditions that imply snow/ice underfoot. */
export const COLD_CONDITIONS = new Set(['snow', 'freezing-rain', 'hail']);

export default { CONDITIONS, conditionLabel, fromOpenWeatherId, fromWmoCode, wmoDescription };
