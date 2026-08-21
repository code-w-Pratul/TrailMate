import { CacheBadge } from './Badge.jsx';
import { LoadingAnnouncement } from './Skeleton.jsx';
import { RefreshIcon, WarningIcon } from './Icons.jsx';

/** A resilient editorial shell for each independently resolved dashboard section. */
export default function SectionCard({
  title,
  subtitle,
  icon: Icon,
  meta,
  loading = false,
  error = null,
  skeleton = null,
  onRetry,
  actions,
  footer,
  children,
  className = '',
  bodyClassName = '',
}) {
  return (
    <section
      className={`tm-card flex flex-col overflow-hidden ${className}`}
      aria-busy={loading || undefined}
      aria-labelledby={title ? `card-${slug(title)}` : undefined}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200/75 px-5 py-5 sm:px-6 dark:border-stone-800">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-900">
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2
              id={title ? `card-${slug(title)}` : undefined}
              className="tm-display truncate text-xl leading-tight text-stone-950 dark:text-white"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 truncate text-xs leading-5 text-stone-500 dark:text-stone-400">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {!loading && !error ? <CacheBadge meta={meta} /> : null}
        </div>
      </header>

      <div className={`flex-1 px-5 py-5 sm:px-6 ${bodyClassName}`}>
        {loading ? (
          <>
            <LoadingAnnouncement label={`Loading ${title ?? 'section'}`} />
            {skeleton}
          </>
        ) : error ? (
          <SectionError error={error} onRetry={onRetry} title={title} />
        ) : (
          children
        )}
      </div>

      {footer && !loading && !error ? (
        <footer className="border-t border-stone-200/75 px-5 py-3.5 sm:px-6 dark:border-stone-800">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export function SectionError({ error, onRetry, title }) {
  const message = error?.message ?? `${title ?? 'This section'} could not be loaded right now.`;
  const canRetry = Boolean(onRetry) && (error?.retryable ?? true);

  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-2">
      <div className="flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <WarningIcon className="size-4.5" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm leading-6 text-stone-700 dark:text-stone-300">{message}</p>
          {Array.isArray(error?.details) && error.details.length ? (
            <ul className="list-inside list-disc text-xs text-stone-500 dark:text-stone-400">
              {error.details.slice(0, 3).map((detail, index) => (
                <li key={index}>
                  {typeof detail === 'string' ? detail : `${detail.field}: ${detail.message}`}
                </li>
              ))}
            </ul>
          ) : null}
          {error?.requestId ? (
            <p className="font-mono text-[11px] text-stone-400 dark:text-stone-500">
              ref {String(error.requestId).slice(0, 8)}
            </p>
          ) : null}
        </div>
      </div>

      {canRetry ? (
        <button type="button" onClick={onRetry} className="tm-btn-secondary text-xs">
          <RefreshIcon className="size-4" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      {Icon ? (
        <span className="grid size-14 place-items-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500">
          <Icon className="size-6" />
        </span>
      ) : null}
      <div>
        <p className="tm-display text-xl text-stone-800 dark:text-stone-200">{title}</p>
        {description ? (
          <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-stone-500 dark:text-stone-400">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
