import type { ApiResponse, ApiError } from '../types';
import { useAuthStore } from '../state/authStore';
import { useBranchStore } from '../state/branchStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Singleton promise that prevents concurrent refresh attempts.
 * While a refresh is in-flight every 401 caller awaits the same promise.
 */
let refreshPromise: Promise<void> | null = null;

class ApiClient {
  private _baseUrl: string;

  constructor(baseUrl: string) {
    this._baseUrl = baseUrl;
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  /**
   * Like request(), but returns the full response body without unwrapping `.data`.
   * Useful for endpoints that return top-level `meta`/`pagination` alongside `data`.
   */
  private async requestRaw<T>(
    endpoint: string,
    options: RequestInit = {},
    _isRetry = false,
  ): Promise<T> {
    const url = `${this._baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string>),
    };

    const token = useAuthStore.getState().accessToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Inject active branch context
    const branchId = useBranchStore.getState().activeBranchId;
    if (branchId) {
      headers['X-Branch-Id'] = branchId;
    }

    const config: RequestInit = { ...options, headers, credentials: 'include' };

    try {
      const response = await fetch(url, config);

      if (response.status === 401 && !_isRetry) {
        try {
          await this.refreshAccessToken();
          return this.requestRaw<T>(endpoint, options, true);
        } catch {
          this.forceLogout();
          throw new Error('Session expired');
        }
      }

      if (response.status === 401 && _isRetry) {
        this.forceLogout();
        throw new Error('Session expired');
      }

      if (!response.ok) {
        const errorData = (await response.json()) as ApiError;
        let msg = errorData.error?.message || 'An error occurred';
        // Append validation field details if present
        const details = (errorData.error as any)?.details;
        if (Array.isArray(details) && details.length) {
          msg += ': ' + details.map((d: { path: string; message: string }) => `${d.path} – ${d.message}`).join(', ');
        }
        throw new Error(msg);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error('Network error');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    _isRetry = false,
  ): Promise<T> {
    const url = `${this._baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      // Don't set Content-Type for FormData — browser sets multipart boundary automatically
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string>),
    };

    // Attach access token as Bearer header when available
    const token = useAuthStore.getState().accessToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Inject active branch context
    const branchId = useBranchStore.getState().activeBranchId;
    if (branchId) {
      headers['X-Branch-Id'] = branchId;
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401 && !_isRetry) {
        // Attempt a single token refresh, then retry the original request
        try {
          await this.refreshAccessToken();
          return this.request<T>(endpoint, options, true);
        } catch {
          // Refresh failed — clear auth & redirect silently
          this.forceLogout();
          throw new Error('Session expired');
        }
      }

      if (response.status === 401 && _isRetry) {
        // Refresh already failed — clear auth & redirect
        this.forceLogout();
        throw new Error('Session expired');
      }

      if (!response.ok) {
        const errorData = (await response.json()) as ApiError;
        let msg = errorData.error?.message || 'An error occurred';
        const details = (errorData.error as any)?.details;
        if (Array.isArray(details) && details.length) {
          msg += ': ' + details.map((d: { path: string; message: string }) => `${d.path} – ${d.message}`).join(', ');
        }
        throw new Error(msg);
      }

      const data = (await response.json()) as ApiResponse<T>;
      return data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error');
    }
  }

  /** Coalesce concurrent refresh calls into a single network request. */
  async refreshAccessToken(): Promise<void> {
    if (!refreshPromise) {
      refreshPromise = fetch(`${this._baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Refresh failed');
          const data = (await res.json()) as ApiResponse<{ accessToken: string }>;
          if (data.data?.accessToken) {
            useAuthStore.getState().setAccessToken(data.data.accessToken);
          }
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  private forceLogout(): void {
    // Clear persisted Zustand auth store
    try { localStorage.removeItem('auth-storage'); } catch { /* noop */ }
    window.location.href = '/login';
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /** Returns the full JSON body (including meta/pagination) without unwrapping `.data`. */
  async getRaw<T>(endpoint: string): Promise<T> {
    return this.requestRaw<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
