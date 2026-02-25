import type { ApiResponse, ApiError } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Singleton promise that prevents concurrent refresh attempts.
 */
let refreshPromise: Promise<void> | null = null;

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { signal?: AbortSignal } = {},
    _isRetry = false,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        // Basic CSRF protection — ensures the request originates from JS, not a plain form submission
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for HttpOnly tokens
      signal: options.signal,
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401 && !_isRetry) {
        await this.handleTokenRefresh();
        return this.request<T>(endpoint, options, true);
      }

      if (response.status === 401 && _isRetry) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        const errorData = (await response.json()) as ApiError;
        throw new Error(errorData.error?.message || 'An error occurred');
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

  /**
   * Coalesce concurrent refresh calls into a single network request.
   * NOTE: The customer app uses HttpOnly session cookies — this handler
   * exists to transparently renew an expired access cookie via the
   * refresh endpoint. If the backend doesn't issue customer refresh
   * tokens this call will fail gracefully and surface "Session expired".
   */
  private async handleTokenRefresh(): Promise<void> {
    if (!refreshPromise) {
      refreshPromise = fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
        .then((res) => {
          if (!res.ok) throw new Error('Refresh failed');
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  async get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', signal });
  }

  async post<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      signal,
    });
  }

  async put<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      signal,
    });
  }

  async patch<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      signal,
    });
  }

  async delete<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', signal });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
