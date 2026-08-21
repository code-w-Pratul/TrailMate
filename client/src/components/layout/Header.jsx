import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  BookmarkIcon,
  CompassIcon,
  LogoutIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  RouteIcon,
  SunIcon,
  UserIcon,
  XIcon,
} from '../ui/Icons.jsx';

const NAV = [
  { to: '/', label: 'Plan', icon: CompassIcon, end: true },
  { to: '/multi-city', label: 'Multi-city', icon: RouteIcon },
  { to: '/trips', label: 'My trips', icon: BookmarkIcon, authOnly: true },
];

export default function Header() {
  const { isAuthenticated, user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const handleSignOut = () => {
    signOut();
    setMenuOpen(false);
    toast.info('Signed out');
    navigate('/');
  };

  const links = NAV.filter((item) => !item.authOnly || isAuthenticated);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-stone-50/88 backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/88">
      <div className="tm-shell flex min-h-18 items-center gap-3 py-3">
        <Link
          to="/"
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="TrailMate home"
        >
          <span className="grid size-10 place-items-center rounded-full bg-brand-800 text-white transition-transform duration-300 group-hover:rotate-12 dark:bg-brand-600">
            <CompassIcon className="size-5" />
          </span>
          <span className="leading-none">
            <span className="tm-display block text-[1.35rem] text-stone-950 dark:text-white">
              TrailMate
            </span>
            <span className="mt-1 hidden text-[0.55rem] font-bold uppercase tracking-[0.2em] text-stone-500 lg:block dark:text-stone-400">
              Travel intelligently
            </span>
          </span>
        </Link>

        <span
          className="mx-3 hidden h-8 w-px bg-stone-300 lg:block dark:bg-stone-700"
          aria-hidden="true"
        />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-800 text-white dark:bg-brand-600'
                    : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white'
                }`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden items-center rounded-full border border-stone-200 bg-white/60 p-0.5 md:flex dark:border-stone-800 dark:bg-stone-900/60">
            <UnitToggle />
            <span className="h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
            <ThemeToggle />
          </div>

          {isAuthenticated ? (
            <div className="hidden items-center gap-1 md:flex">
              <Link to="/settings" className="tm-btn-ghost gap-1.5 px-3" title={user?.email}>
                <UserIcon className="size-4" />
                <span className="max-w-24 truncate">{user?.name?.split(' ')[0]}</span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="tm-btn-ghost px-3"
                aria-label="Sign out"
              >
                <LogoutIcon className="size-4" />
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-1.5 md:flex">
              <Link to="/login" className="tm-btn-ghost px-3.5">
                Sign in
              </Link>
              <Link to="/register" className="tm-btn-primary px-4">
                Join TrailMate
              </Link>
            </div>
          )}

          <button
            type="button"
            className="tm-btn-ghost px-3 md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          className="border-t border-stone-200 bg-stone-50/96 px-4 py-4 md:hidden dark:border-stone-800 dark:bg-stone-950/96"
          aria-label="Mobile"
        >
          <ul className="mx-auto max-w-7xl space-y-1">
            {links.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
                      isActive
                        ? 'bg-brand-800 text-white dark:bg-brand-600'
                        : 'text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800'
                    }`
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              </li>
            ))}
            <li className="flex items-center gap-2 border-t border-stone-200 px-1 pt-3 dark:border-stone-800">
              <UnitToggle />
              <ThemeToggle />
            </li>
            <li className="pt-2">
              {isAuthenticated ? (
                <div className="flex gap-2">
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="tm-btn-secondary flex-1"
                  >
                    Settings
                  </Link>
                  <button type="button" onClick={handleSignOut} className="tm-btn-secondary flex-1">
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="tm-btn-secondary flex-1"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMenuOpen(false)}
                    className="tm-btn-primary flex-1"
                  >
                    Join
                  </Link>
                </div>
              )}
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

function UnitToggle() {
  const { temperatureUnit, distanceUnit, update } = usePreferences();
  const imperial = temperatureUnit === 'F';

  return (
    <button
      type="button"
      onClick={() =>
        update(
          imperial
            ? { temperatureUnit: 'C', distanceUnit: 'km' }
            : { temperatureUnit: 'F', distanceUnit: 'mi' }
        )
      }
      className="tm-btn-ghost min-h-9 px-2.5 py-1 font-mono text-[0.68rem]"
      title={`Switch to ${imperial ? 'Celsius and kilometres' : 'Fahrenheit and miles'}`}
      aria-label={`Units: ${temperatureUnit === 'C' ? 'Celsius' : 'Fahrenheit'} and ${distanceUnit === 'km' ? 'kilometres' : 'miles'}. Click to switch.`}
    >
      °{temperatureUnit} · {distanceUnit}
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = usePreferences();

  const order = ['light', 'dark', 'system'];
  const icons = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };
  const labels = { light: 'Light', dark: 'Dark', system: 'System' };
  const Icon = icons[theme] ?? MonitorIcon;
  const next = order[(order.indexOf(theme) + 1) % order.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="tm-btn-ghost min-h-9 px-2.5 py-1"
      title={`Theme: ${labels[theme]}. Click for ${labels[next]}.`}
      aria-label={`Theme: ${labels[theme]}. Click to switch to ${labels[next]}.`}
    >
      <Icon className="size-4" />
    </button>
  );
}
