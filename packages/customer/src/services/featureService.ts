import { apiClient } from './apiClient';

export const featureService = {
  // Validate coupon code
  async validateCoupon(restaurantId: string, code: string, subtotal: number, customerPhone?: string) {
    return apiClient.post<{
      valid: boolean;
      discount?: { discountId: string; couponId?: string; discountAmount: number; discountName: string };
      error?: string;
    }>(`/public/${restaurantId}/discounts/validate-coupon`, { code, subtotal, customerPhone });
  },

  // Get auto-apply discount
  async getAutoApply(restaurantId: string, subtotal: number) {
    return apiClient.get<{
      discountId: string; discountAmount: number; discountName: string;
    } | null>(`/public/${restaurantId}/discounts/auto-apply?subtotal=${subtotal}`);
  },

  // Service requests
  async createServiceRequest(restaurantId: string, tableId: string, type: string, message?: string) {
    return apiClient.post(`/public/${restaurantId}/service-requests`, { tableId, type, message });
  },

  // Feedback
  async submitFeedback(restaurantId: string, data: {
    overallRating: number;
    foodRating?: number;
    serviceRating?: number;
    ambienceRating?: number;
    comment?: string;
    customerPhone?: string;
    orderId?: string;
    sessionId?: string;
  }) {
    return apiClient.post(`/public/${restaurantId}/feedback`, data);
  },

  // Receipt / e-bill
  async requestReceipt(orderId: string, type: 'EMAIL' | 'WHATSAPP' | 'SMS', recipient: string) {
    return apiClient.post(`/public/orders/${orderId}/receipt`, { type, recipient });
  },

  // Queue display
  async getQueue(restaurantId: string) {
    return apiClient.get<{
      restaurant: { name: string; logo: string | null };
      orders: Array<{
        id: string;
        orderNumber: string;
        status: string;
        customerName: string | null;
        createdAt: string;
        updatedAt: string;
        estimatedTime: number | null;
      }>;
    }>(`/public/${restaurantId}/queue`);
  },
};
