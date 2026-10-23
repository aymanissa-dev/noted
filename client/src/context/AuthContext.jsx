import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearLocalData, endSession, ensureOwner, isNetworkError, setUnauthorizedHandler, TOKEN_KEY, USER_KEY } from '../lib/api.js';

import { applyAccent } from '../lib/accent.js';

const AuthContext = createContext(null);
export const FLASH_KEY = 'noted.flash';

// Reads and clears the one-time login-page message.
export function takeFlash() {
  const msg = sessionStorage.getItem(FLASH_KEY);
  if (msg) sessionStorage.removeItem(FLASH_KEY);
  return msg;
}

export function AuthProvider({ children }) {
  // Render right away from the cached profile (the token is checked in the background; a 401 logs out).
  // Only a first visit without a cached profile waits for /auth/me.
  const cachedUser = () => { try { return localStorage.getItem(TOKEN_KEY) ? JSON.parse(localStorage.getItem(USER_KEY)) : null; } catch { return null; } };
  const [user, setUser] = useState(cachedUser);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)) && !cachedUser());

  // `flash` is shown once on the login page (e.g. after deleting the account).
  // Intentional logouts land on a clean /login (no "return to" page). Only an expired session remembers where you were.
  const [returnable, setReturnable] = useState(false);
  const logout = useCallback(({ flash, expired = false, revoke = !expired } = {}) => {
    if (flash) sessionStorage.setItem(FLASH_KEY, flash);
    // End the session on the server too (best effort; retried when back online). An expired or
    // deleted session has nothing left to end.
    if (revoke) endSession(localStorage.getItem(TOKEN_KEY));
    setReturnable(expired === true);
    if (expired) sessionStorage.removeItem('noted.loggedOut'); else sessionStorage.setItem('noted.loggedOut', '1');
    localStorage.removeItem(TOKEN_KEY);
    clearLocalData();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout({ expired: true, flash: 'Your session expired. Please log in again.' }));
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api.me()
      .then(({ user }) => { localStorage.setItem(USER_KEY, JSON.stringify(user)); ensureOwner(user.id); setUser(user); })
      .catch((err) => {
        // Offline: keep the session using the cached profile. Otherwise the token is bad.
        const cached = localStorage.getItem(USER_KEY);
        if (isNetworkError(err) && cached) setUser(JSON.parse(cached));
        else logout({ expired: true });
      })
      .finally(() => setLoading(false));
  }, [logout]);

  // Another tab signed out or switched accounts: this tab must not keep showing (or syncing) the
  // previous account's data, so it starts over from the new state.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== TOKEN_KEY && e.key !== USER_KEY && e.key !== null) return;
      const token = localStorage.getItem(TOKEN_KEY);
      let id = null; try { id = JSON.parse(localStorage.getItem(USER_KEY))?.id || null; } catch { /* ignore */ }
      if (!user) { if (token && id) window.location.reload(); return; }
      if (!token || (id && id !== user.id)) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  const handleAuth = ({ token, user }) => {
    clearLocalData(); // never mix another account's cached notes
    sessionStorage.removeItem('noted.loggedOut');
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    ensureOwner(user.id);
    setUser(user);
  };

  // The account's accent wins over the device fallback once the profile loads.
  const accent = user?.preferences?.accent;
  useEffect(() => { if (accent) applyAccent(accent); }, [accent]);

  const updateUser = (u) => { localStorage.setItem(USER_KEY, JSON.stringify(u)); setUser(u); };
  const login = async (creds) => handleAuth(await api.login(creds));
  const register = async (data) => handleAuth(await api.register(data));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, returnable }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
