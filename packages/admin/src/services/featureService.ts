import { apiClient } from './apiClient';

export interface ServiceRequest {
  id: string;
  restaurantId: string;
  tableId: string;
  type: 'CALL_WAITER' | 'WATER_REFILL' | 'BILL_REQUEST' | 'CUSTOM';
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string | null;
  resolvedAt: string | null;
  createdAt: string;
  table?: { id: string; number: string; name: string | null; section?: { name: string } };
}

export interface FeedbackItem {
  id: string;
  restaurantId: string;
  orderId: string | null;
  overallRating: number;
  foodRating: number | null;
  serviceRating: number | null;
  ambienceRating: number | null;
  comment: string | null;
  customerPhone: string | null;
  createdAt: string;
  order?: { id: string; orderNumber: string; total: number; customerName: string | null };
}

export interface FeedbackStats {
  averages: { overall: number | null; food: number | null; service: number | null; ambience: number | null };
  totalReviews: number;
  distribution: { rating: number; count: number }[];
}

export const featureService = {
  // Service requests
  async listPendingRequests(): Promise<ServiceRequest[]> {
    return apiClient.get<ServiceRequest[]>('/features/service-requests');
  },
  async acknowledgeRequest(id: string): Promise<ServiceRequest> {
    return apiClient.patch<ServiceRequest>(`/features/service-requests/${id}/acknowledge`);
  },
  async resolveRequest(id: string): Promise<ServiceRequest> {
    return apiClient.patch<ServiceRequest>(`/features/service-requests/${id}/resolve`);
  },

  // Feedback
  async listFeedback(params?: Record<string, string>): Promise<{ data: FeedbackItem[]; meta: { page: number; total: number; totalPages: number } }> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiClient.get(`/features/feedback${query}`);
  },
  async getFeedbackStats(): Promise<FeedbackStats> {
    return apiClient.get<FeedbackStats>('/features/feedback/stats');
  },

  // Receipts
  async sendReceipt(orderId: string, type: 'EMAIL' | 'WHATSAPP' | 'SMS', recipient: string) {
    return apiClient.post(`/features/receipts/${orderId}/send`, { type, recipient });
  },

  // Payment refunds
  async refundPayment(paymentId: string, amount?: number, reason?: string) {
    return apiClient.post<{ id: string; amount: number; status: string }>(`/payments/${paymentId}/refund`, { amount, reason });
  },
};
