import { useState } from 'react';
import SectionCard from '../ui/SectionCard.jsx';
import { SkeletonStat, SkeletonText } from '../ui/Skeleton.jsx';
import { Badge, Notice } from '../ui/Badge.jsx';
import { ChevronDownIcon, WalletIcon } from '../ui/Icons.jsx';
import { formatMoney, formatNumber, pluralise, titleCase } from '../../lib/format.js';

const STYLES = [
  { key: 'backpacker', label: 'Backpacker' },
  { key: 'budget', label: 'Budget' },
  { key: 'midrange', label: 'Mid-range' },
  { key: 'comfort', label: 'Comfort' },
  { key: 'luxury', label: 'Luxury' },
];

const CATEGORY_LABELS = {
  accommodation: 'Stay',
  food: 'Food',
  activities: 'Activities',
  localTransport: 'Transport',
  misc: 'Other',
};

const CATEGORY_COLORS = {
  accommodation: 'bg-brand-500',
  food: 'bg-amber-500',
  activities: 'bg-violet-500',
  localTransport: 'bg-sky-500',
  misc: 'bg-slate-400',
};

/**
 * Budget estimator.
 *
 * The card leads with a number, then makes the number auditable: a "how this is
 * calculated" panel shows the actual formula, the country index that was used and
 * where that index came from. An estimate you cannot inspect is just a guess with
 * better typography.
 */
export default function BudgetCard({ data, meta, loading, error, onRetry, style, onStyleChange }) {
  const [showModel, setShowModel] = useState(false);

  const perDay = data?.perPersonPerDay;
  const display = perDay?.home?.supported ? perDay.home : null;
  const currency = display?.currency ?? 'USD';
  const dailyAmount = display?.amount ?? perDay?.usd;
  const breakdown = display?.breakdown ?? perDay?.breakdownUsd;

  const totalAmount = data?.total?.home?.amount ?? data?.total?.usd;
  const totalCurrency = data?.total?.home?.currency ?? 'USD';

  return (
    <SectionCard
      title="Budget estimate"
      subtitle={data ? `${titleCase(data.style.key)} pace, per person per day` : 'Daily spend'}
      icon={WalletIcon}
      meta={meta}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={
        <div className="space-y-4">
          <SkeletonStat count={2} />
          <SkeletonText lines={2} />
        </div>
      }
      actions={data ? <Badge tone="neutral">estimate</Badge> : null}
    >
      {data ? (
        <div className="space-y-4">
          {/* Style selector */}
          <div>
            <p className="tm-label mb-1.5">Travel style</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onStyleChange?.(option.key)}
                  aria-pressed={style === option.key}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    style === option.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Headline */}
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {formatMoney(dailyAmount, currency)}
              <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                / person / day
              </span>
            </p>

            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              About{' '}
              <strong className="tabular-nums">{formatMoney(totalAmount, totalCurrency)}</strong>{' '}
              for {pluralise(data.trip.days, 'day')}
              {data.trip.travellers > 1 ? `, ${pluralise(data.trip.travellers, 'traveller')}` : ''}
            </p>

            {perDay?.destination?.supported && perDay.destination.currency !== currency ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                ≈ {formatMoney(perDay.destination.amount, perDay.destination.currency)} locally
              </p>
            ) : null}
          </div>

          {/* Breakdown */}
          {breakdown ? (
            <div>
              <p className="tm-label mb-2">Where it goes</p>
              <div
                className="mb-2 flex h-2 overflow-hidden rounded-full"
                role="img"
                aria-label="Budget split by category"
              >
                {Object.entries(data.model.shares).map(([key, share]) => (
                  <span
                    key={key}
                    className={CATEGORY_COLORS[key] ?? 'bg-slate-400'}
                    style={{ width: `${share * 100}%` }}
                    title={`${CATEGORY_LABELS[key] ?? key}: ${Math.round(share * 100)}%`}
                  />
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                {Object.entries(breakdown).map(([key, amount]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${CATEGORY_COLORS[key] ?? 'bg-slate-400'}`}
                      aria-hidden="true"
                    />
                    <dt className="text-xs text-slate-500 dark:text-slate-400">
                      {CATEGORY_LABELS[key] ?? titleCase(key)}
                    </dt>
                    <dd className="ml-auto font-medium tabular-nums text-slate-800 dark:text-slate-200">
                      {formatMoney(amount, currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {data.total?.groupSavingUsd ? (
            <Notice>
              {data.total.groupSavingNote} That saves roughly{' '}
              {formatMoney(data.total.groupSavingUsd, 'USD')} across the trip.
            </Notice>
          ) : null}

          {/* Auditable model */}
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowModel((value) => !value)}
              aria-expanded={showModel}
              className="flex w-full items-center justify-between text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              How this is calculated
              <ChevronDownIcon
                className={`size-4 transition-transform ${showModel ? 'rotate-180' : ''}`}
              />
            </button>

            {showModel ? (
              <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {data.model.formula}
                </p>
                <dl className="space-y-1">
                  <Row
                    label="Base (global average day)"
                    value={formatMoney(data.model.baseDailyUsd, 'USD')}
                  />
                  <Row
                    label="Country index"
                    value={`×${formatNumber(data.model.countryIndex, 2)}`}
                    hint={data.model.countryIndexBasis}
                  />
                  <Row
                    label="City premium"
                    value={`×${formatNumber(data.model.cityPremium, 3)}`}
                    hint={data.model.cityPremiumReasons?.join(', ')}
                  />
                  <Row
                    label="Style multiplier"
                    value={`×${formatNumber(data.model.styleMultiplier, 2)}`}
                  />
                  <Row
                    label="Effective index"
                    value={`×${formatNumber(data.model.effectiveIndex, 3)}`}
                    strong
                  />
                </dl>
                <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                  {data.disclaimer}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function Row({ label, value, hint, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-slate-500 dark:text-slate-400 ${strong ? 'font-semibold' : ''}`}>
        {label}
        {hint ? <span className="ml-1 text-[10px] opacity-70">({hint})</span> : null}
      </dt>
      <dd
        className={`shrink-0 tabular-nums ${strong ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}
      >
        {value}
      </dd>
    </div>
  );
}
