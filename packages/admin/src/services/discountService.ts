import { apiClient } from './apiClient';

export interface Discount {
  id: string;
  restaurantId: string;
  name: string;
  type: 'PERCENTAGE' | 'FLAT';
  value: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  isAutoApply: boolean;
  activeFrom: string | null;
  activeTo: string | null;
  activeDays: number[];
  activeTimeFrom: string | null;
  activeTimeTo: string | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  coupons?: Coupon[];
  _count?: { orderDiscounts: number };
}

export interface Coupon {
  id: string;
  restaurantId: string;
  code: string;
  discountId: string;
  maxUses: number | null;
  maxUsesPerCustomer: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  discount?: Discount;
  _count?: { orderDiscounts: number };
}

export interface CreateDiscountInput {
  name: string;
  type: 'PERCENTAGE' | 'FLAT';
  value: number;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
  isAutoApply?: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
  activeDays?: number[];
  activeTimeFrom?: string | null;
  activeTimeTo?: string | null;
  maxUses?: number | null;
  isActive?: boolean;
}

export interface CreateCouponInput {
  code: string;
  discountId: string;
  maxUses?: number | null;
  maxUsesPerCustomer?: number;
  expiresAt?: string | null;
  isActive?: boolean;
}

export const discountService = {
  // Discounts
  async list(): Promise<Discount[]> {
    return apiClient.get<Discount[]>('/discounts');
  },
  async create(data: CreateDiscountInput): Promise<Discount> {
    return apiClient.post<Discount>('/discounts', data);
  },
  async update(id: string, data: Partial<CreateDiscountInput>): Promise<Discount> {
    return apiClient.put<Discount>(`/discounts/${id}`, data);
  },
  async remove(id: string): Promise<void> {
    return apiClient.delete(`/discounts/${id}`);
  },

  // Coupons
  async listCoupons(): Promise<Coupon[]> {
    return apiClient.get<Coupon[]>('/discounts/coupons');
  },
  async createCoupon(data: CreateCouponInput): Promise<Coupon> {
    return apiClient.post<Coupon>('/discounts/coupons', data);
  },
  async updateCoupon(id: string, data: Partial<CreateCouponInput>): Promise<Coupon> {
    return apiClient.put<Coupon>(`/discounts/coupons/${id}`, data);
  },
  async removeCoupon(id: string): Promise<void> {
    return apiClient.delete(`/discounts/coupons/${id}`);
  },
};
