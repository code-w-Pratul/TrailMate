import { formatAgeSeconds } from '../../lib/format.js';
import { CheckIcon, InfoIcon, RefreshIcon, WarningIcon } from './Icons.jsx';

const TONES = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-200',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  danger: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
};

export function Badge({ children, tone = 'neutral', className = '', icon: Icon, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone] ?? TONES.neutral} ${className}`}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/**
 * Cache provenance badge.
 *
 * This is the visible payoff of the caching layer, and it is honest in three
 * distinct states rather than collapsing them:
 *
 *  - **degraded** — the upstream failed and we are showing the last good copy.
 *    The user is told, instead of quietly reading stale numbers as live.
 *  - **cached** — a fresh cache hit; instant, and no API credit spent.
 *  - **live** — fetched from the provider just now.
 *
 * It also names the provider that answered, which makes the fallback chain
 * observable from the UI.
 */
export function CacheBadge({ meta, className = '' }) {
  if (!meta) return null;

  if (meta.degraded) {
    return (
      <Badge
        tone="warning"
        icon={WarningIcon}
        className={className}
        title={
          meta.warning ??
          'The live source was unavailable, so the last successful response is shown.'
        }
      >
        Cached data · {formatAgeSeconds(meta.ageSeconds)}
      </Badge>
    );
  }

  if (meta.cached) {
    return (
      <Badge
        tone="neutral"
        icon={CheckIcon}
        className={className}
        title={`Served from cache${meta.provider ? ` (originally from ${meta.provider})` : ''} — no API credit used.`}
      >
        Cached · {formatAgeSeconds(meta.ageSeconds)}
      </Badge>
    );
  }

  return (
    <Badge
      tone="success"
      icon={RefreshIcon}
      className={className}
      title={meta.provider ? `Fetched live from ${meta.provider}` : 'Fetched live'}
    >
      Live
    </Badge>
  );
}

/** Small "where did this come from" label, used under cards. */
export function ProviderNote({ meta, prefix = 'Source' }) {
  if (!meta?.provider) return null;
  return (
    <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
      {prefix}: {meta.provider}
      {meta.providerFallback ? ' (fallback provider)' : ''}
    </p>
  );
}

/** Inline notice used for advisory copy inside a card. */
export function Notice({ children, tone = 'info', icon: Icon = InfoIcon }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200',
    warning:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
    danger:
      'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200',
  };
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-xs ${tones[tone] ?? tones.info}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default Badge;
