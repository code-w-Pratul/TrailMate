import config from '../config/env.js';
import { createUpstreamClient } from '../lib/httpClient.js';
import { cacheKey, wrapWithFallback } from '../cache/index.js';
import { isBudgetExhausted } from '../lib/apiUsage.js';

/**
 * Destination cover photo.
 *
 *   • Unsplash — when UNSPLASH_ACCESS_KEY is set (50 req/hour free)
 *   • Picsum   — keyless deterministic placeholder fallback
 *
 * Unsplash's API guidelines require crediting the photographer and linking back
 * with UTM parameters, so the normalised shape carries a ready-to-render
 * `credit` object rather than leaving attribution as an afterthought the UI
 * might forget.
 */

const unsplash = createUpstreamClient({
  provider: 'unsplash',
  baseURL: 'https://api.unsplash.com',
  headers: config.UNSPLASH_ACCESS_KEY
    ? { Authorization: `Client-ID ${config.UNSPLASH_ACCESS_KEY}` }
    : {},
});

const UTM = 'utm_source=TrailMate&utm_medium=referral';

const slugify = (value) =>
  String(value ?? 'travel')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'travel';

/* -------------------------------------------------------------------------- */
/* Provider: Unsplash                                                          */
/* -------------------------------------------------------------------------- */

async function fetchFromUnsplash(query) {
  const body = await unsplash.get('/search/photos', {
    params: {
      query: `${query} city travel`,
      per_page: 5,
      orientation: 'landscape',
      content_filter: 'high',
    },
  });

  const photo = (body?.results ?? []).find((p) => p?.urls?.regular);
  if (!photo) {
    // Not an upstream fault — just no match. Let the fallback provider answer.
    throw new Error(`Unsplash has no landscape photo for "${query}"`);
  }

  return {
    url: photo.urls.regular,
    fullUrl: photo.urls.full ?? photo.urls.regular,
    thumbUrl: photo.urls.small ?? photo.urls.thumb ?? photo.urls.regular,
    width: photo.width ?? null,
    height: photo.height ?? null,
    color: photo.color ?? null,
    blurHash: photo.blur_hash ?? null,
    alt: photo.alt_description ?? photo.description ?? `${query} cover photo`,
    credit: {
      name: photo.user?.name ?? 'Unknown',
      profileUrl: photo.user?.links?.html ? `${photo.user.links.html}?${UTM}` : null,
      photoUrl: photo.links?.html ? `${photo.links.html}?${UTM}` : null,
      sourceName: 'Unsplash',
      sourceUrl: `https://unsplash.com/?${UTM}`,
    },
    attributionRequired: true,
    provider: 'unsplash',
  };
}

/* -------------------------------------------------------------------------- */
/* Provider: keyless deterministic fallback                                    */
/* -------------------------------------------------------------------------- */

function buildPlaceholder(query) {
  const seed = slugify(query);
  return {
    url: `https://picsum.photos/seed/${seed}/1600/900`,
    fullUrl: `https://picsum.photos/seed/${seed}/2400/1350`,
    thumbUrl: `https://picsum.photos/seed/${seed}/480/270`,
    width: 1600,
    height: 900,
    color: null,
    blurHash: null,
    alt: `Placeholder cover image for ${query}`,
    credit: {
      name: 'Lorem Picsum',
      profileUrl: null,
      photoUrl: null,
      sourceName: 'Picsum',
      sourceUrl: 'https://picsum.photos',
    },
    attributionRequired: false,
    isPlaceholder: true,
    provider: 'picsum',
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} query usually the city name, optionally "City, Country"
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function getCoverPhoto(query, { forceRefresh = false } = {}) {
  const subject = String(query ?? '').trim() || 'travel';

  return wrapWithFallback({
    key: cacheKey('photo', { q: subject }),
    ttl: config.cacheTtl.photo,
    forceRefresh,
    resource: `cover photo for ${subject}`,
    providers: [
      {
        name: 'unsplash',
        enabled: Boolean(config.UNSPLASH_ACCESS_KEY) && !isBudgetExhausted('unsplash'),
        fetch: () => fetchFromUnsplash(subject),
      },
      {
        name: 'picsum',
        // Synchronous by nature, but kept in the provider chain so the caching,
        // metadata and meta.provider plumbing is identical for both paths.
        fetch: async () => buildPlaceholder(subject),
      },
    ],
  });
}

export default { getCoverPhoto };
