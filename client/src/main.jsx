import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App.jsx';
import { PreferencesProvider } from './context/PreferencesContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { TrailMateError } from './api/client.js';
import './index.css';

/**
 * Query client configuration.
 *
 * The server already caches aggressively and retries transient upstream
 * failures, so the client is tuned to *not* duplicate that work:
 *
 *  - `staleTime` of five minutes stops React Query re-fetching data the server
 *    would only serve from its own cache anyway.
 *  - retries are limited to one, and skipped entirely for 4xx: a 400 or 404 will
 *    never succeed on a second attempt, and retrying a 429 makes it worse.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof TrailMateError) {
          if (error.status >= 400 && error.status < 500) return false;
          return failureCount < 1 && error.retryable;
        }
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Preferences sit outermost: AuthProvider merges account settings into them. */}
      <PreferencesProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  </StrictMode>
);
