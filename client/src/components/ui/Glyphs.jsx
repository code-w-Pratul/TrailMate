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
import { weatherColor } from './iconMaps.js';

/**
 * Glyph dispatchers.
 *
 * These exist for a specific reason. The obvious way to render a mapped icon is:
 *
 *     const Icon = weatherIcon(condition);
 *     return <Icon className="size-5" />;
 *
 * …but assigning a component to a local and rendering it means the component
 * identity is only known at render time. The React Compiler (via
 * eslint-plugin-react-hooks v7) rejects that as "cannot create components during
 * render", because it cannot prove the identity is stable — and an unstable
 * component type forces React to unmount and remount the subtree.
 *
 * An explicit switch keeps every component reference static, so the compiler can
 * optimise the tree and React can reconcile it properly. It costs a few more
 * lines and reads perfectly clearly.
 */

/* -------------------------------------------------------------------------- */
/* Weather                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {{ condition: string, className?: string, coloured?: boolean, label?: string }} props
 */
export function WeatherGlyph({ condition, className = 'size-5', coloured = true, label }) {
  const classes = coloured ? `${className} ${weatherColor(condition)}` : className;
  const a11y = label ? { role: 'img', 'aria-label': label } : {};

  switch (condition) {
    case 'clear':
      return <SunIcon className={classes} {...a11y} />;
    case 'partly-cloudy':
      return <PartlyCloudyIcon className={classes} {...a11y} />;
    case 'cloudy':
      return <CloudIcon className={classes} {...a11y} />;
    case 'fog':
      return <FogIcon className={classes} {...a11y} />;
    case 'drizzle':
      return <DrizzleIcon className={classes} {...a11y} />;
    case 'rain':
      return <RainIcon className={classes} {...a11y} />;
    case 'freezing-rain':
    case 'snow':
      return <SnowIcon className={classes} {...a11y} />;
    case 'thunderstorm':
    case 'hail':
      return <ThunderIcon className={classes} {...a11y} />;
    case 'wind':
      return <WindIcon className={classes} {...a11y} />;
    default:
      return <CloudIcon className={classes} {...a11y} />;
  }
}

/* -------------------------------------------------------------------------- */
/* Place categories                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @param {{ category: string, className?: string }} props
 */
export function CategoryGlyph({ category, className = 'size-5' }) {
  switch (category) {
    case 'attraction':
      return <MapPinIcon className={className} />;
    case 'museum':
    case 'gallery':
      return <MuseumIcon className={className} />;
    case 'historic':
      return <CastleIcon className={className} />;
    case 'viewpoint':
    case 'artwork':
      return <CameraIcon className={className} />;
    case 'park':
    case 'zoo':
    case 'theme-park':
      return <TreeIcon className={className} />;
    case 'restaurant':
      return <ForkKnifeIcon className={className} />;
    case 'cafe':
    case 'bar':
      return <CoffeeIcon className={className} />;
    default:
      return <BuildingIcon className={className} />;
  }
}

/* -------------------------------------------------------------------------- */
/* Travel modes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * @param {{ mode: string, className?: string }} props
 */
export function TravelGlyph({ mode, className = 'size-4' }) {
  switch (mode) {
    case 'walk':
      return <WalkIcon className={className} />;
    case 'transit':
      return <BusIcon className={className} />;
    case 'train':
      return <TrainIcon className={className} />;
    case 'flight':
      return <PlaneIcon className={className} />;
    default:
      return <CarIcon className={className} />;
  }
}
