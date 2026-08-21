/**
 * Tiny dependency-free structured logger.
 *
 * Deliberately reads `process.env` directly rather than importing the config
 * module: the config loader itself needs to log validation warnings, and this
 * keeps the dependency graph acyclic.
 *
 * - development: colourised, human readable single lines
 * - production:  newline-delimited JSON, ready for any log aggregator
 * - test:        silent unless LOG_LEVEL is explicitly set
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const COLOURS = {
  error: '\u001b[31m',
  warn: '\u001b[33m',
  info: '\u001b[36m',
  debug: '\u001b[90m',
  reset: '\u001b[0m',
  dim: '\u001b[2m',
};

function resolveLevel() {
  const explicit = process.env.LOG_LEVEL?.toLowerCase();
  if (explicit && explicit in LEVELS) return LEVELS[explicit];
  if (process.env.NODE_ENV === 'test') return -1; // silent
  if (process.env.NODE_ENV === 'production') return LEVELS.info;
  return LEVELS.debug;
}

const activeLevel = resolveLevel();
const asJson = process.env.NODE_ENV === 'production';

function emit(level, message, meta) {
  if (LEVELS[level] > activeLevel) return;

  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  if (asJson) {
    stream.write(
      `${JSON.stringify({
        level,
        time: new Date().toISOString(),
        message,
        ...(meta && Object.keys(meta).length ? { meta } : {}),
      })}\n`
    );
    return;
  }

  const time = new Date().toISOString().slice(11, 23);
  const tag = `${COLOURS[level]}${level.toUpperCase().padEnd(5)}${COLOURS.reset}`;
  const detail =
    meta && Object.keys(meta).length ? ` ${COLOURS.dim}${safeInline(meta)}${COLOURS.reset}` : '';
  stream.write(`${COLOURS.dim}${time}${COLOURS.reset} ${tag} ${message}${detail}\n`);
}

function safeInline(meta) {
  try {
    return JSON.stringify(meta);
  } catch {
    return '[unserialisable meta]';
  }
}

export const logger = {
  error: (message, meta) => emit('error', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  info: (message, meta) => emit('info', message, meta),
  debug: (message, meta) => emit('debug', message, meta),
};

export default logger;
