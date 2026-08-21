import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import TripSnapshotView from '../components/TripSnapshotView.jsx';
import TripHero, { HeroBadge } from '../components/cards/TripHero.jsx';
import { SectionError, EmptyState } from '../components/ui/SectionCard.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { CompassIcon, LinkIcon } from '../components/ui/Icons.jsx';
import { formatRelative, pluralise } from '../lib/format.js';

/**
 * Public, read-only trip view.
 *
 * No authentication, and none needed: the server serves a projection with the
 * owner's id and the share record stripped out. Because the page reads a stored
 * snapshot rather than re-planning, a shared link costs zero API credits no
 * matter how many people open it — which is what makes sharing safe to offer at
 * all on free-tier providers.
 */
export default function SharedTripPage() {
  const { token } = useParams();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: api.keys.shared(token),
    queryFn: () => api.getSharedTrip(token),
    retry: false,
  });

  const trip = data?.data;

  if (isLoading) {
    return (
      <div className="tm-page space-y-7">
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    const gone = error.status === 404;
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="tm-card tm-card-pad">
          {gone ? (
            <EmptyState
              icon={LinkIcon}
              title="This link is no longer active"
              description="The trip may have been deleted, or its owner turned sharing off."
              action={
                <Link to="/" className="tm-btn-primary">
                  <CompassIcon className="size-4" />
                  Plan your own trip
                </Link>
              }
            />
          ) : (
            <SectionError error={error} onRetry={refetch} title="This shared trip" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tm-page space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm dark:border-brand-800 dark:bg-brand-950/50">
        <p className="flex items-center gap-2 text-brand-900 dark:text-brand-200">
          <LinkIcon className="size-4 shrink-0" />
          You are viewing a shared itinerary — read only.
        </p>
        <Link
          to="/"
          className="shrink-0 text-xs font-semibold text-brand-800 hover:underline dark:text-brand-200"
        >
          Plan your own trip →
        </Link>
      </div>

      <TripHero
        location={trip.destination}
        photo={trip.coverPhoto}
        startDate={trip.startDate}
        endDate={trip.endDate}
        days={trip.durationDays}
        badges={
          <>
            <HeroBadge>shared itinerary</HeroBadge>
            {trip.tags?.map((tag) => (
              <HeroBadge key={tag}>{tag}</HeroBadge>
            ))}
          </>
        }
      />

      <TripSnapshotView trip={trip} readOnly />

      <footer className="border-t border-slate-200 pt-5 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <p>
          Snapshot captured {formatRelative(trip.snapshot?.capturedAt)}
          {data?.meta?.snapshotAgeDays !== null && data?.meta?.snapshotAgeDays !== undefined
            ? ` (${pluralise(data.meta.snapshotAgeDays, 'day')} old)`
            : ''}
          . Re-check forecasts and opening hours before travelling.
        </p>
        <Link
          to="/"
          className="mt-3 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline dark:text-brand-300"
        >
          <CompassIcon className="size-4" />
          Build a dashboard for your own destination
        </Link>
      </footer>
    </div>
  );
}
