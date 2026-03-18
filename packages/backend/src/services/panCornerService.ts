import { prisma, AppError } from '../lib/index.js';
import type {
  CreatePanCornerCategoryInput,
  UpdatePanCornerCategoryInput,
  CreatePanCornerItemInput,
  UpdatePanCornerItemInput,
} from '../validators/index.js';

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
};
