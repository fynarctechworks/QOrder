import { apiClient } from './apiClient';

export interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  maxBranches: number;
  maxStaff: number;
  maxTables: number;
  sortOrder: number;
}

export interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  billingCycle: 'MONTHLY' | 'YEARLY';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  amount: number;
  plan: Plan;
}

export interface PaymentOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
}

export const subscriptionService = {
  async getPlans(): Promise<Plan[]> {
    return apiClient.get<Plan[]>('/subscriptions/plans');
  },

  async getCurrentSubscription(): Promise<Subscription | null> {
    return apiClient.get<Subscription | null>('/subscriptions/current');
  },

  async createPaymentOrder(planId: string, billingCycle: 'MONTHLY' | 'YEARLY'): Promise<PaymentOrder> {
    return apiClient.post<PaymentOrder>('/subscriptions/create-order', { planId, billingCycle });
  },

  async verifyPayment(data: {
    planId: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<Subscription> {
    return apiClient.post<Subscription>('/subscriptions/verify-payment', data);
  },

  async startTrial(): Promise<Subscription> {
    return apiClient.post<Subscription>('/subscriptions/start-trial');
  },
};
