import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearLocalData, isNetworkError, setUnauthorizedHandler, TOKEN_KEY, USER_KEY } from '../lib/api.js';

const AuthContext = createContext(null);
export const FLASH_KEY = 'noted.flash';

// Reads and clears the one-time login-page message.
export function takeFlash() {
  const msg = sessionStorage.getItem(FLASH_KEY);
  if (msg) sessionStorage.removeItem(FLASH_KEY);
  return msg;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  // `flash` is shown once on the login page (e.g. after deleting the account).
  // Intentional logouts land on a clean /login (no "return to" page). Only an expired session remembers where you were.
  const [returnable, setReturnable] = useState(false);
  const logout = useCallback(({ flash, expired = false } = {}) => {
    if (flash) sessionStorage.setItem(FLASH_KEY, flash);
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
      .then(({ user }) => { localStorage.setItem(USER_KEY, JSON.stringify(user)); setUser(user); })
      .catch((err) => {
        // Offline: keep the session using the cached profile. Otherwise the token is bad.
        const cached = localStorage.getItem(USER_KEY);
        if (isNetworkError(err) && cached) setUser(JSON.parse(cached));
        else logout({ expired: true });
      })
      .finally(() => setLoading(false));
  }, [logout]);

  const handleAuth = ({ token, user }) => {
    clearLocalData(); // never mix another account's cached notes
    sessionStorage.removeItem('noted.loggedOut');
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUser(user);
  };

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
