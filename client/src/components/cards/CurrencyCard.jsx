import { useMemo, useState } from 'react';
import SectionCard from '../ui/SectionCard.jsx';
import { SkeletonStat } from '../ui/Skeleton.jsx';
import { Badge, Notice } from '../ui/Badge.jsx';
import { WalletIcon } from '../ui/Icons.jsx';
import Sparkline from '../ui/Sparkline.jsx';
import { formatMoney, formatNumber } from '../../lib/format.js';

/**
 * Currency converter.
 *
 * The rate arrives with the dashboard; the arithmetic is local. Typing a new
 * amount therefore costs nothing — no request, no debounce, no spinner — which is
 * the right trade for a value the user will fiddle with. A refetch only happens
 * if they change the pair.
 *
 * Quick-amount chips exist because "what is 50 of these worth" is the actual
 * question people have while standing in a shop.
 */
const QUICK_AMOUNTS = [10, 50, 100, 500];

export default function CurrencyCard({ data, meta, loading, error, onRetry, homeCurrency }) {
  /* Seeded to the same amount the API is asked for, so no effect is needed to
     sync it once data arrives — syncing state from props in an effect causes a
     cascading second render for no benefit. */
  const [amount, setAmount] = useState(100);
  const [inverted, setInverted] = useState(false);

  const from = inverted ? data?.to : data?.from;
  const to = inverted ? data?.from : data?.to;
  const rate = inverted ? data?.inverseRate : data?.rate;

  const converted = useMemo(() => {
    const value = Number(amount);
    if (!Number.isFinite(value) || !Number.isFinite(rate)) return null;
    return value * rate;
  }, [amount, rate]);

  return (
    <SectionCard
      title="Currency"
      subtitle={data ? `${data.from} → ${data.to}` : 'Exchange rate'}
      icon={WalletIcon}
      meta={meta}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={<SkeletonStat count={2} />}
      footer={
        data ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ECB reference rate{data.date ? ` for ${data.date}` : ''}. Card issuers and bureaux add a
            margin, so treat this as the baseline.
          </p>
        ) : null
      }
    >
      {data ? (
        <div className="space-y-4">
          {/* Rate headline */}
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                1 {from} = {formatNumber(rate, rate < 10 ? 4 : 2)} {to}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {homeCurrency === data.from ? 'Your home currency' : 'Destination currency'} first
              </p>
            </div>
            {data.trend ? <TrendBadge trend={data.trend} /> : null}
          </div>

          {/* Converter */}
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="currency-amount" className="tm-label mb-1 block">
                  Amount in {from}
                </label>
                <input
                  id="currency-amount"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="tm-input tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={() => setInverted((value) => !value)}
                className="tm-btn-secondary mb-0.5 px-3 py-2"
                aria-label={`Swap direction: show ${to} to ${from}`}
                title="Swap direction"
              >
                ⇄
              </button>
            </div>

            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="text-xl font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                {converted === null ? '—' : formatMoney(converted, to)}
              </span>
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    Number(amount) === value
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
                  }`}
                >
                  {formatNumber(value)}
                </button>
              ))}
            </div>
          </div>

          {/* 30-day history */}
          {data.series?.length > 1 ? (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="tm-label">Last 30 days</p>
                <p className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                  {formatNumber(data.trend?.low, 4)} – {formatNumber(data.trend?.high, 4)}
                </p>
              </div>
              <Sparkline
                points={data.series.map((point) => point.rate)}
                labels={data.series.map((point) => point.date)}
                ariaLabel={`${data.from} to ${data.to} rate over the last ${data.series.length} days`}
              />
            </div>
          ) : null}

          {data.identity ? (
            <Notice>Your home currency matches the destination — no conversion needed.</Notice>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

/**
 * 30-day trend.
 *
 * The rate is quoted as "destination units per 1 home unit", so a *rising* rate
 * means the traveller's money now buys more — the trip has effectively got
 * cheaper. Hence up is the favourable direction here, which is the opposite of
 * the instinct people bring from stock charts. The tooltip says so explicitly
 * rather than leaving the colour to be misread.
 */
function TrendBadge({ trend }) {
  const copy = {
    up: {
      tone: 'success',
      arrow: '▲',
      title: `Your currency has strengthened about ${Math.abs(trend.changePercent)}% over ${trend.periodDays} days — the same budget now goes further.`,
    },
    down: {
      tone: 'warning',
      arrow: '▼',
      title: `Your currency has weakened about ${Math.abs(trend.changePercent)}% over ${trend.periodDays} days — the trip is slightly pricier than a month ago.`,
    },
    flat: {
      tone: 'neutral',
      arrow: '▬',
      title: `Broadly flat over the last ${trend.periodDays} days.`,
    },
  }[trend.direction] ?? { tone: 'neutral', arrow: '▬', title: 'No trend available.' };

  return (
    <Badge tone={copy.tone} title={copy.title}>
      {copy.arrow} {Math.abs(trend.changePercent)}% / 30d
    </Badge>
  );
}
