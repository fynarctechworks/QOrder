import { apiClient } from './apiClient';

export interface TwoFactorSetupResponse {
  secret: string;
  otpAuthUrl: string;
}

export interface TwoFactorEnableResponse {
  backupCodes: string[];
}

export const twoFactorService = {
  async getStatus(): Promise<{ enabled: boolean }> {
    return apiClient.get<{ enabled: boolean }>('/auth/2fa/status');
  },

  async setup(): Promise<TwoFactorSetupResponse> {
    return apiClient.post<TwoFactorSetupResponse>('/auth/2fa/setup');
  },

  async enable(code: string): Promise<TwoFactorEnableResponse> {
    return apiClient.post<TwoFactorEnableResponse>('/auth/2fa/enable', { code });
  },

  async disable(password: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/2fa/disable', { password });
  },

  async verifyLogin(userId: string, code: string) {
    return apiClient.postPublic<{
      user: unknown;
      restaurant: unknown;
      accessToken: string;
    }>('/auth/2fa/verify-login', { userId, code });
  },
};
