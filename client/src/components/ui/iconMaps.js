import {
  BuildingIcon,
  BusIcon,
  CameraIcon,
  CarIcon,
  CastleIcon,
  CloudIcon,
  CoffeeIcon,
  DrizzleIcon,
  FogIcon,
  ForkKnifeIcon,
  MapPinIcon,
  MuseumIcon,
  PartlyCloudyIcon,
  PlaneIcon,
  RainIcon,
  SnowIcon,
  SunIcon,
  ThunderIcon,
  TrainIcon,
  TreeIcon,
  WalkIcon,
  WindIcon,
} from './Icons.jsx';

/**
 * Maps from the API's normalised vocabularies to icons and colours.
 *
 * This file only exists because the backend normalises: there is one closed set
 * of weather conditions and one closed set of place categories, so the UI needs
 * exactly one lookup table each — not a per-provider translation layer.
 */

/* -------------------------------------------------------------------------- */
/* Weather                                                                    */
/* -------------------------------------------------------------------------- */

export const WEATHER_ICONS = {
  clear: SunIcon,
  'partly-cloudy': PartlyCloudyIcon,
  cloudy: CloudIcon,
  fog: FogIcon,
  drizzle: DrizzleIcon,
  rain: RainIcon,
  'freezing-rain': SnowIcon,
  snow: SnowIcon,
  thunderstorm: ThunderIcon,
  hail: ThunderIcon,
  wind: WindIcon,
  unknown: CloudIcon,
};

/** Tailwind text colours per condition, tuned for both themes. */
export const WEATHER_COLORS = {
  clear: 'text-amber-500 dark:text-amber-400',
  'partly-cloudy': 'text-sky-500 dark:text-sky-300',
  cloudy: 'text-slate-500 dark:text-slate-400',
  fog: 'text-slate-400 dark:text-slate-500',
  drizzle: 'text-sky-600 dark:text-sky-400',
  rain: 'text-blue-600 dark:text-blue-400',
  'freezing-rain': 'text-cyan-600 dark:text-cyan-300',
  snow: 'text-cyan-500 dark:text-cyan-200',
  thunderstorm: 'text-violet-600 dark:text-violet-400',
  hail: 'text-violet-600 dark:text-violet-400',
  wind: 'text-teal-600 dark:text-teal-400',
  unknown: 'text-slate-400',
};

export const weatherIcon = (condition) => WEATHER_ICONS[condition] ?? WEATHER_ICONS.unknown;
export const weatherColor = (condition) => WEATHER_COLORS[condition] ?? WEATHER_COLORS.unknown;

/* -------------------------------------------------------------------------- */
/* Place categories                                                          */
/* -------------------------------------------------------------------------- */

export const CATEGORY_ICONS = {
  attraction: MapPinIcon,
  museum: MuseumIcon,
  gallery: MuseumIcon,
  historic: CastleIcon,
  viewpoint: CameraIcon,
  park: TreeIcon,
  zoo: TreeIcon,
  'theme-park': TreeIcon,
  artwork: CameraIcon,
  restaurant: ForkKnifeIcon,
  cafe: CoffeeIcon,
  bar: CoffeeIcon,
  other: BuildingIcon,
};

/** Marker colours, also used for the map pins so list and map agree. */
export const CATEGORY_COLORS = {
  attraction: '#0d9488',
  museum: '#7c3aed',
  gallery: '#7c3aed',
  historic: '#b45309',
  viewpoint: '#0284c7',
  park: '#16a34a',
  zoo: '#16a34a',
  'theme-park': '#db2777',
  artwork: '#c026d3',
  restaurant: '#dc2626',
  cafe: '#ea580c',
  bar: '#ea580c',
  other: '#64748b',
};

export const categoryIcon = (category) => CATEGORY_ICONS[category] ?? CATEGORY_ICONS.other;
export const categoryColor = (category) => CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;

/** Food categories are listed separately from sights throughout the UI. */
export const FOOD_CATEGORIES = new Set(['restaurant', 'cafe', 'bar']);

/* -------------------------------------------------------------------------- */
/* Travel modes (multi-city legs)                                            */
/* -------------------------------------------------------------------------- */

export const TRAVEL_ICONS = {
  walk: WalkIcon,
  transit: BusIcon,
  car: CarIcon,
  train: TrainIcon,
  flight: PlaneIcon,
};

export const travelIcon = (mode) => TRAVEL_ICONS[mode] ?? CarIcon;
