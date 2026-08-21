import { useId } from 'react';

/**
 * Hand-rolled SVG sparkline.
 *
 * Deliberately not Chart.js. A single-series line needs about thirty lines of
 * path maths, and doing it in SVG means it inherits `currentColor`, themes
 * automatically, scales without a canvas resize observer, adds nothing to the
 * bundle, and stays fully accessible via a text alternative. Charting libraries
 * earn their weight at axis labels and interaction — neither of which a
 * sparkline has.
 *
 * @param {{ points: number[], labels?: string[], ariaLabel: string, height?: number }} props
 */
export default function Sparkline({ points = [], labels = [], ariaLabel, height = 44 }) {
  const gradientId = useId();

  if (points.length < 2) return null;

  const width = 100; // viewBox units; the SVG scales to its container
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  // 2 units of vertical padding so the stroke is never clipped at the extremes.
  const toX = (index) => (index / (points.length - 1)) * width;
  const toY = (value) => 2 + (1 - (value - min) / span) * (height - 4);

  const line = points.map((value, index) => `${toX(index)},${toY(value)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  const first = points[0];
  const last = points[points.length - 1];
  const rising = last >= first;
  const stroke = rising ? 'text-emerald-500' : 'text-rose-500';

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={`h-11 w-full ${stroke}`}
        role="img"
        aria-label={`${ariaLabel}. From ${first} to ${last}.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={toX(points.length - 1)} cy={toY(last)} r="2" fill="currentColor" />
      </svg>

      {labels.length >= 2 ? (
        <figcaption className="mt-1 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
