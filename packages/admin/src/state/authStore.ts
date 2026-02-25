import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  login: (user: User, accessToken?: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setAccessToken: (token: string) => void;
}

/**
 * Derive authentication state from user presence instead of storing it.
 * Usage: `const isAuthenticated = useAuthStore((s) => s.user !== null)`
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,

      login: (user, accessToken) => {
        set({ user, ...(accessToken ? { accessToken } : {}) });
      },

      logout: () => {
        set({ user: null, accessToken: null });
      },

      updateUser: (updates) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        }));
      },

      setAccessToken: (token) => {
        // Guard: only set token if a user is still logged in (prevents race with logout)
        set((state) => (state.user ? { accessToken: token } : {}));
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        // accessToken is intentionally excluded from persistence to reduce XSS exposure.
        // It lives in-memory only; on page reload the refresh token (HttpOnly cookie)
        // re-issues a fresh access token via AuthContext.
      }),
    }
  )
);
