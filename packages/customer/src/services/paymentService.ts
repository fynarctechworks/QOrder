import { apiClient } from './apiClient';

export interface PaymentConfig {
  enabled: boolean;
  provider?: string;
  keyId?: string;
  paymentMode?: 'pay_before' | 'pay_after';
  currency?: string;
  restaurantName?: string;
}

export interface GatewayOrder {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  provider: string;
}

export const paymentService = {
  async getConfig(restaurantId: string): Promise<PaymentConfig> {
    return apiClient.get<PaymentConfig>(`/public/${restaurantId}/payment/config`);
  },

  async createOrder(restaurantId: string, params: {
    orderId?: string;
    sessionId?: string;
    amount: number;
    currency: string;
  }): Promise<GatewayOrder> {
    return apiClient.post<GatewayOrder>(`/public/${restaurantId}/payment/create-order`, params);
  },

  async verifyPayment(restaurantId: string, params: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string;
    orderId?: string;
    sessionId: string;
    branchId?: string;
  }): Promise<{ paymentId: string; status: string }> {
    return apiClient.post(`/public/${restaurantId}/payment/verify`, params);
  },
};
