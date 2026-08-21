import { useState } from 'react';
import { Skeleton } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { CalendarIcon, MapPinIcon, UserIcon } from '../ui/Icons.jsx';
import { formatDateRange, formatLocalTime, pluralise } from '../../lib/format.js';

/** Photographic destination masthead shared by live, saved, and public trips. */
export default function TripHero({
  location,
  photo,
  photoLoading,
  startDate,
  endDate,
  days,
  travellers,
  actions,
  badges,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = photo?.url && !imageFailed;
  const localTime = formatLocalTime(location?.timezone);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-brand-950 shadow-2xl shadow-stone-900/10 dark:border-stone-800">
      <div className="relative h-80 w-full sm:h-[27rem]">
        {photoLoading ? <Skeleton className="absolute inset-0 rounded-none" /> : null}

        {showImage ? (
          <img
            src={photo.url}
            alt=""
            aria-hidden="true"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 size-full object-cover motion-safe:animate-drift"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(154,180,140,0.55),transparent_30%),linear-gradient(135deg,#42684d_0%,#203b2a_45%,#111c17_100%)]" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/45 to-stone-950/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/40 via-transparent to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div className="min-w-0 max-w-3xl">
              {badges ? <div className="mb-3 flex flex-wrap gap-2">{badges}</div> : null}

              <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/65">
                Your destination guide
              </p>
              <h1 className="tm-display text-4xl leading-none text-white drop-shadow sm:text-5xl lg:text-6xl">
                {location?.name ?? 'Your trip'}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/82">
                {location?.label && location.label !== location.name ? (
                  <span className="flex items-center gap-1.5">
                    <MapPinIcon className="size-4" />
                    {location.label}
                  </span>
                ) : null}
                {startDate && endDate ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon className="size-4" />
                    {formatDateRange(startDate, endDate)}
                  </span>
                ) : days ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon className="size-4" />
                    Next {pluralise(days, 'day')}
                  </span>
                ) : null}
                {travellers > 1 ? (
                  <span className="flex items-center gap-1.5">
                    <UserIcon className="size-4" />
                    {pluralise(travellers, 'traveller')}
                  </span>
                ) : null}
                {localTime ? <span className="text-white/60">Local time {localTime}</span> : null}
              </div>
            </div>

            {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
          </div>
        </div>
      </div>

      {photo?.credit?.name &&
      (photo.attributionRequired || photo.provider?.toLowerCase() === 'unsplash') ? (
        <p className="border-t border-white/10 bg-stone-950 px-6 py-2 text-[10px] text-white/50">
          Photo by{' '}
          <a
            href={photo.credit.profileUrl ?? '#'}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-white"
          >
            {photo.credit.name}
          </a>{' '}
          on{' '}
          <a
            href={photo.credit.sourceUrl ?? '#'}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-white"
          >
            {photo.credit.sourceName}
          </a>
        </p>
      ) : photo?.isPlaceholder ? (
        <p className="border-t border-white/10 bg-stone-950 px-6 py-2 text-[10px] text-white/45">
          Placeholder image — add an <code className="font-mono">UNSPLASH_ACCESS_KEY</code> for real
          destination photography.
        </p>
      ) : null}
    </section>
  );
}

export function HeroBadge({ children, tone = 'brand' }) {
  return (
    <Badge
      tone={tone}
      className="!border !border-white/20 !bg-white/12 !px-3 !py-1 !text-white backdrop-blur-md"
    >
      {children}
    </Badge>
  );
}
