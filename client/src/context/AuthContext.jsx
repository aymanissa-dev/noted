import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearLocalData, isNetworkError, setUnauthorizedHandler, TOKEN_KEY, USER_KEY } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    clearLocalData();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api.me()
      .then(({ user }) => { localStorage.setItem(USER_KEY, JSON.stringify(user)); setUser(user); })
      .catch((err) => {
        // Offline: keep the session using the cached profile. Otherwise the token is bad.
        const cached = localStorage.getItem(USER_KEY);
        if (isNetworkError(err) && cached) setUser(JSON.parse(cached));
        else logout();
      })
      .finally(() => setLoading(false));
  }, [logout]);

  const handleAuth = ({ token, user }) => {
    clearLocalData(); // never mix another account's cached notes
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUser(user);
  };

  const updateUser = (u) => { localStorage.setItem(USER_KEY, JSON.stringify(u)); setUser(u); };
  const login = async (creds) => handleAuth(await api.login(creds));
  const register = async (data) => handleAuth(await api.register(data));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
