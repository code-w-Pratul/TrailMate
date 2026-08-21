import axios from 'axios';

/**
 * The single HTTP boundary of the app.
 *
 * Everything the UI knows about the network lives here: base URL, auth header,
 * envelope unwrapping and error normalisation. Components never see an axios
 * error — they see a `TrailMateError` with a message that is already safe to
 * render.
 *
 * The frontend never talks to a third-party API directly, so there is exactly
 * one base URL and no API keys in this bundle. That is the whole point of the
 * server-side proxy layer.
 */

const TOKEN_KEY = 'trailmate.token';

/* -------------------------------------------------------------------------- */
/* Token storage                                                              */
/* -------------------------------------------------------------------------- */

/**
 * localStorage can throw (Safari private mode, disabled storage), so every
 * access is guarded. A user with storage blocked simply gets a session that
 * ends when the tab closes rather than a crash.
 */
export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return memoryToken;
    }
  },
  set(token) {
    memoryToken = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* in-memory only */
    }
  },
  clear() {
    this.set(null);
  },
};

let memoryToken = null;

/* -------------------------------------------------------------------------- */
/* Error type                                                                 */
/* -------------------------------------------------------------------------- */

export class TrailMateError extends Error {
  constructor({ status, code, message, details, requestId, retryable }) {
    super(message);
    this.name = 'TrailMateError';
    this.status = status ?? 0;
    this.code = code ?? 'UNKNOWN';
    this.details = details;
    this.requestId = requestId;
    this.retryable = retryable ?? (status >= 500 || status === 0 || status === 429);
  }

  /** Field-level messages, keyed by field, for inline form errors. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return this.details.reduce((acc, issue) => {
      if (issue?.field) acc[issue.field] = issue.message;
      return acc;
    }, {});
  }
}

/** Humanise the failure modes the browser reports without a response body. */
function networkMessage(error) {
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return 'The request took too long. Check your connection and try again.';
  }
  return 'Could not reach the TrailMate API. Is the server running?';
}

/* -------------------------------------------------------------------------- */
/* Instance                                                                   */
/* -------------------------------------------------------------------------- */

function resolveApiBaseUrl() {
  const url = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URI;
  if (!url) return '/api';
  const clean = url.trim().replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

export const http = axios.create({
  // Same-origin by default: the Vite dev proxy and the production container
  // both serve the API under /api. VITE_API_URL is only for split deployments.
  baseURL: resolveApiBaseUrl(),
  timeout: 45_000,
  headers: { Accept: 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Fired when the server rejects our token so AuthContext can sign the user out. */
export const AUTH_EXPIRED_EVENT = 'trailmate:auth-expired';

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;

    if (
      status === 401 &&
      ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'ACCOUNT_NOT_FOUND'].includes(body?.error?.code)
    ) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }

    return Promise.reject(
      new TrailMateError({
        status,
        code: body?.error?.code,
        message: body?.error?.message || networkMessage(error),
        details: body?.error?.details,
        requestId: body?.error?.requestId,
      })
    );
  }
);

/* -------------------------------------------------------------------------- */
/* Envelope helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Every successful response is `{ success, data, meta }`. `request` returns
 * both halves, because `meta` carries the cache provenance the UI surfaces as
 * a "showing cached data" badge.
 *
 * @template T
 * @param {import('axios').AxiosRequestConfig} config
 * @returns {Promise<{ data: T, meta: object|null, status: number }>}
 */
export async function request(config) {
  const response = await http.request(config);
  return {
    data: response.data?.data,
    meta: response.data?.meta ?? null,
    status: response.status,
  };
}

/** For callers that only care about the payload. */
export async function requestData(config) {
  const { data } = await request(config);
  return data;
}

export default http;
