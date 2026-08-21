import { useMemo, useState } from 'react';
import SectionCard, { EmptyState } from '../ui/SectionCard.jsx';
import { SkeletonList } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { BackpackIcon, CheckIcon, InfoIcon } from '../ui/Icons.jsx';

/**
 * Packing list.
 *
 * Every item carries the rule that produced it, exposed as a tooltip and — for
 * the item the user taps — as visible text. That turns the list from an opaque
 * suggestion into something checkable: "why an umbrella?" has an answer.
 *
 * Tick state is local until a trip is saved, at which point it is persisted with
 * the trip and preserved across snapshot refreshes.
 */
export default function PackingCard({ data, loading, error, onRetry, checked, onToggle, meta }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);

  const isChecked = (item) => Boolean(checked?.[item.item.toLowerCase()]);

  const packedCount = useMemo(
    () => (data?.items ?? []).filter(isChecked).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, checked]
  );

  const total = data?.items?.length ?? 0;
  const progress = total ? Math.round((packedCount / total) * 100) : 0;

  /* Essentials first by default: a long list is intimidating and the tail is
     mostly nice-to-haves. */
  const categories = useMemo(() => {
    if (!data?.categories) return [];
    if (showAll) return data.categories;
    return data.categories
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.essential || isChecked(item)),
      }))
      .filter((group) => group.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showAll, checked]);

  return (
    <SectionCard
      title="Packing list"
      subtitle={data ? `${total} items derived from the forecast` : 'Generated from the weather'}
      icon={BackpackIcon}
      meta={meta}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={<SkeletonList rows={5} />}
      actions={
        data ? (
          <Badge tone={progress === 100 ? 'success' : 'neutral'}>
            {packedCount}/{total}
          </Badge>
        ) : null
      }
      footer={
        data ? (
          <div className="space-y-2">
            {data.note ? (
              <p className="flex gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                {data.note}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              {showAll
                ? 'Show essentials only'
                : `Show all ${total} items (${total - data.totals.essentials} more)`}
            </button>
          </div>
        ) : null
      }
      bodyClassName="max-h-[28rem] overflow-y-auto"
    >
      {data ? (
        total ? (
          <div className="space-y-4">
            {/* Progress */}
            <div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Packing progress"
              >
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {categories.map((group) => (
              <section key={group.name}>
                <h3 className="tm-label mb-1.5">{group.label}</h3>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const key = item.item.toLowerCase();
                    const done = isChecked(item);
                    const expanded = expandedItem === key;

                    return (
                      <li key={key}>
                        <div className="flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          <button
                            type="button"
                            onClick={() => onToggle?.(key)}
                            role="checkbox"
                            aria-checked={done}
                            aria-label={item.item}
                            className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                              done
                                ? 'border-brand-600 bg-brand-600 text-white'
                                : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                            }`}
                          >
                            {done ? <CheckIcon className="size-3" /> : null}
                          </button>

                          <button
                            type="button"
                            onClick={() => setExpandedItem(expanded ? null : key)}
                            className="min-w-0 flex-1 text-left"
                            title={item.reason}
                            aria-expanded={expanded}
                          >
                            <span
                              className={`text-sm ${
                                done
                                  ? 'text-slate-400 line-through dark:text-slate-600'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {item.item}
                              {item.quantity ? (
                                <span className="ml-1.5 text-xs tabular-nums text-slate-400">
                                  ×{item.quantity}
                                </span>
                              ) : null}
                            </span>
                            {item.essential ? (
                              <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                key
                              </span>
                            ) : null}

                            {expanded && item.reason ? (
                              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                {item.reason}
                              </p>
                            ) : null}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BackpackIcon}
            title="Nothing to suggest yet"
            description="The packing list is built from the forecast, which is not available for this destination."
          />
        )
      ) : null}
    </SectionCard>
  );
}
