import { useQuery } from '@tanstack/react-query';
import SectionCard from '../ui/SectionCard.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { ChartIcon } from '../ui/Icons.jsx';
import * as api from '../../api/endpoints.js';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import { formatPrecipitation, formatTemp } from '../../lib/format.js';

/**
 * "Best time to visit".
 *
 * Loaded on its own rather than as part of the plan payload: it reaches years
 * back through the historical archive, so it is slower and much less likely to be
 * needed on every dashboard view. Lazy-loading it keeps the main page fast.
 *
 * The chart is hand-drawn SVG for the same reasons as the sparkline — twelve bars
 * and a line do not justify a charting dependency, and this way it themes and
 * scales for free.
 */
export default function ClimateCard({ city, enabled = true }) {
  const { temperatureUnit, distanceUnit } = usePreferences();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: api.keys.climate(city, 3),
    queryFn: () => api.getClimate(city, 3),
    enabled: enabled && Boolean(city),
    staleTime: 24 * 60 * 60 * 1000, // climate normals barely move
  });

  const climate = data?.data;
  const months = climate?.months ?? [];

  const maxPrecip = Math.max(1, ...months.map((m) => m.precipitationMm ?? 0));
  const temps = months.flatMap((m) => [m.avgMinC, m.avgMaxC]).filter(Number.isFinite);
  const tempMin = temps.length ? Math.min(...temps) : 0;
  const tempMax = temps.length ? Math.max(...temps) : 30;
  const tempSpan = Math.max(tempMax - tempMin, 1);

  const currentMonth = new Date().getUTCMonth() + 1;

  return (
    <SectionCard
      title="Best time to visit"
      subtitle={
        climate
          ? `Monthly normals from ${climate.period.years} years of observations`
          : 'Seasonal averages'
      }
      icon={ChartIcon}
      meta={data?.meta}
      loading={isLoading}
      error={error}
      onRetry={refetch}
      skeleton={<Skeleton className="h-44 w-full" />}
      footer={
        climate ? (
          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            Comfort score peaks at a 21 °C monthly mean and is reduced by rainy days — a simple,
            documented heuristic rather than a black box. Based on {climate.period.startDate} to{' '}
            {climate.period.endDate}.
          </p>
        ) : null
      }
    >
      {climate ? (
        <div className="space-y-4">
          {/* Best months */}
          {climate.bestMonths?.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="tm-label">Sweet spot</span>
              {climate.bestMonths.map((month) => (
                <Badge
                  key={month.month}
                  tone="success"
                  title={`Comfort score ${month.comfortScore}/100`}
                >
                  {month.name} · {formatTemp(month.avgMaxC, temperatureUnit)}
                </Badge>
              ))}
            </div>
          ) : null}

          {/* Twelve-month chart */}
          <div>
            <ul className="flex items-end gap-1" role="list">
              {months.map((month) => {
                const rainHeight = ((month.precipitationMm ?? 0) / maxPrecip) * 100;
                const barTop = ((tempMax - (month.avgMaxC ?? tempMin)) / tempSpan) * 100;
                const barBottom = ((tempMax - (month.avgMinC ?? tempMin)) / tempSpan) * 100;
                const isNow = month.month === currentMonth;
                const isBest = climate.bestMonths?.some((b) => b.month === month.month);

                return (
                  <li
                    key={month.month}
                    className="group relative flex-1"
                    title={`${month.name}: ${formatTemp(month.avgMinC, temperatureUnit)}–${formatTemp(month.avgMaxC, temperatureUnit)}, ${formatPrecipitation(month.precipitationMm, distanceUnit)} rain, comfort ${month.comfortScore}/100`}
                  >
                    {/* Rain column, drawn behind the temperature band */}
                    <div className="relative h-28 w-full rounded-sm bg-slate-100 dark:bg-slate-800">
                      <div
                        className="absolute bottom-0 w-full rounded-sm bg-sky-200/70 dark:bg-sky-900/60"
                        style={{ height: `${rainHeight}%` }}
                        aria-hidden="true"
                      />
                      <div
                        className={`absolute w-full rounded-full ${
                          isBest ? 'bg-emerald-500' : 'bg-amber-400 dark:bg-amber-500'
                        }`}
                        style={{
                          top: `${barTop}%`,
                          bottom: `${100 - barBottom}%`,
                          minHeight: '3px',
                        }}
                        aria-hidden="true"
                      />
                    </div>

                    <p
                      className={`mt-1 text-center text-[10px] ${
                        isNow
                          ? 'font-bold text-brand-700 dark:text-brand-300'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {month.name.slice(0, 1)}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-4 rounded-full bg-amber-400" aria-hidden="true" />
                temperature range
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-3 w-3 rounded-sm bg-sky-200 dark:bg-sky-900"
                  aria-hidden="true"
                />
                monthly rainfall
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-4 rounded-full bg-emerald-500" aria-hidden="true" />
                best months
              </span>
            </div>
          </div>

          {/* Accessible table alternative to the chart */}
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-brand-700 dark:text-brand-300">
              View as a table
            </summary>
            <table className="mt-2 w-full text-left tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th scope="col" className="py-1">
                    Month
                  </th>
                  <th scope="col" className="py-1">
                    Low
                  </th>
                  <th scope="col" className="py-1">
                    High
                  </th>
                  <th scope="col" className="py-1">
                    Rain
                  </th>
                  <th scope="col" className="py-1">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month} className="border-t border-slate-100 dark:border-slate-800">
                    <th scope="row" className="py-1 font-normal text-slate-600 dark:text-slate-400">
                      {month.name}
                    </th>
                    <td className="py-1 text-slate-500">
                      {formatTemp(month.avgMinC, temperatureUnit)}
                    </td>
                    <td className="py-1 text-slate-700 dark:text-slate-300">
                      {formatTemp(month.avgMaxC, temperatureUnit)}
                    </td>
                    <td className="py-1 text-slate-500">
                      {formatPrecipitation(month.precipitationMm, distanceUnit)}
                    </td>
                    <td className="py-1 text-slate-500">{month.comfortScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ) : null}
    </SectionCard>
  );
}
