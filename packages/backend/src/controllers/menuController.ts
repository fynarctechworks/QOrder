import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { menuService } from '../services/index.js';
import type { ApiResponse } from '../types/index.js';
import type { 
  CreateCategoryInput, 
  UpdateCategoryInput,
  CreateMenuItemInput,
  UpdateMenuItemInput,
  CreateModifierGroupInput,
} from '../validators/index.js';

/* ─── Types for Prisma menu-item → frontend transformation ───────────── */

interface PrismaModifierGroupJoin {
  modifierGroup: {
    id: string;
    name: string;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    modifiers?: Array<{
      id: string;
      name: string;
      price: Prisma.Decimal;
      isDefault: boolean;
      isActive?: boolean;
    }>;
  };
}

interface PrismaMenuItemRaw {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  categoryId: string;
  isActive: boolean;
  isAvailable: boolean;
  sortOrder: number;
  prepTime: number | null;
  calories: number | null;
  tags: string[];
  ingredients: string[];
  allergens: string[];
  badge: string | null;
  dietType: string | null;
  price: Prisma.Decimal;
  discountPrice: Prisma.Decimal | null;
  modifierGroups?: PrismaModifierGroupJoin[];
  [key: string]: unknown;
}

/* ─── Transform Prisma menu-item shape → frontend shape ──────────────── */
// Prisma returns:  modifierGroups[].modifierGroup.{ name, minSelect, maxSelect, isRequired, modifiers[] }
// Frontends expect: customizationGroups[].{ name, required, minSelections, maxSelections, options[] }
function transformMenuItem(item: PrismaMenuItemRaw | null) {
  if (!item) return item;
  const { modifierGroups, price, discountPrice, ...rest } = item;
  return {
    ...rest,
    price: Number(price),
    discountPrice: discountPrice != null ? Number(discountPrice) : undefined,
    customizationGroups: (modifierGroups ?? []).map((mg) => {
      const g = mg.modifierGroup;
      return {
        id: g.id,
        name: g.name,
        required: g.isRequired,
        minSelections: g.minSelect,
        maxSelections: g.maxSelect,
        options: (g.modifiers ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          priceModifier: typeof m.price === 'object' ? Number(m.price) : Number(m.price ?? 0),
          isDefault: m.isDefault,
          isAvailable: m.isActive ?? true,
        })),
      };
    }),
  };
}

function transformMenuItems(items: PrismaMenuItemRaw[]) {
  return items.map(transformMenuItem);
}

export const menuController = {
  // ==================== CATEGORIES ====================

  async getCategories(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const categories = await menuService.getCategories(restaurantId);

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCategoryById(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const category = await menuService.getCategoryById(req.params.id, restaurantId);

      res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  },

  async createCategory(
    req: Request<unknown, unknown, CreateCategoryInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const category = await menuService.createCategory(restaurantId, req.body);

      res.status(201).json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateCategory(
    req: Request<{ id: string }, unknown, UpdateCategoryInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const category = await menuService.updateCategory(
        req.params.id, 
        restaurantId, 
        req.body
      );

      res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteCategory(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      await menuService.deleteCategory(req.params.id, restaurantId);

      res.json({
        success: true,
        data: { message: 'Category deleted' },
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== MENU ITEMS ====================

  async getMenuItems(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const query = req.query as unknown as import('../validators/index.js').MenuItemQueryInput;
      const result = await menuService.getMenuItems(restaurantId, query);

      res.json({
        success: true,
        data: transformMenuItems(result.items),
        meta: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMenuItemById(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const item = await menuService.getMenuItemById(req.params.id, restaurantId);

      res.json({
        success: true,
        data: transformMenuItem(item),
      });
    } catch (error) {
      next(error);
    }
  },

  async createMenuItem(
    req: Request<unknown, unknown, CreateMenuItemInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const item = await menuService.createMenuItem(restaurantId, req.body);

      res.status(201).json({
        success: true,
        data: transformMenuItem(item),
      });
    } catch (error) {
      next(error);
    }
  },

  async updateMenuItem(
    req: Request<{ id: string }, unknown, UpdateMenuItemInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const item = await menuService.updateMenuItem(
        req.params.id, 
        restaurantId, 
        req.body
      );

      res.json({
        success: true,
        data: transformMenuItem(item),
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteMenuItem(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      await menuService.deleteMenuItem(req.params.id, restaurantId);

      res.json({
        success: true,
        data: { message: 'Menu item deleted' },
      });
    } catch (error) {
      next(error);
    }
  },

  async updateAvailability(
    req: Request<unknown, unknown, { itemIds: string[]; isAvailable: boolean }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const result = await menuService.updateAvailability(
        restaurantId, 
        req.body.itemIds, 
        req.body.isAvailable
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== MODIFIER GROUPS ====================

  async getModifierGroups(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const groups = await menuService.getModifierGroups(restaurantId);

      res.json({
        success: true,
        data: groups,
      });
    } catch (error) {
      next(error);
    }
  },

  async createModifierGroup(
    req: Request<unknown, unknown, CreateModifierGroupInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const group = await menuService.createModifierGroup(restaurantId, req.body);

      res.status(201).json({
        success: true,
        data: group,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteModifierGroup(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      await menuService.deleteModifierGroup(req.params.id, restaurantId);

      res.json({
        success: true,
        data: { message: 'Modifier group deleted' },
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== PUBLIC MENU ====================

  async getPublicMenu(
    req: Request<{ slug: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const menu = await menuService.getPublicMenu(req.params.slug);

      res.json({
        success: true,
        data: menu,
      });
    } catch (error) {
      next(error);
    }
  },

  // Public menu methods for customer app
  async getCategoriesByRestaurant(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const categories = await menuService.getCategories(req.params.id);

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMenuByRestaurant(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const result = await menuService.getMenuItems(req.params.id, {
        limit,
        page: 1,
      });

      res.json({
        success: true,
        data: transformMenuItems(result.items),
      });
    } catch (error) {
      next(error);
    }
  },

  async getMenuItemsByCategory(
    req: Request<{ id: string; categoryId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const result = await menuService.getMenuItems(req.params.id, {
        limit,
        page: 1,
        categoryId: req.params.categoryId,
      });

      res.json({
        success: true,
        data: transformMenuItems(result.items),
      });
    } catch (error) {
      next(error);
    }
  },

  async getMenuItem(
    req: Request<{ id: string; itemId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const item = await menuService.getMenuItemById(req.params.itemId, req.params.id);

      res.json({
        success: true,
        data: transformMenuItem(item),
      });
    } catch (error) {
      next(error);
    }
  },
};
