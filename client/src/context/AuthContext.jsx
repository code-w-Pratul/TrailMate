import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_EXPIRED_EVENT, tokenStore } from '../api/client.js';
import * as api from '../api/endpoints.js';
import { usePreferences } from './PreferencesContext.jsx';

/**
 * Authentication state.
 *
 * Notable behaviours:
 *  - On mount, a stored token is *verified* against `/auth/me` rather than
 *    trusted. A token that was revoked, expired, or belongs to a deleted
 *    account is discarded before the UI ever renders a signed-in state.
 *  - The API client dispatches `AUTH_EXPIRED_EVENT` when the server rejects a
 *    token mid-session, which signs the user out without any component needing
 *    to handle 401s itself.
 *  - Account preferences are merged into local display preferences on sign-in,
 *    so unit and theme choices follow the user across devices.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const queryClient = useQueryClient();
  const { update: updatePreferences, homeCurrency } = usePreferences();

  const adoptAccountPreferences = useCallback(
    (account) => {
      if (!account) return;
      const patch = {};
      if (account.preferences?.theme) patch.theme = account.preferences.theme;
      if (account.preferences?.temperatureUnit)
        patch.temperatureUnit = account.preferences.temperatureUnit;
      if (account.preferences?.distanceUnit) patch.distanceUnit = account.preferences.distanceUnit;
      if (account.homeCurrency) patch.homeCurrency = account.homeCurrency;
      if (Object.keys(patch).length) updatePreferences(patch);
    },
    [updatePreferences]
  );

  const signOut = useCallback(
    ({ keepCache = false } = {}) => {
      tokenStore.clear();
      setUser(null);
      setStatus('anonymous');
      // Trips and profile data belong to the previous user; drop them.
      if (!keepCache) queryClient.removeQueries({ queryKey: api.keys.trips.all });
      queryClient.removeQueries({ queryKey: api.keys.me });
    },
    [queryClient]
  );

  /* Verify any stored token once, on mount. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokenStore.get()) {
        setStatus('anonymous');
        return;
      }
      try {
        const data = await api.getMe();
        if (cancelled) return;
        setUser(data.user);
        adoptAccountPreferences(data.user);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        // Includes the "database is offline" case: better to present a signed-out
        // app that still plans trips than a broken signed-in one.
        tokenStore.clear();
        setUser(null);
        setStatus('anonymous');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adoptAccountPreferences]);

  /* React to a token the server rejected mid-session. */
  useEffect(() => {
    const handler = () => signOut();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [signOut]);

  const applySession = useCallback(
    ({ user: account, token }) => {
      tokenStore.set(token);
      setUser(account);
      adoptAccountPreferences(account);
      setStatus('authenticated');
      queryClient.invalidateQueries({ queryKey: api.keys.trips.all });
    },
    [adoptAccountPreferences, queryClient]
  );

  const signIn = useCallback(
    async (credentials) => applySession(await api.login(credentials)),
    [applySession]
  );

  const signUp = useCallback(
    async (details) =>
      applySession(
        await api.register({
          ...details,
          // Seed the new account with whatever the visitor already chose locally.
          homeCurrency: details.homeCurrency ?? homeCurrency,
        })
      ),
    [applySession, homeCurrency]
  );

  /** Push local display preferences up to the account. */
  const saveProfile = useCallback(
    async (patch) => {
      const data = await api.updateProfile(patch);
      setUser(data.user);
      adoptAccountPreferences(data.user);
      return data.user;
    },
    [adoptAccountPreferences]
  );

  const value = useMemo(
    () => ({
      user,
      status,
      isLoading: status === 'loading',
      isAuthenticated: status === 'authenticated',
      signIn,
      signUp,
      signOut,
      saveProfile,
    }),
    [user, status, signIn, signUp, signOut, saveProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export default AuthContext;
