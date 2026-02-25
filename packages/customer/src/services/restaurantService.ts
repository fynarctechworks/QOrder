import { apiClient } from './apiClient';
import type { Restaurant, Table, Category, MenuItem } from '../types';

export const restaurantService = {
  async getBySlug(slug: string): Promise<Restaurant> {
    return apiClient.get<Restaurant>(`/restaurants/slug/${slug}`);
  },

  async getById(id: string): Promise<Restaurant> {
    return apiClient.get<Restaurant>(`/restaurants/${id}`);
  },

  async getTable(restaurantId: string, tableId: string): Promise<Table> {
    return apiClient.get<Table>(`/restaurants/${restaurantId}/tables/${tableId}`);
  },

  async getCategories(restaurantId: string): Promise<Category[]> {
    return apiClient.get<Category[]>(`/restaurants/${restaurantId}/categories`);
  },

  async getMenuItems(restaurantId: string): Promise<MenuItem[]> {
    return apiClient.get<MenuItem[]>(`/restaurants/${restaurantId}/menu`);
  },

  async getMenuItemsByCategory(
    restaurantId: string,
    categoryId: string
  ): Promise<MenuItem[]> {
    return apiClient.get<MenuItem[]>(
      `/restaurants/${restaurantId}/categories/${categoryId}/items`
    );
  },

  async getMenuItem(restaurantId: string, itemId: string): Promise<MenuItem> {
    return apiClient.get<MenuItem>(`/restaurants/${restaurantId}/menu/${itemId}`);
  },
};
