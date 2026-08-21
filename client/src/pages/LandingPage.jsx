import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DestinationSearch from '../components/search/DestinationSearch.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { isoDateIn, daysBetween } from '../lib/format.js';
import {
  ArrowRightIcon,
  BackpackIcon,
  CalendarIcon,
  ChartIcon,
  GlobeIcon,
  MapPinIcon,
  RouteIcon,
  SparklesIcon,
  UserIcon,
  WalletIcon,
} from '../components/ui/Icons.jsx';

const POPULAR = [
  {
    city: 'Kyoto',
    blurb: 'Temples, gardens and quiet lanes',
    region: 'Japan',
    image:
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1100&q=82',
  },
  {
    city: 'Lisbon',
    blurb: 'Tiled streets and Atlantic light',
    region: 'Portugal',
    image:
      'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1100&q=82',
  },
  {
    city: 'Reykjavik',
    blurb: 'Wild coasts beneath open skies',
    region: 'Iceland',
    image:
      'https://images.unsplash.com/photo-1504829857797-ddff29c27927?auto=format&fit=crop&w=1100&q=82',
  },
  {
    city: 'Mexico City',
    blurb: 'Food, design and living history',
    region: 'Mexico',
    image:
      'https://images.unsplash.com/photo-1518659526054-190340b32735?auto=format&fit=crop&w=1100&q=82',
  },
  {
    city: 'Cape Town',
    blurb: 'Mountains meeting two oceans',
    region: 'South Africa',
    image:
      'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=1100&q=82',
  },
  {
    city: 'Istanbul',
    blurb: 'Markets, minarets and the Bosphorus',
    region: 'Türkiye',
    image:
      'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1100&q=82',
  },
];

const FEATURES = [
  {
    icon: CalendarIcon,
    title: 'Weather with a point of view',
    body: 'A clear five-day forecast, normalised across providers and translated into decisions you can use.',
  },
  {
    icon: MapPinIcon,
    title: 'Places worth your time',
    body: 'Notable sights and local food spots, paired with useful context, photography and a navigable map.',
  },
  {
    icon: WalletIcon,
    title: 'Money made legible',
    body: 'Reference exchange rates and a transparent daily budget expressed in the currency you know best.',
  },
  {
    icon: SparklesIcon,
    title: 'Grounded travel intelligence',
    body: 'A concise briefing built only from verified data on your dashboard, with a reliable rules-based fallback.',
  },
  {
    icon: BackpackIcon,
    title: 'A packing list with reasons',
    body: 'Every recommendation explains why it made the list, from forecasted rain to local conditions.',
  },
  {
    icon: ChartIcon,
    title: 'Seasonal perspective',
    body: 'Climate normals reveal how your travel window compares and when the destination tends to feel its best.',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Name the place',
    body: 'Choose any city, set your dates and tell us who is travelling. No dates yet? Start with a five-day view.',
  },
  {
    step: '02',
    title: 'We connect the signals',
    body: 'TrailMate gathers independent weather, place, country and currency data in parallel, then normalises it.',
  },
  {
    step: '03',
    title: 'Shape the journey',
    body: 'Explore one coherent dashboard, adjust the plan, save a snapshot or continue into a multi-city route.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { homeCurrency } = usePreferences();

  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travellers, setTravellers] = useState(1);

  const nights = startDate && endDate ? daysBetween(startDate, endDate) : null;
  const datesInvalid = Boolean(startDate && endDate && endDate < startDate);

  const submit = (event) => {
    event?.preventDefault();
    const destination = city.trim();
    if (!destination || datesInvalid) return;

    const params = new URLSearchParams({ city: destination, homeCurrency });
    if (startDate && endDate && !datesInvalid) {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    } else {
      params.set('days', '5');
    }
    if (travellers > 1) params.set('travellers', String(travellers));

    navigate(`/plan?${params.toString()}`);
  };

  return (
    <div className="overflow-hidden">
      <section className="relative border-b border-stone-200/80 bg-[#f2efe6] dark:border-stone-800 dark:bg-stone-950">
        <div
          className="pointer-events-none absolute -left-24 top-20 size-80 rounded-full border border-brand-800/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-8 top-36 size-52 rounded-full border border-brand-800/10"
          aria-hidden="true"
        />

        <div className="tm-shell relative pb-14 pt-10 sm:pb-20 sm:pt-16 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div className="relative z-10 animate-rise">
              <p className="tm-eyebrow">
                <GlobeIcon className="size-3.5" />
                The whole trip, thoughtfully connected
              </p>
              <h1 className="tm-display mt-6 max-w-3xl text-5xl leading-[0.94] text-stone-950 sm:text-6xl lg:text-[5.25rem] dark:text-white">
                Go further with fewer unknowns.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-stone-600 sm:text-lg dark:text-stone-300">
                TrailMate turns scattered travel research into one calm, useful view — from
                tomorrow’s weather to the places, costs and context that shape a memorable stay.
              </p>

              <div className="mt-9 flex flex-wrap gap-x-8 gap-y-4 border-t border-stone-300/80 pt-6 dark:border-stone-700">
                <Stat value="6" label="connected data sources" />
                <Stat value="1" label="coherent trip dashboard" />
                <Stat value="0" label="provider keys in-browser" />
              </div>
            </div>

            <figure className="relative mx-auto w-full max-w-lg lg:mx-0 lg:ml-auto">
              <div className="absolute -left-8 top-1/4 z-10 hidden rounded-2xl border border-white/50 bg-white/88 p-4 shadow-xl backdrop-blur sm:block dark:border-white/10 dark:bg-stone-900/88">
                <p className="tm-eyebrow !text-[0.58rem]">Made for the moment</p>
                <p className="tm-display mt-1 text-xl text-stone-900 dark:text-white">
                  Useful, not overwhelming
                </p>
              </div>
              <div className="relative h-[28rem] overflow-hidden rounded-b-[2.5rem] rounded-t-[12rem] border-[6px] border-white/60 shadow-2xl shadow-stone-900/15 sm:h-[34rem] dark:border-stone-800">
                <img
                  src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=85"
                  alt="A quiet mountain valley inviting exploration"
                  className="size-full object-cover motion-safe:animate-drift"
                  fetchPriority="high"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-950/65 via-transparent to-transparent" />
                <figcaption className="absolute inset-x-0 bottom-0 p-7 text-white">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-white/65">
                    Start with curiosity
                  </p>
                  <p className="tm-display mt-1 text-3xl">Plan around what matters.</p>
                </figcaption>
              </div>
              <a
                href="https://unsplash.com/"
                target="_blank"
                rel="noreferrer noopener"
                className="absolute -bottom-5 right-3 text-[0.6rem] text-stone-500 hover:underline dark:text-stone-500"
              >
                Photography via Unsplash
              </a>
            </figure>
          </div>

          <form
            onSubmit={submit}
            className="relative z-20 mt-16 lg:-mt-2"
            aria-label="Create a trip plan"
          >
            <div className="tm-card p-5 sm:p-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="tm-eyebrow">Begin your journey</p>
                  <h2 className="tm-display mt-1 text-2xl text-stone-950 sm:text-3xl dark:text-white">
                    Where will you go next?
                  </h2>
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  No dates? We’ll plan the next five days.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_0.7fr_auto] lg:items-end">
                <div>
                  <label htmlFor="destination-input" className="tm-label mb-2 block">
                    Destination
                  </label>
                  <div>
                    <DestinationSearch
                      id="destination-input"
                      value={city}
                      onChange={setCity}
                      onSelect={(option) => setCity(option.name)}
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="start-date" className="tm-label mb-2 block">
                    Leaving
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    value={startDate}
                    min={isoDateIn(0)}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      if (endDate && event.target.value > endDate) setEndDate('');
                    }}
                    className="tm-input min-h-14"
                  />
                </div>

                <div>
                  <label htmlFor="end-date" className="tm-label mb-2 block">
                    Returning
                  </label>
                  <input
                    id="end-date"
                    type="date"
                    value={endDate}
                    min={startDate || isoDateIn(0)}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="tm-input min-h-14"
                    aria-invalid={datesInvalid}
                    aria-describedby={datesInvalid ? 'date-error' : undefined}
                  />
                </div>

                <div>
                  <label htmlFor="travellers" className="tm-label mb-2 block">
                    Travellers
                  </label>
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                    <input
                      id="travellers"
                      type="number"
                      min={1}
                      max={20}
                      value={travellers}
                      onChange={(event) =>
                        setTravellers(Math.min(20, Math.max(1, Number(event.target.value) || 1)))
                      }
                      className="tm-input min-h-14 pl-10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="tm-btn-primary min-h-14 px-6"
                  disabled={!city.trim() || datesInvalid}
                >
                  Build my trip
                  <ArrowRightIcon className="size-4" />
                </button>
              </div>

              {datesInvalid ? (
                <p
                  id="date-error"
                  role="alert"
                  className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400"
                >
                  The return date must be on or after the departure date.
                </p>
              ) : nights && !datesInvalid ? (
                <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                  {nights} day{nights === 1 ? '' : 's'} selected · the live forecast covers the
                  first seven.
                </p>
              ) : null}
            </div>
          </form>
        </div>
      </section>

      <section className="tm-shell py-20 sm:py-28" aria-labelledby="destinations-heading">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="tm-eyebrow">Curated starting points</p>
            <h2
              id="destinations-heading"
              className="tm-display mt-3 max-w-2xl text-4xl leading-tight text-stone-950 sm:text-5xl dark:text-white"
            >
              A world of possibilities, one city at a time.
            </h2>
          </div>
          <Link to="/multi-city" className="tm-editorial-link shrink-0">
            Connect several destinations
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {POPULAR.map((item, index) => (
            <li key={item.city} className={index % 3 === 1 ? 'lg:translate-y-8' : ''}>
              <Link
                to={`/plan?city=${encodeURIComponent(item.city)}&days=5&homeCurrency=${homeCurrency}`}
                className="group block"
              >
                <article className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-brand-900 shadow-lg shadow-stone-900/8">
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-white">
                    <div>
                      <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-white/60">
                        {item.region}
                      </p>
                      <h3 className="tm-display mt-1 text-3xl">{item.city}</h3>
                      <p className="mt-1 text-xs text-white/70">{item.blurb}</p>
                    </div>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/35 bg-white/10 transition-colors group-hover:bg-white group-hover:text-brand-950">
                      <ArrowRightIcon className="size-4" />
                    </span>
                  </div>
                </article>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-right text-[0.65rem] text-stone-400 dark:text-stone-500">
          Destination photography via{' '}
          <a
            href="https://unsplash.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-stone-700 hover:underline dark:hover:text-stone-300"
          >
            Unsplash
          </a>
        </p>
      </section>

      <section
        className="border-y border-stone-200 bg-white/65 py-20 dark:border-stone-800 dark:bg-stone-900/40 sm:py-28"
        aria-labelledby="features-heading"
      >
        <div className="tm-shell grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="tm-eyebrow">What you carry forward</p>
            <h2
              id="features-heading"
              className="tm-display mt-4 text-4xl leading-tight text-stone-950 sm:text-5xl dark:text-white"
            >
              Less tab-switching. More confident decisions.
            </h2>
            <p className="mt-6 text-sm leading-7 text-stone-600 dark:text-stone-400">
              Each section resolves independently, so one unavailable source never turns into a
              broken trip. You always see what is live, cached or ready to retry.
            </p>
          </div>

          <ol className="border-t border-stone-300 dark:border-stone-700">
            {FEATURES.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="grid gap-4 border-b border-stone-300 py-7 sm:grid-cols-[3rem_1fr_1.2fr] sm:items-start dark:border-stone-700"
              >
                <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  <Icon className="size-4.5" />
                </span>
                <h3 className="tm-display text-xl text-stone-900 dark:text-stone-100">
                  <span className="mr-2 font-sans text-[0.6rem] font-bold tracking-widest text-stone-400">
                    0{index + 1}
                  </span>
                  {title}
                </h3>
                <p className="text-sm leading-6 text-stone-600 dark:text-stone-400">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tm-shell py-20 sm:py-28" aria-labelledby="process-heading">
        <div className="text-center">
          <p className="tm-eyebrow">From question to journey</p>
          <h2
            id="process-heading"
            className="tm-display mx-auto mt-4 max-w-2xl text-4xl leading-tight text-stone-950 sm:text-5xl dark:text-white"
          >
            Three simple steps. One considered plan.
          </h2>
        </div>

        <ol className="mt-14 grid gap-8 lg:grid-cols-3">
          {STEPS.map((item) => (
            <li
              key={item.step}
              className="relative border-t border-stone-300 pt-7 dark:border-stone-700"
            >
              <span className="font-mono text-xs font-bold tracking-widest text-brand-700 dark:text-brand-300">
                {item.step}
              </span>
              <h3 className="tm-display mt-5 text-2xl text-stone-900 dark:text-stone-100">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-stone-600 dark:text-stone-400">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="tm-shell pb-8 sm:pb-12">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand-950 px-6 py-12 text-white sm:px-10 lg:px-14 lg:py-16">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block">
            <img
              src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80"
              alt=""
              loading="lazy"
              className="size-full object-cover opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/35 to-transparent" />
          </div>
          <div className="relative max-w-2xl">
            <p className="tm-eyebrow !text-brand-200">
              <RouteIcon className="size-4" />A journey with more chapters
            </p>
            <h2 className="tm-display mt-4 text-4xl leading-tight sm:text-5xl">
              Turn several places into one route.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/70">
              Arrange up to eight cities, compare each stop, estimate the journeys between them and
              move through every destination without losing your itinerary.
            </p>
            <Link
              to="/multi-city"
              className="tm-btn mt-8 border border-white bg-white px-6 text-brand-950 hover:-translate-y-0.5 hover:bg-stone-100"
            >
              Plan a multi-city trip
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="tm-display text-2xl text-brand-800 dark:text-brand-200">{value}</p>
      <p className="mt-0.5 text-[0.62rem] font-bold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
        {label}
      </p>
    </div>
  );
}
