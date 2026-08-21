import SectionCard from '../ui/SectionCard.jsx';
import { SkeletonForecast } from '../ui/Skeleton.jsx';
import { Notice } from '../ui/Badge.jsx';
import { WeatherGlyph } from '../ui/Glyphs.jsx';
import { DropletIcon, SunIcon, ThermometerIcon, WindIcon } from '../ui/Icons.jsx';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import {
  formatDayMonth,
  formatPercent,
  formatPrecipitation,
  formatSpeed,
  formatTemp,
  formatWeekday,
} from '../../lib/format.js';

/**
 * Five-day forecast.
 *
 * The whole card is driven by TrailMate's own condition vocabulary, never a
 * provider's. `condition` is one of twelve known strings, so the icon lookup is
 * a plain map and switching weather providers changes nothing here.
 *
 * The day strip draws a temperature range bar scaled to the week's own min/max,
 * which makes "Thursday is the cold one" readable at a glance without a chart
 * library.
 */
export default function WeatherCard({ data, meta, loading, error, onRetry, tripDays }) {
  const { temperatureUnit, distanceUnit } = usePreferences();

  return (
    <SectionCard
      title="Weather"
      subtitle={data ? `${data.daily.length}-day forecast` : 'Forecast'}
      icon={ThermometerIcon}
      meta={meta}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={<SkeletonForecast />}
      footer={
        data ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Week range {formatTemp(data.summary.minC, temperatureUnit)} –{' '}
              {formatTemp(data.summary.maxC, temperatureUnit)}
            </span>
            <span>
              {data.summary.wetDays === 0
                ? 'No wet days forecast'
                : `${data.summary.wetDays} wet day${data.summary.wetDays === 1 ? '' : 's'}`}
            </span>
            {data.summary.totalPrecipitationMm > 0 ? (
              <span>
                {formatPrecipitation(data.summary.totalPrecipitationMm, distanceUnit)} total
              </span>
            ) : null}
          </div>
        ) : null
      }
    >
      {data ? <WeatherBody data={data} tripDays={tripDays} /> : null}
    </SectionCard>
  );
}

function WeatherBody({ data, tripDays }) {
  const { temperatureUnit, distanceUnit } = usePreferences();
  const { current, daily, summary, location } = data;

  /* Scale the range bars to the week, not to absolute zero. */
  const weekMin = Math.min(...daily.map((d) => d.minC).filter(Number.isFinite));
  const weekMax = Math.max(...daily.map((d) => d.maxC).filter(Number.isFinite));
  const span = Math.max(weekMax - weekMin, 1);

  const forecastShortfall = tripDays && tripDays > daily.length ? tripDays - daily.length : 0;

  return (
    <div className="space-y-5">
      {/* Now */}
      <div className="flex items-start gap-4">
        <WeatherGlyph
          condition={current.condition}
          className="size-14 shrink-0"
          label={current.conditionLabel}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {formatTemp(current.tempC, temperatureUnit)}
            </span>
            {Number.isFinite(current.feelsLikeC) &&
            Math.abs(current.feelsLikeC - current.tempC) >= 2 ? (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                feels {formatTemp(current.feelsLikeC, temperatureUnit)}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {current.description || current.conditionLabel}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
            {location.label ?? location.name}
          </p>
        </div>
      </div>

      {/* Right-now metrics */}
      <dl className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3 dark:border-slate-800">
        <Metric
          icon={DropletIcon}
          label="Humidity"
          value={current.humidity !== null ? `${current.humidity}%` : '—'}
        />
        <Metric icon={WindIcon} label="Wind" value={formatSpeed(current.windKph, distanceUnit)} />
        <Metric
          icon={SunIcon}
          label="UV index"
          value={Number.isFinite(current.uvIndex) ? String(current.uvIndex) : '—'}
        />
      </dl>

      {/* Day strip */}
      <ul className="space-y-1.5">
        {daily.map((day, index) => {
          const left = ((day.minC - weekMin) / span) * 100;
          const width = Math.max(((day.maxC - day.minC) / span) * 100, 4);

          return (
            <li
              key={day.date}
              className="grid grid-cols-[3.25rem_1.75rem_1fr_auto] items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <div className="text-xs">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  {index === 0 ? 'Today' : formatWeekday(day.date)}
                </p>
                <p className="text-slate-400 dark:text-slate-500">{formatDayMonth(day.date)}</p>
              </div>

              <WeatherGlyph
                condition={day.condition}
                className="size-5"
                label={day.conditionLabel}
              />

              <div className="min-w-0">
                <div
                  className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"
                  role="img"
                  aria-label={`${formatTemp(day.minC, temperatureUnit)} to ${formatTemp(day.maxC, temperatureUnit)}`}
                >
                  <div
                    className="absolute h-1.5 rounded-full bg-gradient-to-r from-sky-400 to-amber-400"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
                {day.precipitationChance >= 25 ? (
                  <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                    {formatPercent(day.precipitationChance)} rain
                    {day.precipitationMm > 0
                      ? ` · ${formatPrecipitation(day.precipitationMm, distanceUnit)}`
                      : ''}
                  </p>
                ) : null}
              </div>

              <p className="text-right text-xs tabular-nums">
                <span className="text-slate-400 dark:text-slate-500">
                  {formatTemp(day.minC, temperatureUnit, { withUnit: false })}
                </span>
                <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {formatTemp(day.maxC, temperatureUnit, { withUnit: false })}
                </span>
              </p>
            </li>
          );
        })}
      </ul>

      {forecastShortfall > 0 ? (
        <Notice>
          Forecasts only reach about a week ahead, so the last {forecastShortfall} day
          {forecastShortfall === 1 ? '' : 's'} of your trip are not covered yet. Use{' '}
          <strong>Best time to visit</strong> below for the seasonal picture.
        </Notice>
      ) : null}

      {summary.windKphMax >= 40 ? (
        <Notice tone="warning">
          Gusts up to {formatSpeed(summary.windKphMax, distanceUnit)} — exposed viewpoints will feel
          colder than the numbers suggest.
        </Notice>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="truncate text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </dt>
        <dd className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {value}
        </dd>
      </div>
    </div>
  );
}
