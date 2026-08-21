import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { usePreferences } from '../context/PreferencesContext.jsx';
import DestinationSearch from '../components/search/DestinationSearch.jsx';
import { SectionError, EmptyState } from '../components/ui/SectionCard.jsx';
import { Badge, Notice } from '../components/ui/Badge.jsx';
import { SkeletonList } from '../components/ui/Skeleton.jsx';
import { TravelGlyph, WeatherGlyph } from '../components/ui/Glyphs.jsx';
import {
  ArrowRightIcon,
  MapPinIcon,
  PlusIcon,
  RouteIcon,
  SpinnerIcon,
  XIcon,
} from '../components/ui/Icons.jsx';
import { formatMoney, formatTemp, pluralise } from '../lib/format.js';

const VALID_STYLES = new Set(['backpacker', 'budget', 'midrange', 'comfort', 'luxury']);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Multi-city itinerary builder.
 *
 * Submitted itinerary parameters live in the URL. The form remains an editable
 * draft, but once built, the route is bookmarkable and can recreate the result
 * after a refresh or after visiting a stop dashboard and pressing Back.
 */
export default function MultiCityPage() {
  const [searchParams] = useSearchParams();

  // Remount only when the submitted URL changes. Draft edits remain local, while
  // browser Back/Forward restores controls and results from the same itinerary.
  return <MultiCityPlanner key={searchParams.toString()} />;
}

function MultiCityPlanner() {
  const { homeCurrency: preferredCurrency } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();

  const submitted = useMemo(() => {
    const cities = searchParams
      .getAll('city')
      .map((city) => city.trim())
      .filter(Boolean)
      .slice(0, 8);
    const rawStyle = searchParams.get('style') ?? 'midrange';

    return {
      cities,
      nightsPerStop: clamp(Number(searchParams.get('nightsPerStop')) || 2, 1, 30),
      style: VALID_STYLES.has(rawStyle) ? rawStyle : 'midrange',
      homeCurrency: searchParams.get('homeCurrency') || preferredCurrency,
    };
  }, [searchParams, preferredCurrency]);

  const hasSubmittedItinerary = submitted.cities.length >= 2;
  const [cities, setCities] = useState(() => (hasSubmittedItinerary ? submitted.cities : ['', '']));
  const [nightsPerStop, setNightsPerStop] = useState(submitted.nightsPerStop);
  const [style, setStyle] = useState(submitted.style);

  const itinerary = useQuery({
    queryKey: api.keys.multiCity(submitted),
    queryFn: () => api.getMultiCityItinerary(submitted),
    enabled: hasSubmittedItinerary,
    staleTime: 30 * 60 * 1000,
  });

  const filled = cities.map((city) => city.trim()).filter(Boolean);
  const canSubmit = filled.length >= 2;

  const setCity = (index, value) =>
    setCities((current) => current.map((city, i) => (i === index ? value : city)));

  const addStop = () => setCities((current) => (current.length >= 8 ? current : [...current, '']));

  const removeStop = (index) =>
    setCities((current) => (current.length <= 2 ? current : current.filter((_, i) => i !== index)));

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    const next = new URLSearchParams();
    filled.forEach((city) => next.append('city', city));
    next.set('nightsPerStop', String(nightsPerStop));
    next.set('style', style);
    next.set('homeCurrency', preferredCurrency);

    if (next.toString() === searchParams.toString()) {
      itinerary.refetch();
    } else {
      setSearchParams(next);
    }
  };

  const result = itinerary.data;

  return (
    <div className="tm-page max-w-5xl">
      <header className="relative overflow-hidden rounded-[2rem] bg-brand-950 px-6 py-10 text-white sm:px-10 sm:py-12">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full border border-white/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-3 top-6 size-40 rounded-full border border-white/10"
          aria-hidden="true"
        />
        <div className="relative max-w-2xl">
          <p className="tm-eyebrow !text-brand-200">
            <RouteIcon className="size-4" />
            One journey, many chapters
          </p>
          <h1 className="tm-display mt-4 text-4xl leading-tight sm:text-5xl">
            Build a multi-city itinerary
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/70 sm:text-base">
            Chain up to eight destinations. Each stop gets its own weather, sights and budget, plus
            an estimated hop from the previous city.
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------------- Form */}
      <form onSubmit={submit} className="tm-card tm-card-pad mt-6 space-y-4">
        <ol className="space-y-3">
          {cities.map((city, index) => (
            <li key={index} className="flex items-end gap-2">
              <span className="mb-2.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor={`stop-${index}`} className="tm-label mb-1.5 block">
                  {index === 0
                    ? 'Start'
                    : index === cities.length - 1
                      ? 'Final stop'
                      : `Stop ${index + 1}`}
                </label>
                <div>
                  <DestinationSearch
                    id={`stop-${index}`}
                    value={city}
                    onChange={(value) => setCity(index, value)}
                    onSelect={(option) => setCity(index, option.name)}
                    size="sm"
                    placeholder="City name"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeStop(index)}
                disabled={cities.length <= 2}
                className="tm-btn-ghost mb-0.5 px-2 py-2 disabled:opacity-30"
                aria-label={`Remove stop ${index + 1}`}
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={addStop}
          disabled={cities.length >= 8}
          className="tm-btn-secondary text-sm"
        >
          <PlusIcon className="size-4" />
          Add a stop
          {cities.length >= 8 ? ' (max 8)' : ''}
        </button>

        <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <label htmlFor="nights" className="tm-label mb-1.5 block">
              Nights per stop
            </label>
            <input
              id="nights"
              type="number"
              min={1}
              max={30}
              value={nightsPerStop}
              onChange={(event) =>
                setNightsPerStop(Math.min(30, Math.max(1, Number(event.target.value) || 1)))
              }
              className="tm-input w-24 py-2 tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="mc-style" className="tm-label mb-1.5 block">
              Travel style
            </label>
            <select
              id="mc-style"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
              className="tm-input py-2"
            >
              {['backpacker', 'budget', 'midrange', 'comfort', 'luxury'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || itinerary.isFetching}
            className="tm-btn-primary ml-auto px-6 py-2.5"
          >
            {itinerary.isFetching ? (
              <SpinnerIcon className="size-4" />
            ) : (
              <RouteIcon className="size-4" />
            )}
            Build itinerary
          </button>
        </div>

        {!canSubmit ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enter at least two cities to build a route.
          </p>
        ) : null}
      </form>

      {/* ----------------------------------------------------------- Result */}
      <div className="mt-6">
        {hasSubmittedItinerary && itinerary.isPending ? (
          <div className="tm-card tm-card-pad">
            <SkeletonList rows={4} />
            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              Planning {pluralise(submitted.cities.length, 'stop')} — this fans out to every
              provider for each city.
            </p>
          </div>
        ) : itinerary.isError ? (
          <div className="tm-card tm-card-pad">
            <SectionError
              error={itinerary.error}
              onRetry={() => itinerary.refetch()}
              title="This itinerary"
            />
          </div>
        ) : result ? (
          <ItineraryResult result={result} itinerary={submitted} />
        ) : (
          <div className="tm-card tm-card-pad">
            <EmptyState
              icon={RouteIcon}
              title="No itinerary yet"
              description="Add your stops above and press “Build itinerary”."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ItineraryResult({ result, itinerary }) {
  const routeCities = result.stops.map((stop) => stop.location.name);

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="tm-card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Total label="Cities" value={result.totals.cities} />
        <Total label="Nights" value={result.totals.nights} />
        <Total
          label="Travel time"
          value={`${Math.round(result.totals.travelMinutes / 60)} h`}
          hint={`${result.totals.travelKm.toLocaleString()} km`}
        />
        <Total
          label="Est. budget"
          value={formatMoney(result.totals.estimatedBudgetUsd, 'USD')}
          hint="all stops, per person"
        />
      </div>

      {result.unresolved?.length ? (
        <Notice tone="warning">
          Could not resolve {result.unresolved.map((item) => `“${item.requested}”`).join(', ')}. The
          itinerary below covers the stops that did resolve.
        </Notice>
      ) : null}

      {/* Stops and legs */}
      <ol className="space-y-3">
        {result.stops.map((stop, index) => (
          <li key={`${stop.location.name}-${index}`}>
            {stop.travelFromPrevious ? <Leg leg={stop.travelFromPrevious} /> : null}
            <StopCard stop={stop} index={index} itinerary={itinerary} routeCities={routeCities} />
          </li>
        ))}
      </ol>

      <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
        Travel times are estimates from straight-line distance, a routing factor and a realistic
        door-to-door speed for each mode — not a routing engine. Check real schedules before
        booking.
      </p>
    </div>
  );
}

function Leg({ leg }) {
  return (
    <div className="flex items-center gap-2 py-2 pl-4 text-xs text-slate-500 dark:text-slate-400">
      <span className="h-6 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
      <TravelGlyph mode={leg.mode} className="size-4 shrink-0" />
      <span>
        {leg.modeLabel} · {leg.durationLabel} · ~{leg.estimatedRouteKm.toLocaleString()} km
      </span>
      <Badge tone="neutral" className="!text-[10px]">
        estimate
      </Badge>
    </div>
  );
}

function StopCard({ stop, index, itinerary, routeCities }) {
  const weather = stop.sections?.weather?.ok ? stop.sections.weather.data : null;
  const places = stop.sections?.places?.ok ? stop.sections.places.data : null;
  const budget = stop.sections?.budget?.ok ? stop.sections.budget.data : null;
  const photo = stop.sections?.photo?.ok ? stop.sections.photo.data : null;
  const dashboardHref = buildDashboardHref({ stop, index, itinerary, routeCities });

  return (
    <article className="tm-card overflow-hidden">
      <div className="flex gap-4 p-4">
        {photo?.thumbUrl ? (
          <figure className="hidden w-20 shrink-0 sm:block">
            <img
              src={photo.thumbUrl}
              alt=""
              loading="lazy"
              className="size-20 rounded-lg object-cover"
            />
            {photo.credit?.name &&
            (photo.attributionRequired || photo.provider?.toLowerCase() === 'unsplash') ? (
              <figcaption className="mt-1 truncate text-[9px] text-stone-400 dark:text-stone-500">
                Photo by{' '}
                <a
                  href={photo.credit.profileUrl ?? photo.credit.sourceUrl ?? '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:underline"
                >
                  {photo.credit.name}
                </a>
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                Stop {index + 1}
              </p>
              <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                {stop.location.name}
              </h3>
              <p className="flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
                <MapPinIcon className="size-3.5" />
                {stop.location.label}
              </p>
            </div>

            <Link to={dashboardHref} className="tm-btn-secondary shrink-0 text-xs">
              Open stop
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {weather ? (
              <div className="flex items-center gap-1.5">
                <WeatherGlyph
                  condition={weather.summary.dominantCondition}
                  className="size-4"
                  label={weather.summary.dominantCondition}
                />
                <dd className="tabular-nums text-slate-700 dark:text-slate-300">
                  {formatTemp(weather.summary.minC)} – {formatTemp(weather.summary.maxC)}
                </dd>
              </div>
            ) : null}

            {weather?.summary.wetDays > 0 ? (
              <div>
                <dd className="text-slate-600 dark:text-slate-400">
                  {pluralise(weather.summary.wetDays, 'wet day')}
                </dd>
              </div>
            ) : null}

            {places ? (
              <div>
                <dd className="text-slate-600 dark:text-slate-400">
                  {places.counts.attractions} sights · {places.counts.restaurants} places to eat
                </dd>
              </div>
            ) : null}

            {budget ? (
              <div>
                <dd className="text-slate-600 dark:text-slate-400">
                  {formatMoney(
                    budget.perPersonPerDay?.home?.amount ?? budget.perPersonPerDay?.usd,
                    budget.perPersonPerDay?.home?.currency ?? 'USD'
                  )}
                  /day
                </dd>
              </div>
            ) : null}
          </dl>

          {places?.attractions?.length ? (
            <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
              Highlights:{' '}
              {places.attractions
                .slice(0, 3)
                .map((place) => place.name)
                .join(' · ')}
            </p>
          ) : null}

          {stop.health?.failed?.length ? (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              {stop.health.failed.join(', ')} unavailable for this stop.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Total({ label, value, hint }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {hint ? <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
}

function buildDashboardHref({ stop, index, itinerary, routeCities }) {
  const params = new URLSearchParams({
    city: stop.location.name,
    days: String(stop.trip.days),
    style: itinerary.style,
    homeCurrency: itinerary.homeCurrency,
    itineraryStyle: itinerary.style,
    itineraryHomeCurrency: itinerary.homeCurrency,
    routeIndex: String(index),
    nightsPerStop: String(itinerary.nightsPerStop),
  });

  routeCities.forEach((city) => params.append('routeCity', city));
  itinerary.cities.forEach((city) => params.append('itineraryCity', city));

  return `/plan?${params.toString()}`;
}
