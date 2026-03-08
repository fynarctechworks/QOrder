import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../state/authStore';
import { authService } from '../services/authService';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const {
    user,
    login: setUser,
    logout: clearUser,
  } = useAuthStore();

  // Derive auth state from user presence — survives page refresh
  const isAuthenticated = user !== null;

  // Proactively refresh access token on boot so socket + API work immediately,
  // and again every time the tab regains focus.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const tryRefresh = () => {
      authService.refreshToken().catch(() => {
        // Refresh cookie expired — force re-login
        if (!cancelled) clearUser();
      });
    };

    // Refresh once on mount
    tryRefresh();

    // Refresh when tab becomes visible (covers returning from another tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tryRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated]);

  // Check auth status on mount
  const { isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authService.getCurrentUser,
    enabled: !!user && !user.email,
    retry: false,
    staleTime: Infinity,
  });

  const login = async (identifier: string, password: string) => {
    queryClient.clear();
    const response = await authService.login(identifier, password);
    setUser(response.user);
  };

  const logout = async () => {
    await authService.logout();
    clearUser();
    queryClient.clear();
  };

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
