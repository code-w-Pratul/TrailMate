import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Header from './components/layout/Header.jsx';
import Footer from './components/layout/Footer.jsx';
import Toaster from './components/ui/Toaster.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { SpinnerIcon } from './components/ui/Icons.jsx';
import { useAuth } from './context/AuthContext.jsx';

import LandingPage from './pages/LandingPage.jsx';
import PlanPage from './pages/PlanPage.jsx';

/**
 * Routes are split by weight. The landing and plan pages load eagerly because
 * they are the entry points; everything else is lazy so the first paint is not
 * paying for Leaflet, the trips list or the settings form.
 */
const MyTripsPage = lazy(() => import('./pages/MyTripsPage.jsx'));
const TripDetailPage = lazy(() => import('./pages/TripDetailPage.jsx'));
const SharedTripPage = lazy(() => import('./pages/SharedTripPage.jsx'));
const MultiCityPage = lazy(() => import('./pages/MultiCityPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      {/* Skip link: the first tab stop on every page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <Header />

      <main id="main" className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/multi-city" element={<MultiCityPage />} />

              {/* Public, unauthenticated read-only view. */}
              <Route path="/share/:token" element={<SharedTripPage />} />

              <Route
                path="/trips"
                element={
                  <RequireAuth>
                    <MyTripsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/trips/:id"
                element={
                  <RequireAuth>
                    <TripDetailPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth>
                    <SettingsPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/login"
                element={
                  <GuestOnly>
                    <LoginPage />
                  </GuestOnly>
                }
              />
              <Route
                path="/register"
                element={
                  <GuestOnly>
                    <RegisterPage />
                  </GuestOnly>
                }
              />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      <Toaster />
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <span
        role="status"
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
      >
        <SpinnerIcon className="size-5" />
        Loading…
      </span>
    </div>
  );
}

/**
 * Auth gate.
 *
 * Waits for the initial token verification before deciding — without that,
 * a signed-in user refreshing `/trips` would be bounced to the login page for a
 * frame. The attempted path is remembered so sign-in can return them to it.
 */
function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <RouteFallback />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

/** Keeps a signed-in user off the login and register pages. */
function GuestOnly({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <RouteFallback />;
  if (isAuthenticated) return <Navigate to="/trips" replace />;
  return children;
}
