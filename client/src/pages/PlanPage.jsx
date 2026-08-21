import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { usePlan, useSection, useTripParams } from '../hooks/usePlan.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../api/endpoints.js';

import TripHero, { HeroBadge } from '../components/cards/TripHero.jsx';
import WeatherCard from '../components/cards/WeatherCard.jsx';
import PlacesCard from '../components/cards/PlacesCard.jsx';
import PoiMap from '../components/cards/PoiMap.jsx';
import CurrencyCard from '../components/cards/CurrencyCard.jsx';
import CountryCard from '../components/cards/CountryCard.jsx';
import AiBriefingCard from '../components/cards/AiBriefingCard.jsx';
import PackingCard from '../components/cards/PackingCard.jsx';
import BudgetCard from '../components/cards/BudgetCard.jsx';
import ClimateCard from '../components/cards/ClimateCard.jsx';
import DestinationSearch from '../components/search/DestinationSearch.jsx';
import { SectionError } from '../components/ui/SectionCard.jsx';
import { Notice } from '../components/ui/Badge.jsx';
import {
  BookmarkIcon,
  ChevronRightIcon,
  CompassIcon,
  RefreshIcon,
  RouteIcon,
  SearchIcon,
  SpinnerIcon,
} from '../components/ui/Icons.jsx';

/**
 * The trip dashboard.
 *
 * One `GET /api/plan` call populates every card. Because the API resolves each
 * section independently and reports which ones failed, this page renders whatever
 * succeeded and shows an inline, retryable error only on the cards that did not —
 * which is the "don't let one failed API break the page" requirement, enforced by
 * the data shape rather than by defensive code in each card.
 */
export default function PlanPage() {
  const { params, setParams } = useTripParams();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { homeCurrency } = usePreferences();
  const toast = useToast();
  const navigate = useNavigate();

  const itineraryNavigation = useMemo(() => readItineraryNavigation(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState({ city: params.city, value: params.city });
  const searchValue = searchDraft.city === params.city ? searchDraft.value : params.city;
  const setSearchValue = (value) => setSearchDraft({ city: params.city, value });
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [packed, setPacked] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const { plan, sections, health, isLoading, isFetching, error, refresh } = usePlan(params);

  const weather = useSection(sections, 'weather', { loading: isLoading });
  const places = useSection(sections, 'places', { loading: isLoading });
  const country = useSection(sections, 'country', { loading: isLoading });
  const photo = useSection(sections, 'photo', { loading: isLoading });
  const currency = useSection(sections, 'currency', { loading: isLoading });
  const budget = useSection(sections, 'budget', { loading: isLoading });
  const packing = useSection(sections, 'packing', { loading: isLoading });
  const ai = useSection(sections, 'ai', { loading: isLoading });

  /* Both lists feed the map, so a food pin and a sight pin coexist. */
  const mapPlaces = useMemo(() => {
    if (!places.data) return [];
    return [...places.data.attractions, ...places.data.restaurants];
  }, [places.data]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      toast.success('Refreshed from the live providers');
    } catch (refreshError) {
      toast.error(refreshError.message ?? 'Could not refresh right now');
    } finally {
      setRefreshing(false);
    }
  }, [refresh, toast]);

  const saveTrip = useMutation({
    mutationFn: () =>
      api.createTrip({
        city: params.city,
        startDate: params.startDate ?? undefined,
        endDate: params.endDate ?? undefined,
        days: params.startDate && params.endDate ? undefined : params.days,
        travellers: params.travellers,
        style: params.style,
        homeCurrency: params.homeCurrency,
        activities: params.activities?.length ? params.activities.join(',') : undefined,
      }),
    onSuccess: (trip) => {
      toast.success(`Saved "${trip.title}"`, {
        action: { label: 'Open it', onClick: () => navigate(`/trips/${trip.id}`) },
      });
    },
    onError: (saveError) => toast.error(saveError.message ?? 'Could not save this trip'),
  });

  /* ------------------------------------------------------------- no city yet */
  if (!params.city) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <CompassIcon className="mx-auto size-10 text-slate-300 dark:text-slate-600" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Where would you like to go?
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Enter a city and TrailMate will build the dashboard.
        </p>
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (searchValue.trim()) setParams({ city: searchValue.trim(), days: 5 });
          }}
        >
          <DestinationSearch
            value={searchValue}
            onChange={setSearchValue}
            onSelect={(option) => setParams({ city: option.name, days: 5 })}
            autoFocus
          />
        </form>
      </div>
    );
  }

  /* --------------------------------------------- destination unresolvable */
  if (error) {
    return (
      <div className="tm-page space-y-7">
        {itineraryNavigation ? (
          <ItineraryNavigator navigation={itineraryNavigation} searchParams={searchParams} />
        ) : null}

        <div className="mx-auto max-w-2xl py-10">
          <div className="tm-card tm-card-pad">
            <SectionError error={error} onRetry={handleRefresh} title="This destination" />
            <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
              <p className="tm-label mb-2">Try another destination</p>
              <DestinationSearch
                value={searchValue}
                onChange={setSearchValue}
                onSelect={(option) =>
                  setParams({
                    city: option.name,
                    routeIndex: null,
                    routeCity: null,
                    itineraryCity: null,
                    nightsPerStop: null,
                  })
                }
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const failedCount = health?.failed?.length ?? 0;

  return (
    <div className="tm-page space-y-7">
      {itineraryNavigation ? (
        <ItineraryNavigator navigation={itineraryNavigation} searchParams={searchParams} />
      ) : null}

      {/* ------------------------------------------------------------- Hero */}
      <TripHero
        location={plan?.location}
        photo={photo.data}
        photoLoading={photo.loading}
        startDate={params.startDate}
        endDate={params.endDate}
        days={params.days}
        travellers={params.travellers}
        badges={
          <>
            {weather.data ? (
              <HeroBadge>{weather.data.summary.dominantCondition.replace('-', ' ')}</HeroBadge>
            ) : null}
            {country.data?.primaryCurrency ? (
              <HeroBadge>{country.data.primaryCurrency.code}</HeroBadge>
            ) : null}
            {places.data ? <HeroBadge>{places.data.counts.total} places</HeroBadge> : null}
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || isFetching}
              className="tm-btn bg-white/15 text-white backdrop-blur hover:bg-white/25"
              title="Bypass the cache and re-fetch every source"
            >
              {refreshing ? <SpinnerIcon className="size-4" /> : <RefreshIcon className="size-4" />}
              Refresh
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => saveTrip.mutate()}
                disabled={saveTrip.isPending || isLoading}
                className="tm-btn bg-white text-slate-900 hover:bg-slate-100"
              >
                {saveTrip.isPending ? (
                  <SpinnerIcon className="size-4" />
                ) : (
                  <BookmarkIcon className="size-4" />
                )}
                Save trip
              </button>
            ) : (
              <Link
                to="/login"
                state={{ from: `${window.location.pathname}${window.location.search}` }}
                className="tm-btn bg-white text-slate-900 hover:bg-slate-100"
              >
                <BookmarkIcon className="size-4" />
                Sign in to save
              </Link>
            )}
          </>
        }
      />

      {/* --------------------------------------------------- Controls strip */}
      <div className="tm-card flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-56 flex-1">
          <label htmlFor="change-destination" className="tm-label mb-1.5 block">
            Destination
          </label>
          <div>
            <DestinationSearch
              id="change-destination"
              value={searchValue}
              onChange={setSearchValue}
              onSelect={(option) => {
                setSelectedPlaceId(null);
                setParams({
                  city: option.name,
                  routeIndex: null,
                  routeCity: null,
                  itineraryCity: null,
                  nightsPerStop: null,
                });
              }}
              size="sm"
              placeholder={params.city}
            />
          </div>
        </div>

        <div>
          <label htmlFor="trip-days" className="tm-label mb-1.5 block">
            Days
          </label>
          <select
            id="trip-days"
            value={params.days}
            onChange={(event) =>
              setParams({ days: event.target.value, startDate: null, endDate: null })
            }
            className="tm-input py-2"
            disabled={Boolean(params.startDate && params.endDate)}
            title={
              params.startDate && params.endDate ? 'Length comes from your chosen dates' : undefined
            }
          >
            {[3, 5, 7, 10, 14].map((value) => (
              <option key={value} value={value}>
                {value} days
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="trip-travellers" className="tm-label mb-1.5 block">
            Travellers
          </label>
          <input
            id="trip-travellers"
            type="number"
            min={1}
            max={20}
            value={params.travellers}
            onChange={(event) => setParams({ travellers: event.target.value })}
            className="tm-input w-20 py-2 tabular-nums"
          />
        </div>

        <div>
          <label htmlFor="poi-radius" className="tm-label mb-1.5 block">
            Search radius
          </label>
          <select
            id="poi-radius"
            value={params.radius}
            onChange={(event) => setParams({ radius: event.target.value })}
            className="tm-input py-2"
          >
            {[
              [2000, '2 km'],
              [5000, '5 km'],
              [10000, '10 km'],
              [20000, '20 km'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {isFetching && !isLoading ? (
          <span className="flex items-center gap-1.5 pb-2 text-xs text-slate-500 dark:text-slate-400">
            <SpinnerIcon className="size-3.5" />
            Updating
          </span>
        ) : null}
      </div>

      {failedCount > 0 ? (
        <Notice tone="warning">
          {failedCount === 1 ? 'One section' : `${failedCount} sections`} could not be loaded (
          {health.failed.join(', ')}). Everything else on this page is live — use the retry button
          on the affected card.
        </Notice>
      ) : null}

      {/* ------------------------------------------------------------ Cards */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <WeatherCard {...weather} onRetry={handleRefresh} tripDays={params.days} />

          <PoiMap
            location={plan?.location}
            places={mapPlaces}
            bounds={places.data?.bounds}
            loading={places.loading}
            error={places.error}
            onRetry={handleRefresh}
            selectedId={selectedPlaceId}
            onSelect={setSelectedPlaceId}
          />

          <AiBriefingCard
            {...ai}
            onRetry={handleRefresh}
            onRegenerate={handleRefresh}
            regenerating={refreshing}
          />

          <ClimateCard city={params.city} />
        </div>

        <div className="space-y-5">
          <PlacesCard
            {...places}
            onRetry={handleRefresh}
            selectedId={selectedPlaceId}
            onSelect={setSelectedPlaceId}
          />

          <CurrencyCard {...currency} onRetry={handleRefresh} homeCurrency={homeCurrency} />

          <CountryCard {...country} onRetry={handleRefresh} timezone={plan?.location?.timezone} />

          <BudgetCard
            {...budget}
            onRetry={handleRefresh}
            style={params.style}
            onStyleChange={(style) => setParams({ style })}
          />

          <PackingCard
            {...packing}
            onRetry={handleRefresh}
            checked={packed}
            onToggle={(key) => setPacked((current) => ({ ...current, [key]: !current[key] }))}
          />
        </div>
      </div>

      <p className="pt-2 text-center text-xs text-slate-400 dark:text-slate-500">
        <SearchIcon className="mr-1 inline size-3.5 align-[-2px]" />
        This whole page is one request to the TrailMate API, which fanned out to{' '}
        {health?.requested?.length ?? 0} sources, normalised every response and cached the results.
      </p>
    </div>
  );
}

function readItineraryNavigation(searchParams) {
  const routeCities = searchParams
    .getAll('routeCity')
    .map((city) => city.trim())
    .filter(Boolean);
  const routeIndex = Number(searchParams.get('routeIndex'));

  if (routeCities.length < 2 || !Number.isInteger(routeIndex) || !routeCities[routeIndex]) {
    return null;
  }

  const itineraryCities = searchParams.getAll('itineraryCity').filter(Boolean);
  const returnParams = new URLSearchParams();
  (itineraryCities.length >= 2 ? itineraryCities : routeCities).forEach((city) =>
    returnParams.append('city', city)
  );
  returnParams.set('nightsPerStop', searchParams.get('nightsPerStop') || '2');
  returnParams.set(
    'style',
    searchParams.get('itineraryStyle') || searchParams.get('style') || 'midrange'
  );
  const homeCurrency =
    searchParams.get('itineraryHomeCurrency') || searchParams.get('homeCurrency');
  if (homeCurrency) returnParams.set('homeCurrency', homeCurrency);

  return {
    routeCities,
    routeIndex,
    returnHref: `/multi-city?${returnParams.toString()}`,
  };
}

function buildItineraryStopHref(searchParams, city, index) {
  const next = new URLSearchParams(searchParams);
  next.set('city', city);
  next.set('routeIndex', String(index));
  return `/plan?${next.toString()}`;
}

function ItineraryNavigator({ navigation, searchParams }) {
  const { routeCities, routeIndex, returnHref } = navigation;
  const previousIndex = routeIndex - 1;
  const nextIndex = routeIndex + 1;

  return (
    <section className="tm-card p-4" aria-label="Multi-city itinerary navigation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={returnHref} className="tm-btn-ghost text-sm">
          <RouteIcon className="size-4" />
          Back to itinerary
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Stop {routeIndex + 1} of {routeCities.length}
        </p>
      </div>

      <nav className="mt-3 flex items-center gap-2" aria-label="Itinerary destinations">
        {previousIndex >= 0 ? (
          <Link
            to={buildItineraryStopHref(searchParams, routeCities[previousIndex], previousIndex)}
            className="tm-btn-secondary shrink-0 px-2.5"
            aria-label={`Previous stop: ${routeCities[previousIndex]}`}
          >
            <ChevronRightIcon className="size-4 rotate-180" />
            <span className="hidden sm:inline">Previous</span>
          </Link>
        ) : (
          <span className="tm-btn-secondary shrink-0 px-2.5 opacity-40" aria-hidden="true">
            <ChevronRightIcon className="size-4 rotate-180" />
            <span className="hidden sm:inline">Previous</span>
          </span>
        )}

        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
          {routeCities.map((city, index) =>
            index === routeIndex ? (
              <span
                key={`${city}-${index}`}
                className="shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                aria-current="page"
              >
                {index + 1}. {city}
              </span>
            ) : (
              <Link
                key={`${city}-${index}`}
                to={buildItineraryStopHref(searchParams, city, index)}
                className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-brand-100 hover:text-brand-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-brand-900 dark:hover:text-brand-200"
              >
                {index + 1}. {city}
              </Link>
            )
          )}
        </div>

        {nextIndex < routeCities.length ? (
          <Link
            to={buildItineraryStopHref(searchParams, routeCities[nextIndex], nextIndex)}
            className="tm-btn-secondary shrink-0 px-2.5"
            aria-label={`Next stop: ${routeCities[nextIndex]}`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRightIcon className="size-4" />
          </Link>
        ) : (
          <span className="tm-btn-secondary shrink-0 px-2.5 opacity-40" aria-hidden="true">
            <span className="hidden sm:inline">Next</span>
            <ChevronRightIcon className="size-4" />
          </span>
        )}
      </nav>
    </section>
  );
}
