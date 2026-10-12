import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, TOKEN_KEY } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api.me()
      .then(({ user }) => setUser(user))
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const handleAuth = ({ token, user }) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(user);
  };

  const login = async (creds) => handleAuth(await api.login(creds));
  const register = async (data) => handleAuth(await api.register(data));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
