import { apiClient } from './apiClient';
import { useAuthStore } from '../state/authStore';
import type { User } from '../types';

interface LoginResponse {
  user: User;
  accessToken?: string;
}

interface RegisterResponse {
  message: string;
  email: string;
  requiresVerification: boolean;
}

interface VerifyEmailResponse {
  user: User;
  restaurant: { id: string; name: string; slug: string };
  accessToken?: string;
}

export const authService = {
  async login(identifier: string, password: string): Promise<LoginResponse> {
    const result = await apiClient.post<LoginResponse>('/auth/login', { identifier, password });
    // Store access token for Bearer auth & socket handshake
    if (result.accessToken) {
      useAuthStore.getState().setAccessToken(result.accessToken);
    }
    return result;
  },

  async register(data: {
    name: string;
    username: string;
    email: string;
    password: string;
    restaurantName: string;
  }): Promise<RegisterResponse> {
    return apiClient.post<RegisterResponse>('/auth/register', data);
  },

  async verifyEmail(email: string, code: string): Promise<VerifyEmailResponse> {
    const result = await apiClient.post<VerifyEmailResponse>('/auth/verify-email', { email, code });
    if (result.accessToken) {
      useAuthStore.getState().setAccessToken(result.accessToken);
    }
    return result;
  },

  async resendVerification(email: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/resend-verification', { email });
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async getCurrentUser(): Promise<User> {
    return await apiClient.get<User>('/auth/me');
  },

  async refreshToken(): Promise<void> {
    // Delegate to apiClient's singleton refresh to avoid concurrent refresh races
    await apiClient.refreshAccessToken();
  },
};
