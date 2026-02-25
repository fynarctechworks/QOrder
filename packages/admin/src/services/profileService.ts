import { apiClient } from './apiClient';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  name: string;
  role: string;
  restaurantId: string;
  createdAt: string;
}

export const profileService = {
  /** Get current user profile */
  async getProfile(): Promise<UserProfile> {
    return apiClient.get<UserProfile>('/profile');
  },

  /** Send OTP for profile changes */
  async sendOTP(): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/profile/send-otp', {});
  },

  /** Update username (requires OTP) */
  async updateUsername(username: string, otp: string): Promise<UserProfile> {
    return apiClient.patch<UserProfile>('/profile/username', { username, otp });
  },

  /** Update email (requires OTP) */
  async updateEmail(email: string, otp: string): Promise<UserProfile> {
    return apiClient.patch<UserProfile>('/profile/email', { email, otp });
  },

  /** Change password (requires OTP) */
  async changePassword(currentPassword: string, newPassword: string, otp: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/profile/change-password', {
      currentPassword,
      newPassword,
      otp,
    });
  },
};
