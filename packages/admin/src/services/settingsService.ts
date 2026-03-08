import { apiClient } from './apiClient';
import { useBranchStore } from '../state/branchStore';

interface RestaurantInfo {
  id: string;
  name: string;
  slug: string;
  currency: string;
  taxRate: number;
  settings: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  geoFenceRadius?: number;
}

interface BranchSettingsInfo {
  branchId: string;
  branchName: string;
  settings: Record<string, unknown>;
}

interface SettingsPayload {
  /** Top-level restaurant fields */
  name?: string;
  currency?: string;
  taxRate?: number;
  /** Geo-fence settings (top-level columns) */
  latitude?: number | null;
  longitude?: number | null;
  geoFenceRadius?: number;
  /** Nested settings (merged server-side) */
  settings: {
    acceptsOrders?: boolean;
    minimumOrderAmount?: number;
    estimatedPrepTime?: number;
    /** Required when acceptsOrders is set to false */
    password?: string;
    /** Printer settings */
    printerEnabled?: boolean;
    printerIp?: string;
    printerPort?: number;
    printerType?: 'epson' | 'star';
    printerWidth?: number;
    autoPrintOnComplete?: boolean;
    /** Auto-lock settings */
    autoLockEnabled?: boolean;
    autoLockTimeout?: number;
    lockPin?: string;
    /** Payment gateway settings */
    paymentGatewayEnabled?: boolean;
    paymentMode?: 'pay_before' | 'pay_after';
    razorpayKeyId?: string;
    razorpayKeySecret?: string;
  };
}

export const settingsService = {
  async get(): Promise<RestaurantInfo> {
    const branchId = useBranchStore.getState().activeBranchId;

    if (branchId) {
      // Get branch-level settings (merged with restaurant defaults)
      const branchData = await apiClient.get<BranchSettingsInfo>(`/branches/${branchId}/settings`);
      // Also get restaurant base info for name/slug/currency/taxRate
      const restaurant = await apiClient.get<RestaurantInfo>('/restaurant');
      return {
        ...restaurant,
        settings: branchData.settings,
      };
    }

    return apiClient.get<RestaurantInfo>('/restaurant');
  },

  async update(payload: SettingsPayload): Promise<RestaurantInfo> {
    const branchId = useBranchStore.getState().activeBranchId;
    const { settings, ...topLevel } = payload;
    const hasTopLevel = Object.keys(topLevel).length > 0;
    const hasSettings = Object.keys(settings).length > 0;

    if (branchId && hasSettings) {
      // Write settings to the branch level
      await apiClient.patch(`/branches/${branchId}/settings`, settings);
    } else if (hasSettings) {
      await apiClient.patch<RestaurantInfo>('/restaurant/settings', settings);
    }

    // Top-level restaurant fields (name, currency, taxRate) are always restaurant-level
    if (hasTopLevel) {
      await apiClient.patch<RestaurantInfo>('/restaurant', topLevel);
    }

    // Re-fetch merged result
    return this.get();
  },

  async testPrinter(config?: {
    printerIp?: string;
    printerPort?: number;
    printerType?: string;
    printerWidth?: number;
  }): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<{ success: boolean; data: { success: boolean; message: string } }>(
      '/restaurant/printer/test',
      config || {}
    );
    return (res as any).data ?? res;
  },

  async verifyPin(pin: string): Promise<boolean> {
    try {
      await apiClient.post<{ verified: boolean }>('/restaurant/verify-pin', { pin });
      return true;
    } catch {
      return false;
    }
  },
};
