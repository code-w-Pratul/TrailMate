import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../api/endpoints.js';
import { Badge, Notice } from '../components/ui/Badge.jsx';
import { CheckIcon, SpinnerIcon } from '../components/ui/Icons.jsx';
import { formatNumber, formatPercent } from '../lib/format.js';

/**
 * Account and display settings, plus a live view of the API budget.
 *
 * The usage panel is the most interesting thing on this page: it shows today's
 * spend against each provider's free tier and the cache hit rate that is holding
 * that spend down. It makes the caching layer's value measurable rather than
 * asserted.
 */
export default function SettingsPage() {
  const { user, saveProfile } = useAuth();
  const preferences = usePreferences();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [currency, setCurrency] = useState(user?.homeCurrency ?? preferences.homeCurrency);
  const [pending, setPending] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordPending, setPasswordPending] = useState(false);

  const saveAccount = async (event) => {
    event.preventDefault();
    setPending(true);
    try {
      await saveProfile({
        name,
        homeCurrency: currency,
        preferences: {
          theme: preferences.theme,
          temperatureUnit: preferences.temperatureUnit,
          distanceUnit: preferences.distanceUnit,
        },
      });
      toast.success('Settings saved to your account');
    } catch (error) {
      toast.error(error.message ?? 'Could not save your settings');
    } finally {
      setPending(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordPending(true);
    try {
      await api.changePassword(passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast.success('Password updated');
    } catch (error) {
      toast.error(error.message ?? 'Could not change your password');
    } finally {
      setPasswordPending(false);
    }
  };

  return (
    <div className="tm-page max-w-4xl space-y-6">
      <header className="border-b border-stone-300 pb-8 dark:border-stone-700">
        <p className="tm-eyebrow">Account &amp; preferences</p>
        <h1 className="tm-page-title mt-3">Settings</h1>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          Signed in as{' '}
          <span className="font-medium text-stone-900 dark:text-stone-200">{user?.email}</span>
        </p>
      </header>

      {/* Display preferences */}
      <section className="tm-card tm-card-pad">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Display</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Applied immediately in this browser, and saved to your account when you press save below —
          so they follow you to another device.
        </p>

        <div className="mt-4 space-y-4">
          <Choice
            label="Theme"
            value={preferences.theme}
            onChange={preferences.setTheme}
            options={[
              ['light', 'Light'],
              ['dark', 'Dark'],
              ['system', 'Match my system'],
            ]}
          />
          <Choice
            label="Temperature"
            value={preferences.temperatureUnit}
            onChange={(value) => preferences.update({ temperatureUnit: value })}
            options={[
              ['C', 'Celsius'],
              ['F', 'Fahrenheit'],
            ]}
          />
          <Choice
            label="Distance"
            value={preferences.distanceUnit}
            onChange={(value) => preferences.update({ distanceUnit: value })}
            options={[
              ['km', 'Kilometres'],
              ['mi', 'Miles'],
            ]}
          />
        </div>
      </section>

      {/* Account */}
      <form onSubmit={saveAccount} className="tm-card tm-card-pad">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Account</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-name" className="tm-label mb-1.5 block">
              Name
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              minLength={2}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              className="tm-input"
            />
          </div>
          <div>
            <label htmlFor="settings-currency" className="tm-label mb-1.5 block">
              Home currency
            </label>
            <input
              id="settings-currency"
              type="text"
              maxLength={3}
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))}
              className="tm-input w-28 font-mono uppercase"
            />
          </div>
        </div>

        <button type="submit" disabled={pending} className="tm-btn-primary mt-4">
          {pending ? <SpinnerIcon className="size-4" /> : <CheckIcon className="size-4" />}
          Save settings
        </button>
      </form>

      {/* Password */}
      <form onSubmit={submitPassword} className="tm-card tm-card-pad">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Password</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="current-password" className="tm-label mb-1.5 block">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={passwords.currentPassword}
              onChange={(event) =>
                setPasswords({ ...passwords, currentPassword: event.target.value })
              }
              className="tm-input"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="tm-label mb-1.5 block">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={passwords.newPassword}
              onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
              className="tm-input"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={
            passwordPending || !passwords.currentPassword || passwords.newPassword.length < 8
          }
          className="tm-btn-secondary mt-4"
        >
          {passwordPending ? <SpinnerIcon className="size-4" /> : null}
          Change password
        </button>
      </form>

      <ApiBudgetPanel />
    </div>
  );
}

function Choice({ label, value, onChange, options }) {
  return (
    <fieldset>
      <legend className="tm-label mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            aria-pressed={value === optionValue}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              value === optionValue
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Today's free-tier consumption, straight from `GET /api/meta/usage`. */
function ApiBudgetPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: api.keys.usage,
    queryFn: api.getApiUsage,
    refetchInterval: 60_000,
  });

  const providers = data?.providers ?? [];
  const cache = data?.cache;

  return (
    <section className="tm-card tm-card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            API budget today
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Calls made to each upstream provider since 00:00 UTC, against its free-tier allowance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="tm-btn-ghost text-xs"
        >
          Refresh
        </button>
      </div>

      {cache ? (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/60">
          <Stat label="Cache store" value={cache.store} />
          <Stat
            label="Hit rate"
            value={cache.hitRate !== null ? formatPercent(cache.hitRate, 1) : '—'}
          />
          <Stat label="Cached entries" value={formatNumber(cache.entries ?? 0)} />
          <Stat label="In flight" value={formatNumber(cache.inflight ?? 0)} />
        </div>
      ) : null}

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading usage…</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No upstream calls yet today — everything has come from cache.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {providers.map((provider) => (
              <li key={provider.provider}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {provider.provider}
                  </span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {formatNumber(provider.calls)}
                    {provider.quota ? ` / ${formatNumber(provider.quota)}` : ' calls'}
                    {provider.failures > 0 ? (
                      <span className="ml-2 text-rose-500">{provider.failures} failed</span>
                    ) : null}
                  </span>
                </div>

                {provider.quota ? (
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                    role="progressbar"
                    aria-valuenow={provider.usedPercent ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${provider.provider} quota used`}
                  >
                    <div
                      className={`h-full rounded-full ${
                        (provider.usedPercent ?? 0) >= 90
                          ? 'bg-rose-500'
                          : (provider.usedPercent ?? 0) >= 75
                            ? 'bg-amber-500'
                            : 'bg-brand-500'
                      }`}
                      style={{ width: `${Math.min(provider.usedPercent ?? 0, 100)}%` }}
                    />
                  </div>
                ) : (
                  <Badge tone="neutral" className="mt-1">
                    unmetered
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {data?.note ? <Notice>{data.note}</Notice> : null}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
