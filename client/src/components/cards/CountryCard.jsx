import SectionCard from '../ui/SectionCard.jsx';
import { SkeletonStat, SkeletonText } from '../ui/Skeleton.jsx';
import { Notice } from '../ui/Badge.jsx';
import { GlobeIcon } from '../ui/Icons.jsx';
import { formatCompact, formatLocalTime, timezoneOffsetLabel } from '../../lib/format.js';

/**
 * Country facts.
 *
 * The timezone shown is the *city's* IANA zone from the geocoder, not a
 * country-level guess — which matters for anywhere that spans several zones.
 * Local time is computed in the browser via `Intl`, so it stays correct across
 * DST without the server having to model it.
 */
export default function CountryCard({ data, meta, loading, error, onRetry, timezone }) {
  const localTime = formatLocalTime(timezone);
  const offset = timezoneOffsetLabel(timezone);

  return (
    <SectionCard
      title="Local knowledge"
      subtitle={data ? (data.officialName ?? data.name) : 'Country information'}
      icon={GlobeIcon}
      meta={meta}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={
        <div className="space-y-4">
          <SkeletonStat count={3} />
          <SkeletonText lines={2} />
        </div>
      }
    >
      {data ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {data.flag?.svg ? (
              <img
                src={data.flag.svg}
                alt={data.flag.alt ?? `Flag of ${data.name}`}
                loading="lazy"
                className="h-8 w-12 rounded border border-slate-200 object-cover dark:border-slate-700"
              />
            ) : (
              <span className="text-3xl" role="img" aria-label={`Flag of ${data.name}`}>
                {data.flag?.emoji}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {data.name}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {[data.subregion, data.capital && `capital ${data.capital}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Fact
              label="Language"
              value={
                data.languages
                  ?.map((l) => l.name)
                  .slice(0, 2)
                  .join(', ') || '—'
              }
              hint={data.languages?.length > 2 ? `+${data.languages.length - 2} more` : null}
            />
            <Fact
              label="Currency"
              value={
                data.primaryCurrency
                  ? `${data.primaryCurrency.code}${data.primaryCurrency.symbol ? ` (${data.primaryCurrency.symbol})` : ''}`
                  : '—'
              }
              hint={data.primaryCurrency?.name}
            />
            <Fact
              label="Local time"
              value={localTime ?? '—'}
              hint={offset ? (offset === 'same as you' ? offset : `${offset} vs you`) : timezone}
            />
            <Fact label="Dial code" value={data.callingCode ?? '—'} />
            <Fact label="Drives on" value={data.drivingSide ? `the ${data.drivingSide}` : '—'} />
            <Fact
              label="Population"
              value={data.population ? formatCompact(data.population) : '—'}
              hint={data.areaKm2 ? `${formatCompact(data.areaKm2)} km²` : null}
            />
          </dl>

          {data.drivingSide === 'left' ? (
            <Notice tone="warning">
              Traffic drives on the left — look right first when crossing.
            </Notice>
          ) : null}

          <div className="flex flex-wrap gap-3 text-xs">
            {data.maps?.googleMaps ? (
              <a
                href={data.maps.googleMaps}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                Open in Google Maps
              </a>
            ) : null}
            {data.maps?.openStreetMaps ? (
              <a
                href={data.maps.openStreetMaps}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                Open in OpenStreetMap
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function Fact({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="truncate font-medium text-slate-800 dark:text-slate-100" title={value}>
        {value}
      </dd>
      {hint ? (
        <p className="truncate text-[11px] text-slate-400 dark:text-slate-500" title={hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
