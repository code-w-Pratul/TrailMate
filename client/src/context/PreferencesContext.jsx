import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Display preferences: theme, temperature unit, distance unit, home currency.
 *
 * Persisted under one key so the pre-paint script in index.html can read the
 * theme synchronously and avoid a flash of the wrong colour scheme. Signed-in
 * users' preferences are also mirrored to their account by AuthProvider, so the
 * choice follows them to another device.
 */

const STORAGE_KEY = 'trailmate.preferences';

const DEFAULTS = {
  theme: 'system', // 'light' | 'dark' | 'system'
  temperatureUnit: 'C', // 'C' | 'F'
  distanceUnit: 'km', // 'km' | 'mi'
  homeCurrency: 'USD',
};

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * A sensible first guess from the browser: someone in en-US almost certainly
 * wants Fahrenheit and miles, and their locale's currency beats a hardcoded USD.
 */
function guessFromLocale() {
  try {
    const locale = navigator.language || 'en-GB';
    const region = new Intl.Locale(locale).region ?? locale.split('-')[1] ?? 'GB';

    const fahrenheit = ['US', 'BS', 'KY', 'LR', 'PW', 'FM', 'MH'];
    const miles = ['US', 'GB', 'LR', 'MM'];
    const currencyByRegion = {
      US: 'USD',
      GB: 'GBP',
      IN: 'INR',
      JP: 'JPY',
      CA: 'CAD',
      AU: 'AUD',
      NZ: 'NZD',
      CH: 'CHF',
      SE: 'SEK',
      NO: 'NOK',
      DK: 'DKK',
      PL: 'PLN',
      CZ: 'CZK',
      ZA: 'ZAR',
      SG: 'SGD',
      HK: 'HKD',
      KR: 'KRW',
      BR: 'BRL',
      MX: 'MXN',
      TR: 'TRY',
      IL: 'ILS',
    };
    const euro = [
      'DE',
      'FR',
      'ES',
      'IT',
      'PT',
      'NL',
      'BE',
      'AT',
      'IE',
      'FI',
      'GR',
      'SK',
      'SI',
      'EE',
      'LV',
      'LT',
      'LU',
      'MT',
      'CY',
      'HR',
    ];

    return {
      temperatureUnit: fahrenheit.includes(region) ? 'F' : 'C',
      distanceUnit: miles.includes(region) ? 'mi' : 'km',
      homeCurrency: currencyByRegion[region] ?? (euro.includes(region) ? 'EUR' : 'USD'),
    };
  } catch {
    return {};
  }
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(() => {
    const stored = readStored();
    // Locale guesses only fill gaps; an explicit choice always wins.
    return { ...DEFAULTS, ...guessFromLocale(), ...stored };
  });

  /* Persist. */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      /* storage unavailable — preferences last for this session only */
    }
  }, [preferences]);

  /* Apply the theme class, and follow the OS while the theme is "system". */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark =
        preferences.theme === 'dark' || (preferences.theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#020617' : '#0f766e');
    };

    apply();
    if (preferences.theme !== 'system') return undefined;

    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences.theme]);

  const update = useCallback((patch) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo(
    () => ({
      ...preferences,
      /** True when dark styles are actually active right now. */
      isDark:
        preferences.theme === 'dark' ||
        (preferences.theme === 'system' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches),
      update,
      setTheme: (theme) => update({ theme }),
      toggleTheme: () =>
        setPreferences((current) => ({
          ...current,
          theme: current.theme === 'dark' ? 'light' : 'dark',
        })),
      toggleTemperatureUnit: () =>
        setPreferences((current) => ({
          ...current,
          temperatureUnit: current.temperatureUnit === 'C' ? 'F' : 'C',
        })),
      toggleDistanceUnit: () =>
        setPreferences((current) => ({
          ...current,
          distanceUnit: current.distanceUnit === 'km' ? 'mi' : 'km',
        })),
      setHomeCurrency: (homeCurrency) => update({ homeCurrency }),
    }),
    [preferences, update]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return context;
}

export default PreferencesContext;
