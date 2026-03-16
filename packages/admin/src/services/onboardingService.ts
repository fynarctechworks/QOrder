import { apiClient } from './apiClient';

export interface OnboardingStatus {
  businessProfile: 'completed' | 'skipped' | 'pending';
  branchSetup: 'completed' | 'skipped' | 'pending';
  taxCurrency: 'completed' | 'skipped' | 'pending';
  menuSetup: 'completed' | 'skipped' | 'pending';
  tableSetup: 'completed' | 'skipped' | 'pending';
  planSelection: 'completed' | 'skipped' | 'pending';
}

export interface OnboardingStatusResponse {
  status: OnboardingStatus;
  completed: boolean;
}

export const onboardingService = {
  async getStatus(): Promise<OnboardingStatusResponse> {
    return apiClient.get<OnboardingStatusResponse>('/onboarding/status');
  },

  async updateBusinessProfile(data: {
    businessType: string;
    phone?: string;
    address?: string;
    description?: string;
  }) {
    return apiClient.post('/onboarding/business-profile', data);
  },

  async setupBranch(data: {
    name: string;
    address?: string;
    phone?: string;
    settings?: Record<string, unknown>;
  }) {
    return apiClient.post('/onboarding/branch-setup', data);
  },

  async updateTaxCurrency(data: {
    currency: string;
    timezone: string;
    taxRate: number;
    gstNumber?: string;
  }) {
    return apiClient.post('/onboarding/tax-currency', data);
  },

  async skipStep(step: keyof OnboardingStatus) {
    return apiClient.post('/onboarding/skip-step', { step });
  },

  async completeMenuSetup() {
    return apiClient.post('/onboarding/complete-menu');
  },

  async completeTableSetup() {
    return apiClient.post('/onboarding/complete-tables');
  },
};
