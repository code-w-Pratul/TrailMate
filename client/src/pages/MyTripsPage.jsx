import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { EmptyState } from '../components/ui/SectionCard.jsx';
import { SkeletonList } from '../components/ui/Skeleton.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import {
  BookmarkIcon,
  CalendarIcon,
  CompassIcon,
  MapPinIcon,
  RouteIcon,
  SearchIcon,
  ShareIcon,
  SpinnerIcon,
  TrashIcon,
} from '../components/ui/Icons.jsx';
import { formatDateRange, formatRelative, pluralise } from '../lib/format.js';

const SORTS = [
  ['newest', 'Recently saved'],
  ['startDate', 'Departure date'],
  ['title', 'Name'],
  ['oldest', 'Oldest first'],
];

/** Saved trips, with search, sorting and pagination. */
export default function MyTripsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const queryClient = useQueryClient();
  const toast = useToast();

  const params = { page, limit: 12, sort, ...(debouncedSearch ? { q: debouncedSearch } : {}) };

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: api.keys.trips.list(params),
    queryFn: () => api.listTrips(params),
    // Keep the previous page visible while the next one loads: no layout flash.
    placeholderData: (previous) => previous,
  });

  const trips = data?.data ?? [];
  const meta = data?.meta;

  const remove = useMutation({
    mutationFn: (id) => api.deleteTrip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: api.keys.trips.all });
      toast.success('Trip deleted');
    },
    onError: (deleteError) => toast.error(deleteError.message ?? 'Could not delete that trip'),
  });

  return (
    <div className="tm-page">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-stone-300 pb-8 dark:border-stone-700">
        <div>
          <p className="tm-eyebrow">
            <BookmarkIcon className="size-3.5" />
            Personal collection
          </p>
          <h1 className="tm-page-title mt-3">My trips</h1>
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
            {meta?.total !== undefined
              ? `${pluralise(meta.total, 'saved trip')}`
              : 'Your saved trip snapshots'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="trip-search" className="tm-label mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="trip-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="City or title"
                className="tm-input py-2 pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="trip-sort" className="tm-label mb-1.5 block">
              Sort
            </label>
            <select
              id="trip-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
              className="tm-input py-2"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <Link to="/" className="tm-btn-primary">
            <CompassIcon className="size-4" />
            Plan a new trip
          </Link>
        </div>
      </header>

      <div className="mt-6">
        {isLoading ? (
          <div className="tm-card tm-card-pad">
            <SkeletonList rows={5} />
          </div>
        ) : error ? (
          <div className="tm-card tm-card-pad">
            <EmptyState
              icon={BookmarkIcon}
              title="Could not load your trips"
              description={error.message}
            />
          </div>
        ) : trips.length === 0 ? (
          <div className="tm-card tm-card-pad">
            <EmptyState
              icon={BookmarkIcon}
              title={
                debouncedSearch ? `Nothing matched “${debouncedSearch}”` : 'No saved trips yet'
              }
              description={
                debouncedSearch
                  ? 'Try a different city or clear the search.'
                  : 'Build a dashboard for a destination, then press “Save trip” to keep a snapshot of it.'
              }
              action={
                debouncedSearch ? (
                  <button type="button" className="tm-btn-secondary" onClick={() => setSearch('')}>
                    Clear search
                  </button>
                ) : (
                  <Link to="/" className="tm-btn-primary">
                    Plan your first trip
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onDelete={() => remove.mutate(trip.id)}
                  deleting={remove.isPending && remove.variables === trip.id}
                />
              ))}
            </ul>

            {meta && meta.totalPages > 1 ? (
              <nav
                className="mt-6 flex items-center justify-center gap-2"
                aria-label="Trips pagination"
              >
                <button
                  type="button"
                  className="tm-btn-secondary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!meta.hasPreviousPage || isFetching}
                >
                  Previous
                </button>
                <span className="px-2 text-sm text-slate-600 dark:text-slate-400">
                  Page {meta.page} of {meta.totalPages}
                </span>
                <button
                  type="button"
                  className="tm-btn-secondary"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!meta.hasNextPage || isFetching}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function TripCard({ trip, onDelete, deleting }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="tm-card group overflow-hidden">
      <Link to={`/trips/${trip.id}`} className="block">
        <div className="relative h-32 bg-gradient-to-br from-brand-700 to-slate-900">
          {trip.coverPhoto?.thumbUrl ? (
            <img
              src={trip.coverPhoto.thumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{trip.title}</p>
              <p className="flex items-center gap-1 truncate text-xs text-white/80">
                <MapPinIcon className="size-3.5" />
                {trip.destination?.name}
                {trip.destination?.country ? `, ${trip.destination.country}` : ''}
              </p>
            </div>
            {trip.isShared ? (
              <Badge tone="brand" className="!bg-white/20 !text-white" icon={ShareIcon}>
                shared
              </Badge>
            ) : null}
          </div>
        </div>
      </Link>

      <div className="space-y-2 p-4">
        {trip.coverPhoto?.credit?.name &&
        trip.coverPhoto?.provider?.toLowerCase() === 'unsplash' ? (
          <p className="truncate text-[10px] text-stone-400 dark:text-stone-500">
            Photo by{' '}
            <a
              href={trip.coverPhoto.credit.profileUrl ?? trip.coverPhoto.credit.sourceUrl ?? '#'}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-stone-700 hover:underline dark:hover:text-stone-300"
            >
              {trip.coverPhoto.credit.name}
            </a>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3.5" />
            {trip.startDate ? formatDateRange(trip.startDate, trip.endDate) : 'No dates set'}
          </span>
          {trip.durationDays ? <span>{pluralise(trip.durationDays, 'day')}</span> : null}
          {trip.isMultiCity ? (
            <span className="flex items-center gap-1">
              <RouteIcon className="size-3.5" />
              multi-city
            </span>
          ) : null}
        </div>

        {trip.tags?.length ? (
          <div className="flex flex-wrap gap-1">
            {trip.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Saved {formatRelative(trip.createdAt)}
          </p>

          {confirming ? (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
              >
                {deleting ? <SpinnerIcon className="size-3.5" /> : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-slate-500 hover:underline"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-rose-950"
              aria-label={`Delete ${trip.title}`}
            >
              <TrashIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
