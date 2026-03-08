import { Prisma, Discount, DiscountType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';

interface DiscountInput {
  name: string;
  type: DiscountType;
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

interface CouponInput {
  code: string;
  discountId: string;
  maxUses?: number | null;
  maxUsesPerCustomer?: number;
  expiresAt?: string | null;
  isActive?: boolean;
}

interface AppliedDiscount {
  discountId: string;
  couponId?: string;
  discountAmount: Decimal;
  discountName: string;
}

function isWithinTimeWindow(discount: Discount): boolean {
  const now = new Date();

  // Check date range
  if (discount.activeFrom && now < discount.activeFrom) return false;
  if (discount.activeTo && now > discount.activeTo) return false;

  // Check days of week
  if (discount.activeDays.length > 0) {
    if (!discount.activeDays.includes(now.getDay())) return false;
  }

  // Check time range (HH:MM format)
  if (discount.activeTimeFrom && discount.activeTimeTo) {
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (currentTime < discount.activeTimeFrom || currentTime > discount.activeTimeTo) return false;
  }

  return true;
}

function calculateDiscountAmount(discount: Discount, subtotal: Decimal): Decimal {
  let amount: Decimal;
  if (discount.type === 'PERCENTAGE') {
    amount = subtotal.times(discount.value).dividedBy(100).toDecimalPlaces(2);
    if (discount.maxDiscount) {
      const cap = new Decimal(discount.maxDiscount);
      if (amount.greaterThan(cap)) amount = cap;
    }
  } else {
    amount = new Decimal(discount.value);
  }
  // Never discount more than the subtotal
  if (amount.greaterThan(subtotal)) amount = subtotal;
  return amount;
}

export const discountService = {
  // ─── Admin CRUD ───

  async create(restaurantId: string, input: DiscountInput): Promise<Discount> {
    return prisma.discount.create({
      data: {
        restaurantId,
        name: input.name,
        type: input.type,
        value: input.value,
        minOrderAmount: input.minOrderAmount ?? null,
        maxDiscount: input.maxDiscount ?? null,
        isAutoApply: input.isAutoApply ?? false,
        activeFrom: input.activeFrom ? new Date(input.activeFrom) : null,
        activeTo: input.activeTo ? new Date(input.activeTo) : null,
        activeDays: input.activeDays ?? [],
        activeTimeFrom: input.activeTimeFrom ?? null,
        activeTimeTo: input.activeTimeTo ?? null,
        maxUses: input.maxUses ?? null,
        isActive: input.isActive ?? true,
      },
    });
  },

  async update(id: string, restaurantId: string, input: Partial<DiscountInput>): Promise<Discount> {
    const existing = await prisma.discount.findFirst({ where: { id, restaurantId } });
    if (!existing) throw AppError.notFound('Discount');

    return prisma.discount.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.minOrderAmount !== undefined ? { minOrderAmount: input.minOrderAmount } : {}),
        ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount } : {}),
        ...(input.isAutoApply !== undefined ? { isAutoApply: input.isAutoApply } : {}),
        ...(input.activeFrom !== undefined ? { activeFrom: input.activeFrom ? new Date(input.activeFrom) : null } : {}),
        ...(input.activeTo !== undefined ? { activeTo: input.activeTo ? new Date(input.activeTo) : null } : {}),
        ...(input.activeDays !== undefined ? { activeDays: input.activeDays } : {}),
        ...(input.activeTimeFrom !== undefined ? { activeTimeFrom: input.activeTimeFrom } : {}),
        ...(input.activeTimeTo !== undefined ? { activeTimeTo: input.activeTimeTo } : {}),
        ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  },

  async delete(id: string, restaurantId: string): Promise<void> {
    const existing = await prisma.discount.findFirst({ where: { id, restaurantId } });
    if (!existing) throw AppError.notFound('Discount');
    await prisma.discount.delete({ where: { id } });
  },

  async list(restaurantId: string): Promise<Discount[]> {
    return prisma.discount.findMany({
      where: { restaurantId },
      include: { coupons: true, _count: { select: { orderDiscounts: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ─── Coupon CRUD ───

  async createCoupon(restaurantId: string, input: CouponInput) {
    // Verify discount belongs to restaurant
    const discount = await prisma.discount.findFirst({ where: { id: input.discountId, restaurantId } });
    if (!discount) throw AppError.notFound('Discount');

    return prisma.coupon.create({
      data: {
        restaurantId,
        code: input.code.toUpperCase().trim(),
        discountId: input.discountId,
        maxUses: input.maxUses ?? null,
        maxUsesPerCustomer: input.maxUsesPerCustomer ?? 1,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        isActive: input.isActive ?? true,
      },
    });
  },

  async updateCoupon(id: string, restaurantId: string, input: Partial<CouponInput>) {
    const existing = await prisma.coupon.findFirst({ where: { id, restaurantId } });
    if (!existing) throw AppError.notFound('Coupon');

    return prisma.coupon.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code.toUpperCase().trim() } : {}),
        ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
        ...(input.maxUsesPerCustomer !== undefined ? { maxUsesPerCustomer: input.maxUsesPerCustomer } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  },

  async deleteCoupon(id: string, restaurantId: string): Promise<void> {
    const existing = await prisma.coupon.findFirst({ where: { id, restaurantId } });
    if (!existing) throw AppError.notFound('Coupon');
    await prisma.coupon.delete({ where: { id } });
  },

  async listCoupons(restaurantId: string) {
    return prisma.coupon.findMany({
      where: { restaurantId },
      include: { discount: true, _count: { select: { orderDiscounts: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ─── Public: Validate coupon ───

  async validateCoupon(
    restaurantId: string,
    code: string,
    subtotal: Decimal,
    customerPhone?: string,
  ): Promise<{ valid: boolean; discount?: AppliedDiscount; error?: string }> {
    const coupon = await prisma.coupon.findFirst({
      where: { restaurantId, code: code.toUpperCase().trim(), isActive: true },
      include: { discount: true },
    });

    if (!coupon) return { valid: false, error: 'Invalid coupon code' };
    if (coupon.expiresAt && new Date() > coupon.expiresAt) return { valid: false, error: 'Coupon has expired' };
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return { valid: false, error: 'Coupon usage limit reached' };

    const discount = coupon.discount;
    if (!discount.isActive) return { valid: false, error: 'Discount is no longer active' };
    if (!isWithinTimeWindow(discount)) return { valid: false, error: 'Discount not available at this time' };
    if (discount.minOrderAmount && subtotal.lessThan(discount.minOrderAmount)) {
      return { valid: false, error: `Minimum order of ${discount.minOrderAmount} required` };
    }

    // Per-customer usage check
    if (customerPhone && coupon.maxUsesPerCustomer) {
      const customerUses = await prisma.orderDiscount.count({
        where: { couponId: coupon.id, customerPhone },
      });
      if (customerUses >= coupon.maxUsesPerCustomer) {
        return { valid: false, error: 'You have already used this coupon' };
      }
    }

    const discountAmount = calculateDiscountAmount(discount, subtotal);

    return {
      valid: true,
      discount: {
        discountId: discount.id,
        couponId: coupon.id,
        discountAmount,
        discountName: discount.name,
      },
    };
  },

  // ─── Public: Get auto-apply discounts ───

  async getAutoApplyDiscounts(restaurantId: string, subtotal: Decimal): Promise<AppliedDiscount | null> {
    const discounts = await prisma.discount.findMany({
      where: { restaurantId, isActive: true, isAutoApply: true },
      orderBy: { value: 'desc' }, // Best discount first
    });

    for (const discount of discounts) {
      if (!isWithinTimeWindow(discount)) continue;
      if (discount.minOrderAmount && subtotal.lessThan(discount.minOrderAmount)) continue;
      if (discount.maxUses && discount.usedCount >= discount.maxUses) continue;

      const discountAmount = calculateDiscountAmount(discount, subtotal);
      return {
        discountId: discount.id,
        discountAmount,
        discountName: discount.name,
      };
    }

    return null;
  },

  // ─── Record discount usage (called from orderService) ───

  async recordUsage(
    orderId: string,
    discountId: string,
    discountAmount: Decimal,
    couponId?: string,
    customerPhone?: string,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.orderDiscount.create({
        data: { orderId, discountId, discountAmount, couponId, customerPhone },
      }),
      prisma.discount.update({
        where: { id: discountId },
        data: { usedCount: { increment: 1 } },
      }),
      ...(couponId
        ? [prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } })]
        : []),
    ]);
  },
};
