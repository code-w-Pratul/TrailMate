/**
 * Inline icon set.
 *
 * Hand-rolled rather than pulling an icon library: the app needs about
 * twenty-five glyphs, and inlining them keeps the bundle small, makes every icon
 * inherit `currentColor` for free in both themes, and avoids a dependency whose
 * tree-shaking would need watching.
 *
 * All icons are 24×24, stroke-based, and decorative by default
 * (`aria-hidden`) — the surrounding control carries the accessible name.
 */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

const Icon = ({ children, className = 'size-5', ...rest }) => (
  <svg {...base} className={className} {...rest}>
    {children}
  </svg>
);

/* --- Navigation & chrome ------------------------------------------------- */

export const CompassIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2.1 5-5 2.1 2.1-5z" />
  </Icon>
);

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const SunIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
  </Icon>
);

export const MonitorIcon = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="4" width="19" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Icon>
);

export const UserIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

export const LogoutIcon = (p) => (
  <Icon {...p}>
    <path d="M15 4h2.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M11 8 7 12l4 4M7 12h9" />
  </Icon>
);

export const MenuIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const XIcon = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);

export const ChevronDownIcon = (p) => (
  <Icon {...p}>
    <path d="m5 9 7 7 7-7" />
  </Icon>
);

export const ArrowRightIcon = (p) => (
  <Icon {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icon>
);

export const ExternalLinkIcon = (p) => (
  <Icon {...p}>
    <path d="M14 4h6v6M20 4l-8 8" />
    <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Icon>
);

/* --- Status -------------------------------------------------------------- */

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="m5 13 4 4L19 7" />
  </Icon>
);

export const InfoIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);

export const WarningIcon = (p) => (
  <Icon {...p}>
    <path d="M10.6 4.2 2.9 17.4A1.6 1.6 0 0 0 4.3 20h15.4a1.6 1.6 0 0 0 1.4-2.6L13.4 4.2a1.6 1.6 0 0 0-2.8 0z" />
    <path d="M12 9v4M12 16h.01" />
  </Icon>
);

export const RefreshIcon = (p) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 5v6h-6" />
  </Icon>
);

export const SpinnerIcon = ({ className = 'size-5', ...rest }) => (
  <svg {...base} className={`${className} animate-spin`} {...rest}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export const DatabaseOffIcon = (p) => (
  <Icon {...p}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="m3 3 18 18" />
  </Icon>
);

/* --- Domain -------------------------------------------------------------- */

export const MapPinIcon = (p) => (
  <Icon {...p}>
    <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);

export const CalendarIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </Icon>
);

export const WalletIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M16.5 14.5h.01" />
  </Icon>
);

export const GlobeIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
  </Icon>
);

export const SparklesIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5 13.6 8 18 9.5 13.6 11 12 15.5 10.4 11 6 9.5 10.4 8z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Icon>
);

export const BackpackIcon = (p) => (
  <Icon {...p}>
    <path d="M6 9a6 6 0 0 1 12 0v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    <path d="M9.5 4.5V4a2.5 2.5 0 0 1 5 0v.5M9 13h6M9 20v-4h6v4" />
  </Icon>
);

export const ChartIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 20v-6M12 20v-10M16 20v-4M20 20V8" />
  </Icon>
);

export const ShareIcon = (p) => (
  <Icon {...p}>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4" />
  </Icon>
);

export const LinkIcon = (p) => (
  <Icon {...p}>
    <path d="M10 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7L11.3 6" />
    <path d="M14 11a4 4 0 0 0-5.7 0L5.7 13.6a4 4 0 0 0 5.7 5.7L12.7 18" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const BookmarkIcon = (p) => (
  <Icon {...p}>
    <path d="M6 4h12v17l-6-4-6 4z" />
  </Icon>
);

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const RouteIcon = (p) => (
  <Icon {...p}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M8.5 18h5a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7h5" />
  </Icon>
);

export const PlaneIcon = (p) => (
  <Icon {...p}>
    <path d="M3 13l18-6-4.5 12-3.5-5-5 3z" />
  </Icon>
);

export const TrainIcon = (p) => (
  <Icon {...p}>
    <rect x="6" y="3.5" width="12" height="13" rx="2.5" />
    <path d="M6 10h12M9.5 20l1.5-3.5M14.5 20 13 16.5M8 20h8" />
    <path d="M9.5 7h.01M14.5 7h.01" />
  </Icon>
);

export const CarIcon = (p) => (
  <Icon {...p}>
    <path d="M4 16v-3l2-5h12l2 5v3" />
    <path d="M2 16h20M6.5 16v2M17.5 16v2" />
    <path d="M7 12.5h.01M17 12.5h.01" />
  </Icon>
);

export const WalkIcon = (p) => (
  <Icon {...p}>
    <circle cx="13" cy="4.5" r="2" />
    <path d="M13 8.5 10 13l2 2 1 6M13 8.5l3 2 1 3M10 13l-3 1M12 15l-2 6" />
  </Icon>
);

export const BusIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="13" rx="2" />
    <path d="M4 11h16M7.5 20v-3M16.5 20v-3M8 14h.01M16 14h.01" />
  </Icon>
);

/* --- Weather ------------------------------------------------------------- */

export const CloudIcon = (p) => (
  <Icon {...p}>
    <path d="M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 9.2 3.9 3.9 0 0 1 16.5 18z" />
  </Icon>
);

export const PartlyCloudyIcon = (p) => (
  <Icon {...p}>
    <circle cx="8.5" cy="8" r="3" />
    <path d="M8.5 2.5v1.5M3 8h1.5M4.6 4.1l1 1M12.4 4.1l-1 1" />
    <path d="M11 19a3.5 3.5 0 0 1-.3-7 4.8 4.8 0 0 1 9 .8A3.4 3.4 0 0 1 19 19z" />
  </Icon>
);

export const RainIcon = (p) => (
  <Icon {...p}>
    <path d="M7 15a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 6.2 3.9 3.9 0 0 1 16.5 15z" />
    <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" />
  </Icon>
);

export const DrizzleIcon = (p) => (
  <Icon {...p}>
    <path d="M7 15a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 6.2 3.9 3.9 0 0 1 16.5 15z" />
    <path d="M9.5 18.5v1.5M13 18.5V20M16.5 18.5V20" />
  </Icon>
);

export const SnowIcon = (p) => (
  <Icon {...p}>
    <path d="M7 14a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 5.2 3.9 3.9 0 0 1 16.5 14z" />
    <path d="M9 18h.01M12.5 20h.01M16 18h.01M12.5 17h.01" />
  </Icon>
);

export const ThunderIcon = (p) => (
  <Icon {...p}>
    <path d="M7 14a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 5.2 3.9 3.9 0 0 1 16.5 14z" />
    <path d="m13 16-3 3.5h2.5L11.5 23l4-4.5H13z" />
  </Icon>
);

export const FogIcon = (p) => (
  <Icon {...p}>
    <path d="M7 12a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 3.2 3.9 3.9 0 0 1 16.5 12z" />
    <path d="M5 16h14M7 19.5h10" />
  </Icon>
);

export const WindIcon = (p) => (
  <Icon {...p}>
    <path d="M3 8h11a3 3 0 1 0-3-3M3 12h15M3 16h9a3 3 0 1 1-3 3" />
  </Icon>
);

export const DropletIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3s6 6.4 6 10.2A6 6 0 0 1 6 13.2C6 9.4 12 3 12 3z" />
  </Icon>
);

export const ThermometerIcon = (p) => (
  <Icon {...p}>
    <path d="M12 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z" />
    <path d="M8 8H5M8 12H5" />
  </Icon>
);

/* --- Place categories ---------------------------------------------------- */

export const MuseumIcon = (p) => (
  <Icon {...p}>
    <path d="M3 9.5 12 4l9 5.5M5 10v9M19 10v9M9 19v-6M15 19v-6M3 20h18" />
  </Icon>
);

export const CastleIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20V8l2 1.5V6l3 1.5V5l3 1.5L15 5v2.5L18 6v3.5L20 8v12z" />
    <path d="M10.5 20v-4h3v4M4 20h16" />
  </Icon>
);

export const TreeIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3 7 11h3l-3 5h10l-3-5h3z" />
    <path d="M12 16v5" />
  </Icon>
);

export const CameraIcon = (p) => (
  <Icon {...p}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.2" />
  </Icon>
);

export const ForkKnifeIcon = (p) => (
  <Icon {...p}>
    <path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9" />
    <path d="M16 3c2 0 3 1.5 3 4s-1 4-3 4M16 11v10" />
  </Icon>
);

export const CoffeeIcon = (p) => (
  <Icon {...p}>
    <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17M5 21h11" />
  </Icon>
);

export const BuildingIcon = (p) => (
  <Icon {...p}>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10.5 21v-3h3v3" />
  </Icon>
);

export default {
  CompassIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  MapPinIcon,
  CalendarIcon,
};
