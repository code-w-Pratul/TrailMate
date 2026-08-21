import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { daysBetween } from '../lib/format.js';

/**
 * Trip parameters, stored in the URL.
 *
 * The query string *is* the state: `/plan?city=Kyoto&days=5&style=comfort` can
 * be bookmarked, shared, and survives a refresh or a back button press. Keeping
 * it out of component state also means the React Query key derives directly from
 * the URL, so navigation and caching stay in step automatically.
 */
export function useTripParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { homeCurrency } = usePreferences();

  const params = useMemo(() => {
    const get = (key, fallback) => searchParams.get(key) ?? fallback;

    const startDate = get('startDate', '') || null;
    const endDate = get('endDate', '') || null;
    const derivedDays = startDate && endDate ? daysBetween(startDate, endDate) : null;

    return {
      city: get('city', '') || '',
      // Explicit dates win over a bare day count.
      days: derivedDays ?? clamp(Number(get('days', 5)) || 5, 1, 30),
      startDate,
      endDate,
      style: get('style', 'midrange'),
      travellers: clamp(Number(get('travellers', 1)) || 1, 1, 20),
      radius: clamp(Number(get('radius', 5000)) || 5000, 500, 50_000),
      activities: (get('activities', '') || '').split(',').filter(Boolean),
      homeCurrency: get('homeCurrency', '') || homeCurrency,
    };
  }, [searchParams, homeCurrency]);

  /** Merge a patch into the URL, dropping empty values to keep it readable. */
  const setParams = useCallback(
    (patch, { replace = false } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            const serialised = Array.isArray(value) ? value.join(',') : value;
            if (serialised === null || serialised === undefined || serialised === '') {
              next.delete(key);
            } else {
              next.set(key, String(serialised));
            }
          }
          return next;
        },
        { replace }
      );
    },
    [setSearchParams]
  );

  return { params, setParams };
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Load the whole dashboard in one request.
 *
 * The endpoint answers 200 when everything succeeded and 207 when some sections
 * failed, and either way returns a section map. So this hook has two different
 * notions of failure, and the UI needs both:
 *
 *  - `query.error` — the *destination* could not be resolved. Nothing to show.
 *  - `sections[x].error` — one card failed. Everything else still renders.
 */
export function usePlan(params, { enabled = true } = {}) {
  const queryClient = useQueryClient();

  const queryParams = useMemo(() => {
    const payload = {
      city: params.city,
      days: params.days,
      style: params.style,
      travellers: params.travellers,
      radius: params.radius,
      homeCurrency: params.homeCurrency,
    };
    if (params.startDate) payload.startDate = params.startDate;
    if (params.endDate) payload.endDate = params.endDate;
    if (params.activities?.length) payload.activities = params.activities.join(',');
    return payload;
  }, [params]);

  const query = useQuery({
    queryKey: api.keys.plan(queryParams),
    queryFn: () => api.getPlan(queryParams),
    enabled: enabled && Boolean(params.city),
    // The server caches upstream responses for 30–60 minutes, so a shorter
    // client stale time would only produce round trips that return cache hits.
    staleTime: 5 * 60 * 1000,
  });

  const plan = query.data?.data ?? null;

  /** Force a live re-fetch, bypassing the server cache. */
  const refresh = useCallback(async () => {
    await queryClient.fetchQuery({
      queryKey: api.keys.plan(queryParams),
      queryFn: () => api.getPlan({ ...queryParams, refresh: true }),
      staleTime: 0,
    });
  }, [queryClient, queryParams]);

  return {
    ...query,
    plan,
    location: plan?.location ?? null,
    sections: plan?.sections ?? {},
    health: plan?.health ?? null,
    queryParams,
    refresh,
  };
}

/**
 * Normalise one section into the props `SectionCard` expects.
 *
 * A section can be: absent (still loading), present-and-failed, or
 * present-and-fine. Collapsing that into `{ loading, error, data, meta }` in one
 * place stops every card re-deriving it.
 */
export function useSection(sections, name, { loading = false } = {}) {
  const section = sections?.[name];

  return useMemo(
    () => ({
      data: section?.ok ? section.data : null,
      meta: section?.meta ?? null,
      loading: loading && !section,
      error: section && !section.ok ? section.error : null,
      ok: Boolean(section?.ok),
    }),
    [section, loading]
  );
}

export default usePlan;
