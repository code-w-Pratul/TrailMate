import axios from 'axios';
import config from '../config/env.js';
import logger from './logger.js';
import ApiError from './ApiError.js';
import { recordCall, recordFailure } from './apiUsage.js';

/**
 * Error raised when a third-party provider misbehaves. Carries the upstream
 * status so a service can translate provider semantics into ours (e.g. a
 * Geoapify 404 becomes our own 404 rather than a generic 502).
 */
export class UpstreamError extends ApiError {
  constructor(message, { provider, upstreamStatus, timeout = false, cause, details } = {}) {
    super(timeout ? 504 : 502, message, {
      code: timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
      details,
      cause,
    });
    this.name = 'UpstreamError';
    this.provider = provider;
    this.upstreamStatus = upstreamStatus ?? null;
    this.timeout = timeout;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RETRYABLE_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'ERR_NETWORK',
  'ERR_CANCELED',
]);

const isTimeout = (error) =>
  error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || /timeout/i.test(error.message);

function isRetryable(error) {
  const status = error.response?.status;
  if (status) return status === 408 || status === 425 || status === 429 || status >= 500;
  return RETRYABLE_CODES.has(error.code) || !error.response;
}

/**
 * Build a hardened client for one upstream provider.
 *
 * Every outbound call gets:
 *  - a hard timeout, so a single slow provider can never hang a request
 *  - bounded retries with exponential backoff + jitter on transient failures
 *  - free-tier usage accounting
 *  - normalised errors (`UpstreamError`)
 *
 * @param {object} options
 * @param {string} options.provider    Usage-tracking key, e.g. 'openweather'
 * @param {string} [options.baseURL]
 * @param {number} [options.timeout]
 * @param {number} [options.retries]
 * @param {Record<string,string>} [options.headers]
 * @param {boolean} [options.metered]  Count calls against a free-tier budget
 */
export function createUpstreamClient({
  provider,
  baseURL,
  timeout = config.UPSTREAM_TIMEOUT_MS,
  retries = config.UPSTREAM_RETRIES,
  headers = {},
  metered = true,
}) {
  const instance = axios.create({
    baseURL,
    timeout,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TrailMate/1.0 (+https://github.com/yourname/trailmate)',
      ...headers,
    },
    // Providers occasionally answer 404 with a useful body; we decide what is
    // an error, not axios.
    validateStatus: (status) => status >= 200 && status < 300,
  });

  async function request(requestConfig) {
    const label = `${provider}${requestConfig.url ?? ''}`;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const startedAt = Date.now();
      try {
        if (metered) recordCall(provider);
        const response = await instance.request(requestConfig);
        logger.debug(`upstream ok ${label}`, {
          ms: Date.now() - startedAt,
          attempt: attempt + 1,
          status: response.status,
        });
        return response.data;
      } catch (error) {
        lastError = error;
        if (metered) recordFailure(provider);

        const status = error.response?.status ?? null;
        logger.warn(`upstream fail ${label}`, {
          ms: Date.now() - startedAt,
          attempt: attempt + 1,
          status,
          code: error.code ?? null,
          message: truncate(error.message, 160),
        });

        if (attempt < retries && isRetryable(error)) {
          const backoff = Math.round(250 * 2 ** attempt * (0.75 + Math.random() * 0.5));
          await sleep(backoff);
          continue;
        }
        break;
      }
    }

    throw toUpstreamError(lastError, provider);
  }

  return {
    provider,
    request,
    /**
     * @param {string} url
     * @param {import('axios').AxiosRequestConfig} [options]
     */
    get: (url, options = {}) => request({ ...options, method: 'GET', url }),
  };
}

function toUpstreamError(error, provider) {
  if (error instanceof ApiError) return error;

  const status = error?.response?.status ?? null;
  const timedOut = isTimeout(error ?? {});

  const message = timedOut
    ? `"${provider}" did not respond in time`
    : status
      ? `"${provider}" responded with ${status}`
      : `"${provider}" is unreachable`;

  return new UpstreamError(message, {
    provider,
    upstreamStatus: status,
    timeout: timedOut,
    cause: error,
    details: extractProviderMessage(error),
  });
}

function extractProviderMessage(error) {
  const body = error?.response?.data;
  if (!body) return undefined;
  if (typeof body === 'string') return truncate(body, 300);
  const candidate = body.message ?? body.error ?? body.reason ?? body.detail;
  return candidate ? truncate(String(candidate), 300) : undefined;
}

function truncate(value, max) {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default createUpstreamClient;
