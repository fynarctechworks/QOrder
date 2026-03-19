import { randomBytes } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma, AppError } from '../lib/index.js';
import type {
  CreatePanCornerCategoryInput,
  UpdatePanCornerCategoryInput,
  CreatePanCornerItemInput,
  UpdatePanCornerItemInput,
} from '../validators/index.js';

function generateOrderNumber(): string {
  const d = new Date();
  const dateStr = `${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const random = randomBytes(3).toString('hex').substring(0, 4).toUpperCase();
  return `PC-${dateStr}-${random}`;
}

export const panCornerService = {
  // ==================== CATEGORIES ====================

  async getCategories(restaurantId: string) {
    return prisma.panCornerCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { items: { where: { isAvailable: true } } } },
      },
    });
  },

  async getCategoryById(id: string, restaurantId: string) {
    const category = await prisma.panCornerCategory.findFirst({
      where: { id, restaurantId },
    });
    if (!category) throw AppError.notFound('Pan Corner category');
    return category;
  },

  async createCategory(restaurantId: string, data: CreatePanCornerCategoryInput) {
    return prisma.panCornerCategory.create({
      data: { ...data, restaurantId },
    });
  },

  async updateCategory(id: string, restaurantId: string, data: UpdatePanCornerCategoryInput) {
    const category = await prisma.panCornerCategory.findFirst({ where: { id, restaurantId } });
    if (!category) throw AppError.notFound('Pan Corner category');
    return prisma.panCornerCategory.update({ where: { id }, data });
  },

  async deleteCategory(id: string, restaurantId: string) {
    const category = await prisma.panCornerCategory.findFirst({ where: { id, restaurantId } });
    if (!category) throw AppError.notFound('Pan Corner category');
    return prisma.panCornerCategory.delete({ where: { id } });
  },

  // ==================== ITEMS ====================

  async getItems(restaurantId: string, categoryId?: string) {
    return prisma.panCornerItem.findMany({
      where: {
        restaurantId,
        ...(categoryId ? { panCornerCategoryId: categoryId } : {}),
      },
      orderBy: [{ panCornerCategoryId: 'asc' }, { sortOrder: 'asc' }],
    });
  },

  async getItemById(id: string, restaurantId: string) {
    const item = await prisma.panCornerItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw AppError.notFound('Pan Corner item');
    return item;
  },

  async createItem(restaurantId: string, data: CreatePanCornerItemInput) {
    // Validate category belongs to this restaurant
    const category = await prisma.panCornerCategory.findFirst({
      where: { id: data.panCornerCategoryId, restaurantId },
    });
    if (!category) throw AppError.notFound('Pan Corner category');

    return prisma.panCornerItem.create({
      data: {
        ...data,
        price: data.price,
        discountPrice: data.discountPrice ?? null,
        taxRate: data.taxRate ?? null,
        restaurantId,
      },
    });
  },

  async updateItem(id: string, restaurantId: string, data: UpdatePanCornerItemInput) {
    const item = await prisma.panCornerItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw AppError.notFound('Pan Corner item');
    return prisma.panCornerItem.update({ where: { id }, data });
  },

  async deleteItem(id: string, restaurantId: string) {
    const item = await prisma.panCornerItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw AppError.notFound('Pan Corner item');
    return prisma.panCornerItem.delete({ where: { id } });
  },

  async toggleAvailability(id: string, restaurantId: string, isAvailable: boolean) {
    const item = await prisma.panCornerItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw AppError.notFound('Pan Corner item');
    return prisma.panCornerItem.update({ where: { id }, data: { isAvailable } });
  },

  // ==================== CHECKOUT ====================

  async checkout(
    restaurantId: string,
    input: {
      items: { panCornerItemId: string; quantity: number }[];
      customerName?: string;
      customerPhone?: string;
      notes?: string;
      manualDiscount?: number;
      manualDiscountType?: 'PERCENTAGE' | 'FLAT';
    }
  ) {
    const { items, customerName, customerPhone, notes, manualDiscount, manualDiscountType } = input;

    // Fetch items and validate availability
    const panCornerItems = await prisma.panCornerItem.findMany({
      where: { id: { in: items.map((i) => i.panCornerItemId) }, restaurantId, isAvailable: true },
    });
    if (panCornerItems.length !== items.length) {
      throw AppError.badRequest('Some Pan Corner items are not available');
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { taxRate: true },
    });
    if (!restaurant) throw AppError.notFound('Restaurant');

    const itemMap = new Map(panCornerItems.map((i) => [i.id, i]));
    let subtotal = new Decimal(0);
    let itemTax = new Decimal(0);

    const orderItems = items.map((input) => {
      const item = itemMap.get(input.panCornerItemId)!;
      const price = item.discountPrice ?? item.price;
      const totalPrice = new Decimal(price).times(input.quantity);
      subtotal = subtotal.plus(totalPrice);
      const taxRate = item.taxRate ?? 0;
      itemTax = itemTax.plus(totalPrice.times(taxRate).dividedBy(100));
      return {
        quantity: input.quantity,
        unitPrice: new Decimal(price),
        totalPrice,
        itemSnapshot: {
          name: item.name,
          price: Number(price),
          description: item.description ?? null,
          image: item.image ?? null,
        },
      };
    });

    const tax = itemTax.toDecimalPlaces(2);

    let discountAmount = new Decimal(0);
    if (manualDiscount && manualDiscount > 0) {
      if (manualDiscountType === 'PERCENTAGE') {
        discountAmount = subtotal.times(manualDiscount).dividedBy(100).toDecimalPlaces(2);
      } else {
        discountAmount = new Decimal(manualDiscount).toDecimalPlaces(2);
      }
      if (discountAmount.greaterThan(subtotal)) discountAmount = subtotal;
    }

    const total = subtotal.minus(discountAmount).plus(tax);

    // Pan Corner daily token (PC-001 … PC-999, resets each IST day)
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const todayStartUTC = new Date(
      new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate())).getTime() - IST_OFFSET_MS
    );
    const lastPCOrder = await prisma.order.findFirst({
      where: { restaurantId, orderType: 'PAN_CORNER', tokenNumber: { not: null }, createdAt: { gte: todayStartUTC } },
      orderBy: { createdAt: 'desc' },
      select: { tokenNumber: true },
    });
    const tokenNumber = lastPCOrder?.tokenNumber && lastPCOrder.tokenNumber < 999
      ? lastPCOrder.tokenNumber + 1
      : 1;

    return prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        tokenNumber,
        restaurantId,
        status: 'COMPLETED',
        orderType: 'PAN_CORNER',
        completedAt: new Date(),
        subtotal,
        tax,
        total,
        discount: discountAmount,
        customerName,
        customerPhone,
        notes: notes ? `Pan Corner — ${notes}` : 'Pan Corner',
        items: {
          create: orderItems.map((item) => ({
            menuItemId: null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            itemSnapshot: item.itemSnapshot,
          })),
        },
      },
      select: { id: true, orderNumber: true, total: true, tokenNumber: true },
    });
  },
};
