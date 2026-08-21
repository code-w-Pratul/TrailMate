import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { CompassIcon, SpinnerIcon } from '../components/ui/Icons.jsx';
import { Notice } from '../components/ui/Badge.jsx';

/** Create an account with live, explicit password requirements. */
export default function RegisterPage() {
  const { signUp } = useAuth();
  const { homeCurrency } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', email: '', password: '', homeCurrency });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const rules = {
    length: form.password.length >= 8 && form.password.length <= 128,
    letter: /[a-zA-Z]/.test(form.password),
    number: /\d/.test(form.password),
  };
  const passwordValid = Object.values(rules).every(Boolean);

  const submit = async (event) => {
    event.preventDefault();
    if (!passwordValid) return;

    setPending(true);
    setError(null);
    try {
      await signUp(form);
      toast.success('Account created — welcome to TrailMate');
      navigate(location.state?.from ?? '/trips', { replace: true });
    } catch (signUpError) {
      setError(signUpError);
    } finally {
      setPending(false);
    }
  };

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <div className="tm-page max-w-6xl py-10 sm:py-14">
      <section className="tm-card grid overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
          <div className="lg:hidden">
            <span className="grid size-11 place-items-center rounded-full bg-brand-800 text-white dark:bg-brand-600">
              <CompassIcon className="size-5" />
            </span>
          </div>
          <p className="tm-eyebrow mt-6 lg:mt-0">Your private travel library</p>
          <h1 className="tm-page-title mt-3">Keep the plans worth returning to.</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600 dark:text-stone-400">
            Save live trip snapshots, keep personal notes and share read-only itineraries when you
            choose.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            {error && !Object.keys(fieldErrors).length ? (
              <div role="alert">
                <Notice tone="danger">{error.message}</Notice>
              </div>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="tm-label mb-2 block">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="tm-input"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                />
                {fieldErrors.name ? (
                  <p
                    id="name-error"
                    role="alert"
                    className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
                  >
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="homeCurrency" className="tm-label mb-2 block">
                  Home currency
                </label>
                <input
                  id="homeCurrency"
                  type="text"
                  maxLength={3}
                  value={form.homeCurrency}
                  onChange={(event) =>
                    setForm({ ...form, homeCurrency: event.target.value.toUpperCase().slice(0, 3) })
                  }
                  className="tm-input font-mono uppercase"
                  aria-invalid={Boolean(fieldErrors.homeCurrency)}
                  aria-describedby={`currency-hint${fieldErrors.homeCurrency ? ' currency-error' : ''}`}
                />
                <p id="currency-hint" className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
                  Used for destination price conversions.
                </p>
                {fieldErrors.homeCurrency ? (
                  <p
                    id="currency-error"
                    role="alert"
                    className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
                  >
                    {fieldErrors.homeCurrency}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="tm-label mb-2 block">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                maxLength={160}
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="tm-input"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
              />
              {fieldErrors.email ? (
                <p
                  id="register-email-error"
                  role="alert"
                  className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="password" className="tm-label mb-2 block">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className="tm-input"
                aria-describedby={`password-rules${fieldErrors.password ? ' register-password-error' : ''}`}
                aria-invalid={
                  Boolean(fieldErrors.password) || (form.password.length > 0 && !passwordValid)
                }
              />
              <ul id="password-rules" className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
                <Rule met={rules.length}>8–128 characters</Rule>
                <Rule met={rules.letter}>One letter</Rule>
                <Rule met={rules.number}>One number</Rule>
              </ul>
              {fieldErrors.password ? (
                <p
                  id="register-password-error"
                  role="alert"
                  className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={pending || !passwordValid}
              className="tm-btn-primary w-full py-3"
            >
              {pending ? <SpinnerIcon className="size-4" /> : null}
              Create account
            </button>

            <p className="text-center text-sm text-stone-600 dark:text-stone-400">
              Already have an account?{' '}
              <Link
                to="/login"
                state={location.state}
                className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>

        <aside className="relative hidden min-h-[48rem] overflow-hidden bg-brand-950 lg:block">
          <img
            src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=84"
            alt=""
            className="absolute inset-0 size-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/20 to-transparent" />
          <a
            href="https://unsplash.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="absolute right-5 top-5 text-[10px] text-white/60 hover:text-white hover:underline"
          >
            Photography via Unsplash
          </a>
          <div className="absolute inset-x-0 bottom-0 p-10 text-white">
            <span className="grid size-11 place-items-center rounded-full border border-white/25 bg-white/10 backdrop-blur">
              <CompassIcon className="size-5" />
            </span>
            <p className="tm-display mt-6 text-4xl leading-tight">
              A better plan becomes a better memory.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-7 text-white/65">
              Keep every useful detail together, then share only what your fellow travellers need.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Rule({ met, children }) {
  return (
    <li
      className={`flex items-center gap-1.5 ${met ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}`}
    >
      <span aria-hidden="true">{met ? '✓' : '•'}</span>
      {children}
    </li>
  );
}
