import { apiClient } from './apiClient';

interface RestaurantInfo {
  id: string;
  name: string;
  slug: string;
  currency: string;
  taxRate: number;
  settings: Record<string, unknown> | null;
}

interface SettingsPayload {
  /** Top-level restaurant fields */
  name?: string;
  currency?: string;
  taxRate?: number;
  /** Nested settings (merged server-side) */
  settings: {
    acceptsOrders?: boolean;
    minimumOrderAmount?: number;
    estimatedPrepTime?: number;
    /** Required when acceptsOrders is set to false */
    password?: string;
  };
}

export const settingsService = {
  async get(): Promise<RestaurantInfo> {
    return apiClient.get<RestaurantInfo>('/restaurant');
  },

  async update(payload: SettingsPayload): Promise<RestaurantInfo> {
    // Top-level fields (name, currency, taxRate)
    const { settings, ...topLevel } = payload;
    const hasTopLevel = Object.keys(topLevel).length > 0;
    const hasSettings = Object.keys(settings).length > 0;

    // Fire both in parallel when needed
    const [result] = await Promise.all([
      hasTopLevel ? apiClient.patch<RestaurantInfo>('/restaurant', topLevel) : Promise.resolve(null),
      hasSettings ? apiClient.patch<RestaurantInfo>('/restaurant/settings', settings) : Promise.resolve(null),
    ]);

    // Re-fetch to get merged result
    if (!result) return this.get();
    return result;
  },
};
