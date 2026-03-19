import { Request, Response, NextFunction } from 'express';
import { panCornerService } from '../services/index.js';
import type { ApiResponse } from '../types/index.js';
import type {
  CreatePanCornerCategoryInput,
  UpdatePanCornerCategoryInput,
  CreatePanCornerItemInput,
  UpdatePanCornerItemInput,
} from '../validators/index.js';

function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'object' && 'toNumber' in (val as object)) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

function transformItem(item: Record<string, unknown>) {
  return {
    ...item,
    price: toNumber(item.price),
    discountPrice: item.discountPrice != null ? toNumber(item.discountPrice) : undefined,
    taxRate: item.taxRate != null ? toNumber(item.taxRate) : null,
  };
}

export const panCornerController = {
  // ==================== CATEGORIES ====================

  async getCategories(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const data = await panCornerService.getCategories(req.restaurantId!);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },

  async getCategoryById(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const data = await panCornerService.getCategoryById(req.params.id, req.restaurantId!);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },

  async createCategory(
    req: Request<unknown, unknown, CreatePanCornerCategoryInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const data = await panCornerService.createCategory(req.restaurantId!, req.body);
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },

  async updateCategory(
    req: Request<{ id: string }, unknown, UpdatePanCornerCategoryInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const data = await panCornerService.updateCategory(req.params.id, req.restaurantId!, req.body);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },

  async deleteCategory(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await panCornerService.deleteCategory(req.params.id, req.restaurantId!);
      res.json({ success: true, data: { message: 'Category deleted' } });
    } catch (error) { next(error); }
  },

  // ==================== ITEMS ====================

  async getItems(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const items = await panCornerService.getItems(req.restaurantId!, categoryId);
      res.json({ success: true, data: items.map((i) => transformItem(i as unknown as Record<string, unknown>)) });
    } catch (error) { next(error); }
  },

  async getItemById(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const item = await panCornerService.getItemById(req.params.id, req.restaurantId!);
      res.json({ success: true, data: transformItem(item as unknown as Record<string, unknown>) });
    } catch (error) { next(error); }
  },

  async createItem(
    req: Request<unknown, unknown, CreatePanCornerItemInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const item = await panCornerService.createItem(req.restaurantId!, req.body);
      res.status(201).json({ success: true, data: transformItem(item as unknown as Record<string, unknown>) });
    } catch (error) { next(error); }
  },

  async updateItem(
    req: Request<{ id: string }, unknown, UpdatePanCornerItemInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const item = await panCornerService.updateItem(req.params.id, req.restaurantId!, req.body);
      res.json({ success: true, data: transformItem(item as unknown as Record<string, unknown>) });
    } catch (error) { next(error); }
  },

  async deleteItem(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await panCornerService.deleteItem(req.params.id, req.restaurantId!);
      res.json({ success: true, data: { message: 'Item deleted' } });
    } catch (error) { next(error); }
  },

  async toggleAvailability(
    req: Request<{ id: string }, unknown, { isAvailable: boolean }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const item = await panCornerService.toggleAvailability(req.params.id, req.restaurantId!, req.body.isAvailable);
      res.json({ success: true, data: transformItem(item as unknown as Record<string, unknown>) });
    } catch (error) { next(error); }
  },

  async checkout(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { items, customerName, customerPhone, notes, manualDiscount, manualDiscountType } = req.body as {
        items: { panCornerItemId: string; quantity: number }[];
        customerName?: string;
        customerPhone?: string;
        notes?: string;
        manualDiscount?: number;
        manualDiscountType?: 'PERCENTAGE' | 'FLAT';
      };
      const order = await panCornerService.checkout(req.restaurantId!, { items, customerName, customerPhone, notes, manualDiscount, manualDiscountType });
      res.status(201).json({ success: true, data: order });
    } catch (error) { next(error); }
  },
};
