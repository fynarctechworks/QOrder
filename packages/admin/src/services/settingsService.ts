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
    /** Daily report recipients */
    reportEmails?: string[];
    [key: string]: unknown;
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

    // Settings that are always restaurant-level (not branch-level)
    const restaurantOnlyKeys = [
      'acceptsOrders', 'requirePhoneVerification', 'password',
      'adminWhatsAppPhone', 'whatsappAlertLowStock', 'whatsappAlertStaffLate',
      'whatsappAlertEarlyCheckout', 'whatsappAlertAutoInvoice',
      'staffLateThresholdMinutes', 'earlyCheckoutThresholdMinutes',
    ];
    const restaurantSettings: Record<string, unknown> = {};
    const branchSettings: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(settings)) {
      if (restaurantOnlyKeys.includes(key)) {
        restaurantSettings[key] = value;
      } else {
        branchSettings[key] = value;
      }
    }

    if (branchId) {
      // With branch: restaurant-only keys stay at restaurant level, rest go to branch
      if (Object.keys(restaurantSettings).length > 0) {
        await apiClient.patch<RestaurantInfo>('/restaurant/settings', restaurantSettings);
      }
      if (Object.keys(branchSettings).length > 0) {
        await apiClient.patch(`/branches/${branchId}/settings`, branchSettings);
      }
    } else {
      // No branch: merge everything into a single PATCH to avoid two-call race
      const allSettings = { ...restaurantSettings, ...branchSettings };
      if (Object.keys(allSettings).length > 0) {
        await apiClient.patch<RestaurantInfo>('/restaurant/settings', allSettings);
      }
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
