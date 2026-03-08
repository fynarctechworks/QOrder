import { apiClient } from './apiClient';
import { cacheMenu, getCachedMenu } from '../utils/offlineDb';
import i18n from '../i18n';
import type { Restaurant, Table, Category, MenuItem } from '../types';

/** Build query string with optional branchId and current language */
function buildParams(branchId?: string | null): string {
  const lang = i18n.language || 'en';
  const parts: string[] = [];
  if (branchId) parts.push(`branchId=${branchId}`);
  if (lang && lang !== 'en') parts.push(`lang=${lang}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

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

  async getCategories(restaurantId: string, branchId?: string | null): Promise<Category[]> {
    const params = buildParams(branchId);
    return apiClient.get<Category[]>(`/restaurants/${restaurantId}/categories${params}`);
  },

  async getMenuItems(restaurantId: string, branchId?: string | null): Promise<MenuItem[]> {
    const params = buildParams(branchId);
    const lang = i18n.language || 'en';
    const cacheKey = `menu:${restaurantId}:${branchId || 'all'}:${lang}`;
    try {
      const items = await apiClient.get<MenuItem[]>(`/restaurants/${restaurantId}/menu${params}`);
      // Cache for offline use
      cacheMenu(cacheKey, items).catch(() => {});
      return items;
    } catch (err) {
      // If offline, try cached data
      if (!navigator.onLine) {
        const cached = await getCachedMenu(cacheKey);
        if (cached) return cached.data as MenuItem[];
      }
      throw err;
    }
  },

  async getMenuItemsByCategory(
    restaurantId: string,
    categoryId: string
  ): Promise<MenuItem[]> {
    const lang = i18n.language || 'en';
    const langParam = lang !== 'en' ? `?lang=${lang}` : '';
    return apiClient.get<MenuItem[]>(
      `/restaurants/${restaurantId}/categories/${categoryId}/items${langParam}`
    );
  },

  async getMenuItem(restaurantId: string, itemId: string): Promise<MenuItem> {
    const lang = i18n.language || 'en';
    const langParam = lang !== 'en' ? `?lang=${lang}` : '';
    return apiClient.get<MenuItem>(`/restaurants/${restaurantId}/menu/${itemId}${langParam}`);
  },
};
