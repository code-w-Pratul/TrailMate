import { useMemo, useState } from 'react';
import WeatherCard from './cards/WeatherCard.jsx';
import PlacesCard from './cards/PlacesCard.jsx';
import PoiMap from './cards/PoiMap.jsx';
import CurrencyCard from './cards/CurrencyCard.jsx';
import CountryCard from './cards/CountryCard.jsx';
import AiBriefingCard from './cards/AiBriefingCard.jsx';
import BudgetCard from './cards/BudgetCard.jsx';
import PackingCard from './cards/PackingCard.jsx';
import { Notice } from './ui/Badge.jsx';
import { EmptyState } from './ui/SectionCard.jsx';
import { CalendarIcon } from './ui/Icons.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { useNow } from '../hooks/useNow.js';
import { formatRelative } from '../lib/format.js';

/**
 * Renders a saved trip from its stored snapshot.
 *
 * Shared by the owner's trip page and the public share page, so both show
 * exactly the same thing — the difference is only which actions are available.
 *
 * The snapshot is historical by design: it is what the dashboard looked like when
 * the trip was saved. Rather than pretend it is live, the age is stated plainly and
 * a refresh is offered to the owner. Every card is passed `meta` describing the
 * capture time, which makes the cache badge read "cached · 3 days ago" instead of
 * implying freshness.
 */
export default function TripSnapshotView({
  trip,
  onRefresh,
  refreshing = false,
  packingChecked,
  onTogglePacked,
  readOnly = false,
}) {
  const { homeCurrency } = usePreferences();
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  // Clock read from state, not `Date.now()` in the render body: render must be
  // idempotent, and this also makes the age text tick forward on its own.
  const now = useNow(60_000);

  const snapshot = trip?.snapshot ?? {};
  const capturedAt = snapshot.capturedAt;
  const places = snapshot.places;
  const packingList = trip?.packingList;

  /** Age of the snapshot, surfaced through the normal cache-badge machinery. */
  const snapshotMeta = useMemo(() => {
    if (!capturedAt) return null;
    const ageSeconds = Math.max(0, Math.round((now - new Date(capturedAt).getTime()) / 1000));
    return {
      cached: true,
      stale: ageSeconds > 86_400,
      degraded: false,
      ageSeconds,
      fetchedAt: capturedAt,
    };
  }, [capturedAt, now]);

  const mapPlaces = useMemo(() => {
    if (!places) return [];
    return [...(places.attractions ?? []), ...(places.restaurants ?? [])];
  }, [places]);

  /* A stored packing list is the source of truth once a trip is saved. */
  const packingData = useMemo(() => {
    if (!packingList?.length) return null;
    const categories = [];
    for (const item of packingList) {
      const name = item.category ?? 'general';
      let group = categories.find((entry) => entry.name === name);
      if (!group) {
        group = { name, label: name[0].toUpperCase() + name.slice(1), items: [] };
        categories.push(group);
      }
      group.items.push(item);
    }
    return {
      items: packingList,
      categories,
      totals: {
        items: packingList.length,
        essentials: packingList.filter((item) => item.essential).length,
        categories: categories.length,
      },
      note: null,
    };
  }, [packingList]);

  const ageDays = capturedAt
    ? Math.round((now - new Date(capturedAt).getTime()) / 86_400_000)
    : null;

  const nothingCaptured =
    !snapshot.weather && !snapshot.places && !snapshot.country && !snapshot.budget;

  if (nothingCaptured) {
    return (
      <div className="tm-card tm-card-pad">
        <EmptyState
          icon={CalendarIcon}
          title="This trip has no captured data"
          description="It was saved while the data providers were unavailable."
          action={
            onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="tm-btn-primary"
                disabled={refreshing}
              >
                Capture it now
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {ageDays !== null && ageDays >= 3 ? (
        <Notice tone="warning">
          This snapshot was captured {formatRelative(capturedAt)}, so the forecast and opening hours
          will have moved on.
          {!readOnly && onRefresh ? ' Use “Refresh data” to re-capture it.' : ''}
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {snapshot.weather ? (
            <WeatherCard data={snapshot.weather} meta={snapshotMeta} tripDays={trip.durationDays} />
          ) : null}

          {mapPlaces.length ? (
            <PoiMap
              location={trip.destination}
              places={mapPlaces}
              bounds={snapshot.places?.bounds}
              selectedId={selectedPlaceId}
              onSelect={setSelectedPlaceId}
            />
          ) : null}

          {snapshot.aiSummary ? (
            <AiBriefingCard data={snapshot.aiSummary} meta={snapshotMeta} />
          ) : null}

          {trip.notes ? (
            <section className="tm-card tm-card-pad">
              <h2 className="tm-label mb-2">Your notes</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {trip.notes}
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-5">
          {snapshot.places ? (
            <PlacesCard
              data={snapshot.places}
              meta={snapshotMeta}
              selectedId={selectedPlaceId}
              onSelect={setSelectedPlaceId}
            />
          ) : null}

          {snapshot.currency ? (
            <CurrencyCard
              data={snapshot.currency}
              meta={snapshotMeta}
              homeCurrency={homeCurrency}
            />
          ) : null}

          {snapshot.country ? (
            <CountryCard
              data={snapshot.country}
              meta={snapshotMeta}
              timezone={trip.destination?.timezone}
            />
          ) : null}

          {snapshot.budget ? (
            <BudgetCard
              data={snapshot.budget}
              meta={snapshotMeta}
              style={snapshot.budget.style?.key}
            />
          ) : null}

          {packingData ? (
            <PackingCard
              data={packingData}
              meta={snapshotMeta}
              checked={packingChecked}
              onToggle={readOnly ? undefined : onTogglePacked}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
