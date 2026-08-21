/**
 * Loading placeholders.
 *
 * Skeletons are shaped like the content they replace so the layout does not jump
 * when data lands. They are marked `aria-hidden` and paired with a visually
 * hidden "Loading…" message, because a screen reader should hear one clear
 * status rather than a dozen meaningless boxes.
 */

export function Skeleton({ className = '' }) {
  return <div className={`tm-skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="tm-skeleton h-3.5"
          style={{ width: index === lines - 1 ? '65%' : '100%' }}
        />
      ))}
    </div>
  );
}

/** Five stacked rows, matching the shape of the forecast strip. */
export function SkeletonForecast() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 pt-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="mx-auto h-3 w-8" />
            <Skeleton className="mx-auto size-8 rounded-full" />
            <Skeleton className="mx-auto h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="size-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonStat({ count = 3 }) {
  return (
    <div className="grid grid-cols-3 gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Screen-reader-only status text. */
export function LoadingAnnouncement({ label = 'Loading' }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

export default Skeleton;
