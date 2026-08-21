import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { CompassIcon, SpinnerIcon } from '../components/ui/Icons.jsx';
import { Notice } from '../components/ui/Badge.jsx';

/** Sign in and return the traveller to the route they originally requested. */
export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const destination = location.state?.from ?? '/trips';

  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await signIn(form);
      toast.success('Welcome back');
      navigate(destination, { replace: true });
    } catch (signInError) {
      setError(signInError);
    } finally {
      setPending(false);
    }
  };

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <div className="tm-page max-w-6xl py-10 sm:py-14">
      <section className="tm-card grid overflow-hidden lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="relative hidden min-h-[42rem] overflow-hidden bg-brand-950 lg:block">
          <img
            src="https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=84"
            alt=""
            className="absolute inset-0 size-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/35 to-transparent" />
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
              Your journeys are waiting where you left them.
            </p>
            <p className="mt-4 max-w-md text-sm leading-7 text-white/65">
              Return to saved plans, fresh provider data and the details that make a destination
              feel within reach.
            </p>
          </div>
        </aside>

        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
          <div className="lg:hidden">
            <span className="grid size-11 place-items-center rounded-full bg-brand-800 text-white dark:bg-brand-600">
              <CompassIcon className="size-5" />
            </span>
          </div>
          <p className="tm-eyebrow mt-6 lg:mt-0">Welcome back</p>
          <h1 className="tm-page-title mt-3">Continue your journey.</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600 dark:text-stone-400">
            Sign in to reach saved trips and account preferences.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            {error && !Object.keys(fieldErrors).length && error.code !== 'DATABASE_UNAVAILABLE' ? (
              <div role="alert">
                <Notice tone="danger">{error.message}</Notice>
              </div>
            ) : null}

            {error?.code === 'DATABASE_UNAVAILABLE' ? (
              <div role="alert">
                <Notice tone="warning">
                  Accounts are offline because the database is unreachable. You can still plan trips
                  — you just cannot save them yet.
                </Notice>
              </div>
            ) : null}

            <div>
              <label htmlFor="email" className="tm-label mb-2 block">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="tm-input"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              {fieldErrors.email ? (
                <p
                  id="email-error"
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
                autoComplete="current-password"
                required
                maxLength={128}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className="tm-input"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              />
              {fieldErrors.password ? (
                <p
                  id="password-error"
                  role="alert"
                  className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>

            <button type="submit" disabled={pending} className="tm-btn-primary w-full py-3">
              {pending ? <SpinnerIcon className="size-4" /> : null}
              Sign in
            </button>

            <p className="text-center text-sm text-stone-600 dark:text-stone-400">
              New here?{' '}
              <Link
                to="/register"
                state={location.state}
                className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                Create an account
              </Link>
            </p>
          </form>

          <p className="mt-8 rounded-2xl bg-stone-100 px-4 py-3 text-center text-xs leading-5 text-stone-600 dark:bg-stone-800/70 dark:text-stone-400">
            Running the seed script? Sign in with{' '}
            <code className="font-mono text-stone-800 dark:text-stone-200">demo@trailmate.dev</code>{' '}
            / <code className="font-mono text-stone-800 dark:text-stone-200">trailmate123</code>
          </p>
        </div>
      </section>
    </div>
  );
}
