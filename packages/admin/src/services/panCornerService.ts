import { apiClient } from './apiClient';
import type { PanCornerCategory, PanCornerItem } from '../types';

export interface PanCornerCategoryData {
  name: string;
  description?: string;
  image?: string;
  isActive: boolean;
  sortOrder?: number;
  translations?: Record<string, Record<string, string>>;
}

export interface PanCornerItemData {
  panCornerCategoryId: string;
  name: string;
  description?: string;
  price: number;
  discountPrice?: number | null;
  image?: string;
  isAvailable?: boolean;
  isAgeRestricted?: boolean;
  taxRate?: number | null;
  sortOrder?: number;
  translations?: Record<string, Record<string, string>>;
}

export const panCornerService = {
  // Categories
  async getCategories(): Promise<PanCornerCategory[]> {
    return apiClient.get<PanCornerCategory[]>('/pan-corner/categories');
  },

  async createCategory(data: PanCornerCategoryData): Promise<PanCornerCategory> {
    return apiClient.post<PanCornerCategory>('/pan-corner/categories', data);
  },

  async updateCategory(id: string, data: Partial<PanCornerCategoryData>): Promise<PanCornerCategory> {
    return apiClient.patch<PanCornerCategory>(`/pan-corner/categories/${id}`, data);
  },

  async deleteCategory(id: string): Promise<void> {
    return apiClient.delete(`/pan-corner/categories/${id}`);
  },

  // Items
  async getItems(categoryId?: string): Promise<PanCornerItem[]> {
    const query = categoryId ? `?categoryId=${categoryId}` : '';
    return apiClient.get<PanCornerItem[]>(`/pan-corner/items${query}`);
  },

  async createItem(data: PanCornerItemData): Promise<PanCornerItem> {
    return apiClient.post<PanCornerItem>('/pan-corner/items', data);
  },

  async updateItem(id: string, data: Partial<PanCornerItemData>): Promise<PanCornerItem> {
    return apiClient.patch<PanCornerItem>(`/pan-corner/items/${id}`, data);
  },

  async deleteItem(id: string): Promise<void> {
    return apiClient.delete(`/pan-corner/items/${id}`);
  },

  async toggleAvailability(id: string, isAvailable: boolean): Promise<PanCornerItem> {
    return apiClient.patch<PanCornerItem>(`/pan-corner/items/${id}/availability`, { isAvailable });
  },

  async checkout(input: {
    items: { panCornerItemId: string; quantity: number }[];
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    manualDiscount?: number;
    manualDiscountType?: 'PERCENTAGE' | 'FLAT';
  }): Promise<{ id: string; orderNumber: string; total: number; tokenNumber: number }> {
    return apiClient.post('/pan-corner/checkout', input);
  },

  async uploadImage(file: File): Promise<{ imageUrl: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.upload<{ imageUrl: string }>('/upload/image', formData);
  },
};
