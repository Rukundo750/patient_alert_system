import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiService, setAuthToken } from '../services/api';

type User = { id: number; username: string; role: 'doctor' | 'nurse'; is_admin?: boolean } | null;

type AuthContextType = {
  user: User;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (data: { employe_id: string; username: string; email: string; password: string; role?: 'doctor' | 'nurse' }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    const init = async () => {
      if (token) {
        try {
          setAuthToken(token);
          // validate token with backend to avoid stale sessions
          const me = await apiService.getMe();
          // keep only minimal user info consumed by the app
          const minimal = { id: me.id, username: me.username, role: me.role, is_admin: !!(me as any).is_admin } as any;
          localStorage.setItem('user', JSON.stringify(minimal));
          setUser(minimal);
        } catch {
          setAuthToken(null);
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await apiService.login({ usernameOrEmail, password });
    setAuthToken(res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const register = async (data: { employe_id: string; username: string; email: string; password: string; role?: 'doctor' | 'nurse' }) => {
    const res = await apiService.register({ ...data });
    setAuthToken(res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const logout = () => {
    setAuthToken(null);
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
