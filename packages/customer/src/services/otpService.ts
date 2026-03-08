import { apiClient } from './apiClient';

interface PhoneStatusResponse {
  requirePhoneVerification: boolean;
  otpEnabled?: boolean;
  hasPhone: boolean;
  phoneVerified: boolean;
  phone?: string;
}

interface SendOtpResponse {
  otpRequired: boolean;
  sent?: boolean;
  phoneSaved?: boolean;
}

interface VerifyOtpResponse {
  verified: boolean;
}

export const otpService = {
  /** Check if phone verification is required and current session status */
  async getPhoneStatus(restaurantId: string, tableId: string): Promise<PhoneStatusResponse> {
    return apiClient.get<PhoneStatusResponse>(
      `/restaurants/${restaurantId}/tables/${tableId}/phone-status`
    );
  },

  /**
   * Send OTP or save phone (depending on requirePhoneVerification setting).
   * If OTP is OFF: validates format and saves to session.
   * If OTP is ON: sends SMS via Twilio.
   */
  async sendOtp(phone: string, restaurantId: string, tableId: string): Promise<SendOtpResponse> {
    return apiClient.post<SendOtpResponse>('/restaurants/otp/send', {
      phone,
      restaurantId,
      tableId,
    });
  },

  /** Verify the OTP code */
  async verifyOtp(phone: string, code: string, restaurantId: string, tableId: string): Promise<VerifyOtpResponse> {
    return apiClient.post<VerifyOtpResponse>('/restaurants/otp/verify', {
      phone,
      code,
      restaurantId,
      tableId,
    });
  },
};
