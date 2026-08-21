import { useMemo, useState } from 'react';
import SectionCard, { EmptyState } from '../ui/SectionCard.jsx';
import { SkeletonList } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { CategoryGlyph } from '../ui/Glyphs.jsx';
import { categoryColor } from '../ui/iconMaps.js';
import { ExternalLinkIcon, MapPinIcon } from '../ui/Icons.jsx';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import { formatDistance, titleCase } from '../../lib/format.js';

/**
 * Attractions and food.
 *
 * Two tabs over one payload, because sights and restaurants are browsed
 * differently but come from the same request. Selecting a row lifts the
 * selection up to the map so the list and the pins stay in sync — the map is a
 * controlled component, not a second source of truth.
 */
export default function PlacesCard({
  data,
  meta,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  onHover,
}) {
  const [tab, setTab] = useState('attractions');
  const { distanceUnit } = usePreferences();

  const items = useMemo(() => {
    if (!data) return [];
    return tab === 'attractions' ? data.attractions : data.restaurants;
  }, [data, tab]);

  const counts = data?.counts ?? { attractions: 0, restaurants: 0 };

  return (
    <SectionCard
      title="Things to do"
      subtitle={
        data
          ? `Within ${formatDistance(data.radiusM, distanceUnit)} of the centre`
          : 'Nearby places'
      }
      icon={MapPinIcon}
      meta={meta}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={<SkeletonList rows={5} />}
      actions={
        data ? (
          <div
            role="tablist"
            aria-label="Place type"
            className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
          >
            {[
              ['attractions', 'Sights', counts.attractions],
              ['restaurants', 'Food', counts.restaurants],
            ].map(([key, label, count]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === key
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {label}
                <span className="ml-1 tabular-nums opacity-60">{count}</span>
              </button>
            ))}
          </div>
        ) : null
      }
      footer={
        data?.attribution?.length ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
            {data.attribution.map((item) => (
              <li key={item.label}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:underline"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null
      }
      bodyClassName="max-h-[30rem] overflow-y-auto"
    >
      {data ? (
        items.length ? (
          <ul className="space-y-1" role="list">
            {items.map((place) => (
              <PlaceRow
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                onSelect={onSelect}
                onHover={onHover}
                distanceUnit={distanceUnit}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={MapPinIcon}
            title={tab === 'attractions' ? 'No sights found nearby' : 'No restaurants found nearby'}
            description="Try widening the search radius, or a larger nearby city."
          />
        )
      ) : null}
    </SectionCard>
  );
}

function PlaceRow({ place, selected, onSelect, onHover, distanceUnit }) {
  const colour = categoryColor(place.category);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(selected ? null : place.id)}
        onMouseEnter={() => onHover?.(place.id)}
        onMouseLeave={() => onHover?.(null)}
        aria-pressed={selected}
        className={`flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors ${
          selected
            ? 'bg-brand-50 ring-1 ring-brand-300 dark:bg-brand-900/40 dark:ring-brand-700'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
        }`}
      >
        {place.imageUrl ? (
          <img
            src={place.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${colour}1a`, color: colour }}
          >
            <CategoryGlyph category={place.category} className="size-6" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {place.name}
            </p>
            {Number.isFinite(place.distanceM) ? (
              <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {formatDistance(place.distanceM, distanceUnit)}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" className="!px-1.5 !py-0">
              {place.categoryLabel ?? titleCase(place.category)}
            </Badge>
            {place.cuisine?.length ? (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {place.cuisine.slice(0, 2).map(titleCase).join(' · ')}
              </span>
            ) : null}
            {place.openingHours ? (
              <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                {place.openingHours}
              </span>
            ) : null}
          </div>

          {/* Only expand the description for the selected row: keeps the list scannable. */}
          {place.description ? (
            <p
              className={`mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400 ${
                selected ? '' : 'line-clamp-2'
              }`}
            >
              {place.description}
            </p>
          ) : null}

          {selected ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {place.website ? (
                <a
                  href={place.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  More info
                </a>
              ) : null}
              <a
                href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=17/${place.latitude}/${place.longitude}`}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                <MapPinIcon className="size-3.5" />
                Open in map
              </a>
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
}
