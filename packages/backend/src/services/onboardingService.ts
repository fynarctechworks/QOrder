import { Prisma } from '@prisma/client';
import { prisma, AppError } from '../lib/index.js';

const db = prisma as any;

export interface OnboardingStatus {
  businessProfile: 'completed' | 'skipped' | 'pending';
  branchSetup: 'completed' | 'skipped' | 'pending';
  taxCurrency: 'completed' | 'skipped' | 'pending';
  menuSetup: 'completed' | 'skipped' | 'pending';
  tableSetup: 'completed' | 'skipped' | 'pending';
  planSelection: 'completed' | 'skipped' | 'pending';
}

const DEFAULT_STATUS: OnboardingStatus = {
  businessProfile: 'pending',
  branchSetup: 'pending',
  taxCurrency: 'pending',
  menuSetup: 'pending',
  tableSetup: 'pending',
  planSelection: 'pending',
};

export const onboardingService = {
  /** Get onboarding status for a restaurant */
  async getStatus(restaurantId: string): Promise<{ status: OnboardingStatus; completed: boolean }> {
    const restaurant = await db.restaurant.findUnique({
      where: { id: restaurantId },
      select: { onboardingStatus: true, onboardingCompleted: true },
    });
    if (!restaurant) throw AppError.notFound('Restaurant');

    const status = ((restaurant.onboardingStatus as unknown as OnboardingStatus) || DEFAULT_STATUS);
    return { status, completed: restaurant.onboardingCompleted };
  },

  /** Update business profile (step 1) */
  async updateBusinessProfile(restaurantId: string, data: {
    businessType: string;
    phone?: string;
    address?: string;
    description?: string;
    coverImage?: string;
  }) {
    const restaurant = await db.restaurant.update({
      where: { id: restaurantId },
      data: {
        businessType: data.businessType,
        phone: data.phone,
        address: data.address,
        description: data.description,
        coverImage: data.coverImage,
        onboardingStatus: {
          ...(await this._getStatus(restaurantId)),
          businessProfile: 'completed',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this._checkCompletion(restaurantId);
    return restaurant;
  },

  /** Setup first branch (step 2) */
  async setupBranch(restaurantId: string, data: {
    name: string;
    address?: string;
    phone?: string;
    settings?: Record<string, unknown>;
  }) {
    // Check if a branch already exists
    const existing = await db.branch.findFirst({
      where: { restaurantId },
    });

    if (existing) {
      await db.branch.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          address: data.address,
          phone: data.phone,
          settings: (data.settings || {}) as Record<string, string | number | boolean>,
        },
      });
    } else {
      await db.branch.create({
        data: {
          name: data.name,
          code: 'MAIN',
          address: data.address,
          phone: data.phone,
          settings: (data.settings || {}) as Record<string, string | number | boolean>,
          restaurantId,
        },
      });
    }

    await db.restaurant.update({
      where: { id: restaurantId },
      data: {
        onboardingStatus: {
          ...(await this._getStatus(restaurantId)),
          branchSetup: 'completed',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this._checkCompletion(restaurantId);
  },

  /** Update tax & currency (step 3) */
  async updateTaxCurrency(restaurantId: string, data: {
    currency: string;
    timezone: string;
    taxRate: number;
    gstNumber?: string;
  }) {
    await db.restaurant.update({
      where: { id: restaurantId },
      data: {
        currency: data.currency,
        timezone: data.timezone,
        taxRate: data.taxRate,
        gstNumber: data.gstNumber,
        onboardingStatus: {
          ...(await this._getStatus(restaurantId)),
          taxCurrency: 'completed',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this._checkCompletion(restaurantId);
  },

  /** Skip a step */
  async skipStep(restaurantId: string, step: keyof OnboardingStatus) {
    const currentStatus = await this._getStatus(restaurantId);
    currentStatus[step] = 'skipped';

    await db.restaurant.update({
      where: { id: restaurantId },
      data: { onboardingStatus: currentStatus as unknown as Prisma.InputJsonValue },
    });
    await this._checkCompletion(restaurantId);
  },

  /** Mark menu setup complete */
  async completeMenuSetup(restaurantId: string) {
    await db.restaurant.update({
      where: { id: restaurantId },
      data: {
        onboardingStatus: {
          ...(await this._getStatus(restaurantId)),
          menuSetup: 'completed',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this._checkCompletion(restaurantId);
  },

  /** Mark table setup complete */
  async completeTableSetup(restaurantId: string) {
    await db.restaurant.update({
      where: { id: restaurantId },
      data: {
        onboardingStatus: {
          ...(await this._getStatus(restaurantId)),
          tableSetup: 'completed',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this._checkCompletion(restaurantId);
  },

  /** Mark plan selection complete */
  async completePlanSelection(restaurantId: string) {
    await db.restaurant.update({
      where: { id: restaurantId },
      data: {
        onboardingStatus: {
          ...(await this._getStatus(restaurantId)),
          planSelection: 'completed',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this._checkCompletion(restaurantId);
  },

  // Internal: get current status as object
  async _getStatus(restaurantId: string): Promise<OnboardingStatus> {
    const restaurant = await db.restaurant.findUnique({
      where: { id: restaurantId },
      select: { onboardingStatus: true },
    });
    return ((restaurant?.onboardingStatus as unknown as OnboardingStatus) || { ...DEFAULT_STATUS });
  },

  // Internal: check if all steps are done/skipped
  async _checkCompletion(restaurantId: string) {
    const status = await this._getStatus(restaurantId);
    const allDone = Object.values(status).every((v) => v === 'completed' || v === 'skipped');
    if (allDone) {
      await db.restaurant.update({
        where: { id: restaurantId },
        data: { onboardingCompleted: true },
      });
    }
  },
};
