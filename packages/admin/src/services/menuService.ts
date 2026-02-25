import { apiClient } from './apiClient';
import type { Category, MenuItem } from '../types';

export const menuService = {
  // Categories
  async getCategories(): Promise<Category[]> {
    return apiClient.get<Category[]>('/menu/categories');
  },

  async createCategory(data: Partial<Category>): Promise<Category> {
    return apiClient.post<Category>('/menu/categories', data);
  },

  async updateCategory(id: string, data: Partial<Category>): Promise<Category> {
    return apiClient.patch<Category>(`/menu/categories/${id}`, data);
  },

  async deleteCategory(id: string): Promise<void> {
    return apiClient.delete(`/menu/categories/${id}`);
  },

  async reorderCategories(categoryIds: string[]): Promise<void> {
    return apiClient.post('/menu/categories/reorder', { categoryIds });
  },

  // Menu Items
  async getItems(): Promise<MenuItem[]> {
    return apiClient.get<MenuItem[]>('/menu/items');
  },

  async getItemById(id: string): Promise<MenuItem> {
    return apiClient.get<MenuItem>(`/menu/items/${id}`);
  },

  async createItem(data: Partial<MenuItem>): Promise<MenuItem> {
    return apiClient.post<MenuItem>('/menu/items', data);
  },

  async updateItem(id: string, data: Partial<MenuItem>): Promise<MenuItem> {
    return apiClient.patch<MenuItem>(`/menu/items/${id}`, data);
  },

  async deleteItem(id: string): Promise<void> {
    return apiClient.delete(`/menu/items/${id}`);
  },

  async toggleAvailability(id: string, isAvailable: boolean): Promise<MenuItem> {
    return apiClient.patch<MenuItem>('/menu/items/availability', {
      itemIds: [id],
      isAvailable,
    });
  },

  // Image Upload
  async uploadImage(file: File): Promise<{ imageUrl: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.upload<{ imageUrl: string }>('/upload/image', formData);
  },
};
