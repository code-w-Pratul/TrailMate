/**
 * Presentation helpers.
 *
 * Unit conversion lives *only* here. The API is single-unit by design (Celsius,
 * km/h, millimetres, ISO dates), so imperial display, locale formatting and
 * relative times are purely a client concern. That keeps cache keys, AI prompts
 * and stored trip snapshots unambiguous while still letting a US visitor read
 * Fahrenheit.
 */

/* -------------------------------------------------------------------------- */
/* Temperature                                                                */
/* -------------------------------------------------------------------------- */

export const cToF = (c) => (Number.isFinite(c) ? (c * 9) / 5 + 32 : null);

/**
 * @param {number|null} celsius
 * @param {'C'|'F'} unit
 * @param {{ digits?: number, withUnit?: boolean }} [options]
 */
export function formatTemp(celsius, unit = 'C', { digits = 0, withUnit = true } = {}) {
  if (!Number.isFinite(celsius)) return '—';
  const value = unit === 'F' ? cToF(celsius) : celsius;
  const rounded = digits === 0 ? Math.round(value) : Number(value.toFixed(digits));
  return withUnit ? `${rounded}°${unit}` : `${rounded}°`;
}

/** "18° – 24°C" for a daily range, without repeating the unit. */
export function formatTempRange(minC, maxC, unit = 'C') {
  if (!Number.isFinite(minC) && !Number.isFinite(maxC)) return '—';
  return `${formatTemp(minC, unit, { withUnit: false })} – ${formatTemp(maxC, unit)}`;
}

/* -------------------------------------------------------------------------- */
/* Distance & speed                                                           */
/* -------------------------------------------------------------------------- */

const KM_PER_MILE = 1.609344;

export const kmToMi = (km) => (Number.isFinite(km) ? km / KM_PER_MILE : null);

/** Metres in, human distance out. Switches to m/ft below a kilometre. */
export function formatDistance(meters, unit = 'km') {
  if (!Number.isFinite(meters)) return '—';

  if (unit === 'mi') {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
    const miles = kmToMi(meters / 1000);
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }

  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatSpeed(kph, unit = 'km') {
  if (!Number.isFinite(kph)) return '—';
  return unit === 'mi' ? `${Math.round(kmToMi(kph))} mph` : `${Math.round(kph)} km/h`;
}

export function formatPrecipitation(mm, unit = 'km') {
  if (!Number.isFinite(mm)) return '—';
  if (unit === 'mi') {
    const inches = mm / 25.4;
    return `${inches < 1 ? inches.toFixed(2) : inches.toFixed(1)} in`;
  }
  return `${mm < 10 ? Math.round(mm * 10) / 10 : Math.round(mm)} mm`;
}

/* -------------------------------------------------------------------------- */
/* Money & numbers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Intl handles the hard parts: symbol placement, digit grouping, and the fact
 * that JPY has no minor units while USD has two.
 */
export function formatMoney(amount, currency = 'USD', { maximumFractionDigits } = {}) {
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: maximumFractionDigits ?? (Math.abs(amount) >= 100 ? 0 : 2),
    }).format(amount);
  } catch {
    // Unknown or non-ISO currency code: degrade rather than throw.
    return `${formatNumber(amount)} ${currency}`;
  }
}

export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCompact(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}

export const formatPercent = (value, digits = 0) =>
  Number.isFinite(value) ? `${value.toFixed(digits)}%` : '—';

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * API dates are `YYYY-MM-DD` with no timezone. Parsing them as UTC avoids the
 * classic off-by-one where a user west of Greenwich sees the previous day.
 */
const parseDay = (value) => {
  if (!value) return null;
  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
};

export function formatDate(value, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const date = parseDay(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(date);
}

export const formatWeekday = (value) => formatDate(value, { weekday: 'short' });
export const formatDayMonth = (value) => formatDate(value, { day: 'numeric', month: 'short' });
export const formatLongDate = (value) =>
  formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' });

/** "12 – 17 Sep 2026", collapsing repeated month and year. */
export function formatDateRange(start, end) {
  const a = parseDay(start);
  const b = parseDay(end);
  if (!a && !b) return 'Dates not set';
  if (!b) return formatLongDate(start);
  if (!a) return formatLongDate(end);

  const sameMonth =
    a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  if (sameMonth) {
    return `${a.getUTCDate()} – ${formatLongDate(end)}`;
  }
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  return `${formatDate(start, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} – ${formatLongDate(end)}`;
}

/** "3 minutes ago" — used for cache age and snapshot freshness. */
export function formatRelative(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date?.valueOf())) return '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const thresholds = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
  ];

  let unit = 'year';
  let amount = seconds;
  for (const [name, limit] of thresholds) {
    if (Math.abs(amount) < limit) {
      unit = name;
      break;
    }
    amount = Math.round(amount / limit);
  }
  return rtf.format(-amount, unit);
}

export function formatAgeSeconds(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

/** Inclusive night count between two `YYYY-MM-DD` dates. */
export function daysBetween(start, end) {
  const a = parseDay(start);
  const b = parseDay(end);
  if (!a || !b) return null;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** `YYYY-MM-DD` for an offset from today — used to seed the date pickers. */
export function isoDateIn(days = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

export const titleCase = (value) =>
  String(value ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const pluralise = (count, singular, plural = `${singular}s`) =>
  `${formatNumber(count)} ${count === 1 ? singular : plural}`;

/** Local time at the destination, from an IANA zone. */
export function formatLocalTime(timezone) {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return null;
  }
}

/** Hour offset between the destination and the viewer, e.g. "+8 h". */
export function timezoneOffsetLabel(timezone) {
  if (!timezone) return null;
  try {
    const now = new Date();
    const there = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const here = new Date(now.toLocaleString('en-US'));
    const diff = Math.round((there - here) / 3_600_000);
    if (diff === 0) return 'same as you';
    return `${diff > 0 ? '+' : ''}${diff} h`;
  } catch {
    return null;
  }
}
