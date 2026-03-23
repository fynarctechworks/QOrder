import { Decimal } from '@prisma/client/runtime/library';
import { prisma, cache, AppError } from '../lib/index.js';
import { alertService } from './alertService.js';
import { getIO } from '../socket/index.js';

/**
 * After any stock change, sync menu item availability:
 * - Items whose ANY ingredient is now at 0 → isAvailable = false
 * - Items whose ALL ingredients are > 0 (and were previously disabled by us) → isAvailable = true
 * Fire-and-forget: never throws, never blocks the caller.
 */
async function syncMenuAvailability(restaurantId: string, affectedIngredientIds: string[]) {
  if (affectedIngredientIds.length === 0) return;

  // Find every menu item that uses any of the affected ingredients
  const recipes = await prisma.recipe.findMany({
    where: { ingredientId: { in: affectedIngredientIds } },
    select: { menuItemId: true },
    distinct: ['menuItemId'],
  });
  if (recipes.length === 0) return;

  const menuItemIds = recipes.map(r => r.menuItemId);

  // For each menu item, check all its ingredient stocks
  const allRecipes = await prisma.recipe.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: { ingredient: { select: { currentStock: true } } },
  });

  const toDisable: string[] = [];
  const toEnable: string[] = [];

  // Group recipes by menuItemId
  const recipesByItem = new Map<string, typeof allRecipes>();
  for (const r of allRecipes) {
    const list = recipesByItem.get(r.menuItemId) ?? [];
    list.push(r);
    recipesByItem.set(r.menuItemId, list);
  }

  for (const [menuItemId, itemRecipes] of recipesByItem) {
    const hasOutOfStock = itemRecipes.some(r => new Decimal(r.ingredient.currentStock).equals(0));
    if (hasOutOfStock) {
      toDisable.push(menuItemId);
    } else {
      toEnable.push(menuItemId);
    }
  }

  await Promise.all([
    toDisable.length > 0
      ? prisma.menuItem.updateMany({ where: { id: { in: toDisable }, restaurantId }, data: { isAvailable: false } })
      : Promise.resolve(),
    toEnable.length > 0
      ? prisma.menuItem.updateMany({ where: { id: { in: toEnable }, restaurantId }, data: { isAvailable: true } })
      : Promise.resolve(),
  ]);
}

export const inventoryService = {
  // ─── INGREDIENTS ───────────────────────────────────────────

  async getIngredients(restaurantId: string, branchId?: string | null) {
    return prisma.ingredient.findMany({
      where: {
        restaurantId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      include: {
        suppliers: {
          include: { supplier: { select: { id: true, name: true } } },
        },
        _count: { select: { stockMovements: true } },
      },
      orderBy: { name: 'asc' },
    });
  },

  async getIngredientById(id: string, restaurantId: string) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { id, restaurantId },
      include: {
        suppliers: {
          include: { supplier: true },
        },
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!ingredient) throw AppError.notFound('Ingredient');
    return ingredient;
  },

  async createIngredient(restaurantId: string, data: {
    name: string;
    unit?: string;
    category?: string;
    currentStock?: number;
    minStock?: number;
    costPerUnit?: number;
    branchId?: string | null;
    autoDeductEnabled?: boolean;
    autoDeductQty?: number;
    autoDeductUnit?: string;
    autoDeductFrequency?: string;
  }) {
    const existing = await prisma.ingredient.findFirst({
      where: { restaurantId, branchId: data.branchId ?? null, name: data.name },
    });
    if (existing) throw AppError.conflict('An ingredient with this name already exists');

    return prisma.ingredient.create({
      data: {
        name: data.name,
        unit: (data.unit as any) || 'KG',
        category: (data.category as any) || 'PANTRY',
        currentStock: data.currentStock ?? 0,
        minStock: data.minStock ?? 0,
        costPerUnit: data.costPerUnit ?? 0,
        branchId: data.branchId ?? null,
        restaurantId,
        autoDeductEnabled: data.autoDeductEnabled ?? false,
        autoDeductQty: data.autoDeductQty ?? 0,
        autoDeductUnit: (data.autoDeductUnit as any) ?? data.unit ?? 'KG',
        autoDeductFrequency: (data.autoDeductFrequency as any) ?? 'DAILY',
      },
    });
  },

  async updateIngredient(id: string, restaurantId: string, data: {
    name?: string;
    unit?: string;
    category?: string;
    minStock?: number;
    costPerUnit?: number;
    isActive?: boolean;
    autoDeductEnabled?: boolean;
    autoDeductQty?: number;
    autoDeductUnit?: string;
    autoDeductFrequency?: string;
  }) {
    const ingredient = await prisma.ingredient.findFirst({ where: { id, restaurantId } });
    if (!ingredient) throw AppError.notFound('Ingredient');

    if (data.name && data.name !== ingredient.name) {
      const dup = await prisma.ingredient.findFirst({
        where: { restaurantId, branchId: ingredient.branchId, name: data.name, id: { not: id } },
      });
      if (dup) throw AppError.conflict('An ingredient with this name already exists');
    }

    return prisma.ingredient.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.unit !== undefined && { unit: data.unit as any }),
        ...(data.category !== undefined && { category: data.category as any }),
        ...(data.minStock !== undefined && { minStock: data.minStock }),
        ...(data.costPerUnit !== undefined && { costPerUnit: data.costPerUnit }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.autoDeductEnabled !== undefined && { autoDeductEnabled: data.autoDeductEnabled }),
        ...(data.autoDeductQty !== undefined && { autoDeductQty: data.autoDeductQty }),
        ...(data.autoDeductUnit !== undefined && { autoDeductUnit: data.autoDeductUnit as any }),
        ...(data.autoDeductFrequency !== undefined && { autoDeductFrequency: data.autoDeductFrequency as any }),
      },
    });
  },

  async deleteIngredient(id: string, restaurantId: string) {
    const ingredient = await prisma.ingredient.findFirst({ where: { id, restaurantId } });
    if (!ingredient) throw AppError.notFound('Ingredient');
    return prisma.ingredient.delete({ where: { id } });
  },

  // ─── STOCK ADJUSTMENTS ────────────────────────────────────

  async adjustStock(restaurantId: string, ingredientId: string, data: {
    type: 'MANUAL_ADD' | 'MANUAL_DEDUCT' | 'WASTE' | 'RETURN' | 'PURCHASE';
    quantity: number;
    costPerUnit?: number;
    notes?: string;
    performedBy?: string;
    date?: string;
  }) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
    });
    if (!ingredient) throw AppError.notFound('Ingredient');

    const qty = new Decimal(data.quantity);
    const previousQty = new Decimal(ingredient.currentStock);
    let newQty: Decimal;

    // Additive types: stock increases
    const ADDITIVE_TYPES = ['MANUAL_ADD', 'PURCHASE', 'RETURN'];
    if (ADDITIVE_TYPES.includes(data.type)) {
      newQty = previousQty.plus(qty);
    } else {
      // MANUAL_DEDUCT, WASTE, etc. — stock decreases
      newQty = previousQty.minus(qty);
      if (newQty.isNegative()) {
        throw AppError.badRequest('Insufficient stock. Current stock: ' + previousQty.toString());
      }
    }

    const [updated] = await prisma.$transaction([
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: {
          currentStock: newQty,
          ...(data.costPerUnit !== undefined && { costPerUnit: data.costPerUnit }),
        },
      }),
      prisma.stockMovement.create({
        data: {
          type: data.type,
          quantity: qty,
          previousQty,
          newQty,
          costPerUnit: data.costPerUnit ?? null,
          notes: data.notes,
          performedBy: data.performedBy,
          ingredientId,
          restaurantId,
          ...(data.date && { createdAt: new Date(data.date) }),
        },
      }),
    ]);

    // Sync menu item availability based on new stock level
    syncMenuAvailability(restaurantId, [ingredientId]).catch(() => {});

    // Real-time low stock alert — only for deductive operations
    if (!ADDITIVE_TYPES.includes(data.type)) {
      alertService.checkItemsForLowStock(restaurantId, [{
        ingredientId,
        previousStock: previousQty.toNumber(),
        newStock: newQty.toNumber(),
      }]).catch(() => {});
    }

    return updated;
  },

  // ─── STOCK HISTORY ────────────────────────────────────────

  async getStockHistory(restaurantId: string, filters?: {
    ingredientId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    page?: number;
  }) {
    const limit = filters?.limit || 50;
    const page = filters?.page || 1;
    const skip = (page - 1) * limit;

    const where: any = { restaurantId };
    if (filters?.ingredientId) where.ingredientId = filters.ingredientId;
    if (filters?.type) where.type = filters.type;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters?.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters?.endDate) where.createdAt.lte = new Date(new Date(filters.endDate).getTime() + 86400000);
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          ingredient: { select: { id: true, name: true, unit: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return { data: movements, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  // ─── USAGE / STOCK OUT ────────────────────────────────────

  async recordUsage(restaurantId: string, data: {
    items: { ingredientId: string; quantity: number; notes?: string }[];
    performedBy?: string;
    date?: string;
  }) {
    // Validate all ingredients exist
    const ingredientIds = data.items.map(i => i.ingredientId);
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, restaurantId },
    });
    if (ingredients.length !== ingredientIds.length) {
      throw AppError.badRequest('Some ingredients were not found');
    }

    const ingredientMap = new Map(ingredients.map(i => [i.id, i]));
    const operations: any[] = [];

    for (const item of data.items) {
      const ingredient = ingredientMap.get(item.ingredientId)!;
      const qty = new Decimal(item.quantity);
      const previousQty = new Decimal(ingredient.currentStock);
      const newQty = previousQty.minus(qty);

      if (newQty.isNegative()) {
        throw AppError.badRequest(
          `Insufficient stock for ${ingredient.name}. Current: ${previousQty}, Requested: ${qty}`
        );
      }

      operations.push(
        prisma.ingredient.update({
          where: { id: item.ingredientId },
          data: { currentStock: newQty },
        })
      );
      operations.push(
        prisma.stockMovement.create({
          data: {
            type: 'USAGE',
            quantity: qty,
            previousQty,
            newQty,
            costPerUnit: ingredient.costPerUnit,
            notes: item.notes || 'Daily usage',
            performedBy: data.performedBy,
            ingredientId: item.ingredientId,
            restaurantId,
            ...(data.date && { createdAt: new Date(data.date) }),
          },
        })
      );
    }

    await prisma.$transaction(operations);

    // Sync menu item availability for all affected ingredients
    syncMenuAvailability(restaurantId, ingredientIds).catch(() => {});

    // Real-time low stock alert for all deducted items
    const stockChanges = data.items.map(item => {
      const ingredient = ingredientMap.get(item.ingredientId)!;
      const previousStock = new Decimal(ingredient.currentStock).toNumber();
      return {
        ingredientId: item.ingredientId,
        previousStock,
        newStock: previousStock - item.quantity,
      };
    });
    alertService.checkItemsForLowStock(restaurantId, stockChanges).catch(() => {});

    return { deducted: data.items.length };
  },

  // ─── AUTO DEDUCT ──────────────────────────────────────────

  async runAutoDeduct(restaurantId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: any = { autoDeductEnabled: true, isActive: true, autoDeductQty: { gt: 0 } };
    if (restaurantId) where.restaurantId = restaurantId;

    const candidates = await prisma.ingredient.findMany({ where });

    const results = { deducted: 0, skippedLowStock: 0, skippedAlreadyRan: 0 };

    for (const ing of candidates) {
      // Check if already ran today for this ingredient
      if (ing.lastAutoDeductDate) {
        const last = new Date(ing.lastAutoDeductDate);
        last.setHours(0, 0, 0, 0);
        const daysSinceLast = Math.floor((today.getTime() - last.getTime()) / 86400000);
        const requiredDays = ing.autoDeductFrequency === 'DAILY' ? 1
          : ing.autoDeductFrequency === 'EVERY_2_DAYS' ? 2
          : ing.autoDeductFrequency === 'WEEKLY' ? 7
          : 30; // MONTHLY
        if (daysSinceLast < requiredDays) {
          results.skippedAlreadyRan++;
          continue;
        }
      }

      const qty = new Decimal(ing.autoDeductQty);
      const currentStock = new Decimal(ing.currentStock);

      if (currentStock.lessThan(qty)) {
        results.skippedLowStock++;
        alertService.checkItemsForLowStock(ing.restaurantId, [{
          ingredientId: ing.id,
          previousStock: currentStock.toNumber(),
          newStock: currentStock.toNumber(),
        }]).catch(() => {});
        continue;
      }

      const newQty = currentStock.minus(qty);
      await prisma.$transaction([
        prisma.ingredient.update({
          where: { id: ing.id },
          data: { currentStock: newQty, lastAutoDeductDate: today },
        }),
        prisma.stockMovement.create({
          data: {
            type: 'USAGE',
            quantity: qty,
            previousQty: currentStock,
            newQty,
            costPerUnit: ing.costPerUnit,
            notes: `Auto deduct (${ing.autoDeductFrequency.toLowerCase().replace(/_/g, ' ')})`,
            ingredientId: ing.id,
            restaurantId: ing.restaurantId,
          },
        }),
      ]);

      syncMenuAvailability(ing.restaurantId, [ing.id]).catch(() => {});
      results.deducted++;
    }

    return results;
  },

  async getDailySummary(restaurantId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const [usageMovements, purchaseMovements, totalStockValue] = await Promise.all([
      prisma.stockMovement.findMany({
        where: {
          restaurantId,
          type: 'USAGE',
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          ingredient: { select: { id: true, name: true, unit: true, costPerUnit: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockMovement.findMany({
        where: {
          restaurantId,
          type: 'PURCHASE',
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          ingredient: { select: { id: true, name: true, unit: true } },
        },
      }),
      prisma.$queryRaw<[{ total: string }]>`
        SELECT COALESCE(SUM("currentStock" * "costPerUnit"), 0)::text as total
        FROM "Ingredient"
        WHERE "restaurantId" = ${restaurantId} AND "isActive" = true
      `,
    ]);

    // Aggregate usage by ingredient
    const usageByIngredient = new Map<string, { name: string; unit: string; totalQty: number; totalValue: number }>();
    for (const m of usageMovements) {
      const key = m.ingredientId;
      const existing = usageByIngredient.get(key);
      const qty = Number(m.quantity);
      const value = qty * Number(m.costPerUnit ?? m.ingredient.costPerUnit);
      if (existing) {
        existing.totalQty += qty;
        existing.totalValue += value;
      } else {
        usageByIngredient.set(key, {
          name: m.ingredient.name,
          unit: m.ingredient.unit,
          totalQty: qty,
          totalValue: value,
        });
      }
    }

    const totalUsageValue = [...usageByIngredient.values()].reduce((s, i) => s + i.totalValue, 0);
    const totalPurchaseValue = purchaseMovements.reduce(
      (s, m) => s + Number(m.quantity) * Number(m.costPerUnit ?? 0), 0
    );

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalUsageValue: Math.round(totalUsageValue * 100) / 100,
      totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
      totalStockValue: Number(totalStockValue[0]?.total ?? 0),
      usageCount: usageMovements.length,
      purchaseCount: purchaseMovements.length,
      usageByIngredient: [...usageByIngredient.entries()].map(([id, v]) => ({
        ingredientId: id,
        ...v,
        totalValue: Math.round(v.totalValue * 100) / 100,
      })),
      recentUsage: usageMovements.slice(0, 20),
    };
  },

  async getUsageTrend(restaurantId: string, days: number = 7) {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const movements = await prisma.stockMovement.findMany({
      where: {
        restaurantId,
        type: 'USAGE',
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        ingredient: { select: { name: true, costPerUnit: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const dailyMap = new Map<string, { totalQty: number; totalValue: number; items: number }>();
    for (let d = 0; d < days; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      dailyMap.set(dt.toISOString().split('T')[0]!, { totalQty: 0, totalValue: 0, items: 0 });
    }

    for (const m of movements) {
      const dateKey = m.createdAt.toISOString().split('T')[0]!;
      const entry = dailyMap.get(dateKey);
      if (entry) {
        const qty = Number(m.quantity);
        entry.totalQty += qty;
        entry.totalValue += qty * Number(m.costPerUnit ?? m.ingredient.costPerUnit);
        entry.items += 1;
      }
    }

    return [...dailyMap.entries()].map(([date, data]) => ({
      date,
      totalQty: Math.round(data.totalQty * 100) / 100,
      totalValue: Math.round(data.totalValue * 100) / 100,
      itemCount: data.items,
    }));
  },

  // ─── LOW STOCK CHECK ──────────────────────────────────────

  async checkLowStock(restaurantId: string) {
    const lowStockIngredients = await prisma.ingredient.findMany({
      where: {
        restaurantId,
        isActive: true,
        currentStock: { lte: prisma.ingredient.fields.minStock } as any, // Prisma doesn't support field comparison directly
      },
    });
    // Use raw query for accurate comparison
    const lowStock = await prisma.$queryRaw<Array<{ id: string; name: string; unit: string; currentStock: string; minStock: string }>>`
      SELECT id, name, unit, "currentStock"::text, "minStock"::text
      FROM "Ingredient"
      WHERE "restaurantId" = ${restaurantId}
        AND "isActive" = true
        AND "currentStock" <= "minStock"
        AND "minStock" > 0
    `;
    return lowStock;
  },

  async getLowStockAlerts(restaurantId: string) {
    const lowStock = await prisma.$queryRaw<Array<{
      id: string; name: string; unit: string;
      currentStock: string; minStock: string; costPerUnit: string;
    }>>`
      SELECT id, name, unit, "currentStock"::text, "minStock"::text, "costPerUnit"::text
      FROM "Ingredient"
      WHERE "restaurantId" = ${restaurantId}
        AND "isActive" = true
        AND "currentStock" <= "minStock"
        AND "minStock" > 0
      ORDER BY ("currentStock" / NULLIF("minStock", 0)) ASC
    `;
    return lowStock.map(i => ({
      ...i,
      currentStock: Number(i.currentStock),
      minStock: Number(i.minStock),
      costPerUnit: Number(i.costPerUnit),
    }));
  },

  // ─── SUPPLIERS ────────────────────────────────────────────

  async getSuppliers(restaurantId: string) {
    return prisma.supplier.findMany({
      where: { restaurantId },
      include: {
        _count: { select: { ingredients: true, purchases: true } },
      },
      orderBy: { name: 'asc' },
    });
  },

  async createSupplier(restaurantId: string, data: {
    name: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string;
  }) {
    const existing = await prisma.supplier.findFirst({
      where: { restaurantId, name: data.name },
    });
    if (existing) throw AppError.conflict('A supplier with this name already exists');

    return prisma.supplier.create({
      data: { ...data, restaurantId },
    });
  },

  async updateSupplier(id: string, restaurantId: string, data: {
    name?: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string; isActive?: boolean;
  }) {
    const supplier = await prisma.supplier.findFirst({ where: { id, restaurantId } });
    if (!supplier) throw AppError.notFound('Supplier');

    if (data.name && data.name !== supplier.name) {
      const dup = await prisma.supplier.findFirst({
        where: { restaurantId, name: data.name, id: { not: id } },
      });
      if (dup) throw AppError.conflict('A supplier with this name already exists');
    }

    return prisma.supplier.update({ where: { id }, data });
  },

  async deleteSupplier(id: string, restaurantId: string) {
    const supplier = await prisma.supplier.findFirst({ where: { id, restaurantId } });
    if (!supplier) throw AppError.notFound('Supplier');
    return prisma.supplier.delete({ where: { id } });
  },

  // ─── PURCHASE ORDERS ──────────────────────────────────────

  async getPurchaseOrders(restaurantId: string, filters?: { status?: string; supplierId?: string }) {
    const where: any = { restaurantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.supplierId) where.supplierId = filters.supplierId;

    return prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: { ingredient: { select: { id: true, name: true, unit: true } } },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createPurchaseOrder(restaurantId: string, data: {
    supplierId: string;
    branchId?: string | null;
    notes?: string;
    createdBy?: string;
    items: { ingredientId: string; quantity: number; costPerUnit: number }[];
  }) {
    const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, restaurantId } });
    if (!supplier) throw AppError.notFound('Supplier');

    const totalAmount = data.items.reduce((sum, i) => sum + i.quantity * i.costPerUnit, 0);
    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

    return prisma.purchaseOrder.create({
      data: {
        orderNumber,
        supplierId: data.supplierId,
        restaurantId,
        branchId: data.branchId ?? null,
        totalAmount,
        notes: data.notes,
        createdBy: data.createdBy,
        items: {
          create: data.items.map(i => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            costPerUnit: i.costPerUnit,
            totalCost: i.quantity * i.costPerUnit,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: { ingredient: { select: { id: true, name: true, unit: true } } },
        },
      },
    });
  },

  async receivePurchaseOrder(id: string, restaurantId: string, performedBy?: string) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: { items: { include: { ingredient: true } } },
    });
    if (!po) throw AppError.notFound('Purchase order');
    if (po.status === 'RECEIVED') throw AppError.badRequest('Purchase order already received');
    if (po.status === 'CANCELLED') throw AppError.badRequest('Purchase order is cancelled');

    // Add stock for each item
    const operations: any[] = [
      prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date() },
      }),
    ];

    for (const item of po.items) {
      const previousQty = new Decimal(item.ingredient.currentStock);
      const addQty = new Decimal(item.quantity);
      const newQty = previousQty.plus(addQty);

      operations.push(
        prisma.ingredient.update({
          where: { id: item.ingredientId },
          data: {
            currentStock: newQty,
            costPerUnit: item.costPerUnit, // Update cost from latest purchase
          },
        })
      );
      operations.push(
        prisma.stockMovement.create({
          data: {
            type: 'PURCHASE',
            quantity: addQty,
            previousQty,
            newQty,
            costPerUnit: item.costPerUnit,
            reference: po.id,
            performedBy,
            ingredientId: item.ingredientId,
            restaurantId,
          },
        })
      );
    }

    await prisma.$transaction(operations);

    return prisma.purchaseOrder.findFirst({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { ingredient: { select: { id: true, name: true, unit: true, currentStock: true } } } },
      },
    });
  },

  async updatePurchaseOrderStatus(id: string, restaurantId: string, status: string) {
    const po = await prisma.purchaseOrder.findFirst({ where: { id, restaurantId } });
    if (!po) throw AppError.notFound('Purchase order');

    return prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: status as any,
        ...(status === 'ORDERED' && { orderedAt: new Date() }),
      },
    });
  },

  // ─── INVENTORY OVERVIEW ───────────────────────────────────

  async getOverview(restaurantId: string) {
    const todaySummary = await this.getDailySummary(restaurantId);

    const [
      totalIngredients,
      lowStockAlerts,
      totalValue,
      recentMovements,
      pendingPOs,
    ] = await Promise.all([
      prisma.ingredient.count({ where: { restaurantId, isActive: true } }),
      this.getLowStockAlerts(restaurantId),
      prisma.$queryRaw<[{ total: string }]>`
        SELECT COALESCE(SUM("currentStock" * "costPerUnit"), 0)::text as total
        FROM "Ingredient"
        WHERE "restaurantId" = ${restaurantId} AND "isActive" = true
      `,
      prisma.stockMovement.findMany({
        where: { restaurantId },
        include: { ingredient: { select: { name: true, unit: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.purchaseOrder.count({
        where: { restaurantId, status: { in: ['DRAFT', 'ORDERED'] } },
      }),
    ]);

    return {
      totalIngredients,
      lowStockCount: lowStockAlerts.length,
      lowStockAlerts,
      totalInventoryValue: Number(totalValue[0]?.total ?? 0),
      todayUsageValue: todaySummary.totalUsageValue,
      todayPurchaseValue: todaySummary.totalPurchaseValue,
      todayUsageCount: todaySummary.usageCount,
      recentMovements,
      pendingPurchaseOrders: pendingPOs,
    };
  },

  // ─── LINK SUPPLIER TO INGREDIENT ──────────────────────────

  async linkSupplier(ingredientId: string, supplierId: string, restaurantId: string, costPerUnit?: number) {
    const [ingredient, supplier] = await Promise.all([
      prisma.ingredient.findFirst({ where: { id: ingredientId, restaurantId } }),
      prisma.supplier.findFirst({ where: { id: supplierId, restaurantId } }),
    ]);
    if (!ingredient) throw AppError.notFound('Ingredient');
    if (!supplier) throw AppError.notFound('Supplier');

    return prisma.ingredientSupplier.upsert({
      where: { ingredientId_supplierId: { ingredientId, supplierId } },
      create: { ingredientId, supplierId, costPerUnit: costPerUnit ?? 0 },
      update: { costPerUnit: costPerUnit ?? undefined },
    });
  },

  async unlinkSupplier(ingredientId: string, supplierId: string, restaurantId: string) {
    const ingredient = await prisma.ingredient.findFirst({ where: { id: ingredientId, restaurantId } });
    if (!ingredient) throw AppError.notFound('Ingredient');

    return prisma.ingredientSupplier.delete({
      where: { ingredientId_supplierId: { ingredientId, supplierId } },
    });
  },

  // ─── SMART INVENTORY: AUTO-DEDUCT ON ORDER ────────────────

  /**
   * Deducts ingredients based on order items' recipes.
   * Called as a fire-and-forget post-op after order creation.
   * Silently skips items with no recipes (ingredient tracking is optional per item).
   * If an ingredient hits 0 after deduction, the linked menu items are auto-disabled.
   */
  async deductOrderStock(restaurantId: string, orderItems: { menuItemId: string; quantity: number }[]) {
    const menuItemIds = [...new Set(orderItems.map(i => i.menuItemId))];

    // Fetch all recipes for the ordered items in one query
    const recipes = await prisma.recipe.findMany({
      where: { menuItemId: { in: menuItemIds } },
      include: { ingredient: true },
    });

    if (recipes.length === 0) return; // No recipes configured — nothing to deduct

    // Aggregate total deduction per ingredient across all ordered items
    const deductMap = new Map<string, { ingredient: typeof recipes[0]['ingredient']; qty: Decimal }>();
    for (const recipe of recipes) {
      const orderItem = orderItems.find(o => o.menuItemId === recipe.menuItemId);
      if (!orderItem) continue;
      const deduct = new Decimal(recipe.quantity).times(orderItem.quantity);
      const existing = deductMap.get(recipe.ingredientId);
      if (existing) {
        existing.qty = existing.qty.plus(deduct);
      } else {
        deductMap.set(recipe.ingredientId, { ingredient: recipe.ingredient, qty: deduct });
      }
    }

    // Build transaction operations
    const ops: any[] = [];

    for (const [ingredientId, { ingredient, qty }] of deductMap) {
      const previousQty = new Decimal(ingredient.currentStock);
      // Clamp to zero — don't throw on insufficient stock (order already placed)
      const newQty = previousQty.minus(qty).lessThan(0) ? new Decimal(0) : previousQty.minus(qty);

      ops.push(
        prisma.ingredient.update({
          where: { id: ingredientId },
          data: { currentStock: newQty },
        }),
        prisma.stockMovement.create({
          data: {
            type: 'ORDER_DEDUCT',
            quantity: qty.greaterThan(previousQty) ? previousQty : qty,
            previousQty,
            newQty,
            costPerUnit: ingredient.costPerUnit,
            ingredientId,
            restaurantId,
          },
        }),
      );
    }

    await prisma.$transaction(ops);

    // Sync menu item availability for all affected ingredients
    syncMenuAvailability(restaurantId, [...deductMap.keys()]).catch(() => {});

    // Trigger low-stock alert checks
    const stockChanges = [...deductMap.entries()].map(([ingredientId, { ingredient, qty }]) => ({
      ingredientId,
      previousStock: new Decimal(ingredient.currentStock).toNumber(),
      newStock: Math.max(0, new Decimal(ingredient.currentStock).minus(qty).toNumber()),
    }));
    alertService.checkItemsForLowStock(restaurantId, stockChanges).catch(() => {});

    // Notify admin clients so inventory UI auto-refreshes
    getIO()?.to(`restaurant:${restaurantId}`).emit('inventory:updated', { restaurantId });
  },

  // ─── FORECAST ─────────────────────────────────────────────

  /**
   * Returns estimated days of stock remaining per ingredient,
   * based on average daily ORDER_DEDUCT usage over the last N days.
   */
  async getForecast(restaurantId: string, days: number = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [ingredients, movements] = await Promise.all([
      prisma.ingredient.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, name: true, unit: true, currentStock: true, minStock: true, costPerUnit: true, isActive: true },
      }),
      prisma.stockMovement.findMany({
        where: { restaurantId, type: 'ORDER_DEDUCT', createdAt: { gte: since } },
        select: { ingredientId: true, quantity: true },
      }),
    ]);

    // Sum usage per ingredient over the window
    const usageMap = new Map<string, number>();
    for (const m of movements) {
      usageMap.set(m.ingredientId, (usageMap.get(m.ingredientId) ?? 0) + Number(m.quantity));
    }

    return ingredients.map(ing => {
      const totalUsed = usageMap.get(ing.id) ?? 0;
      const avgDailyUsage = totalUsed / days;
      const currentStock = Number(ing.currentStock);
      const minStock = Number(ing.minStock);
      const daysRemaining = avgDailyUsage > 0 ? Math.floor(currentStock / avgDailyUsage) : null;
      const daysUntilMin = avgDailyUsage > 0 && minStock > 0
        ? Math.floor((currentStock - minStock) / avgDailyUsage)
        : null;

      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        currentStock,
        minStock,
        costPerUnit: Number(ing.costPerUnit),
        avgDailyUsage: Math.round(avgDailyUsage * 1000) / 1000,
        daysRemaining,
        daysUntilMin,
        status: currentStock === 0 ? 'out' :
                minStock > 0 && currentStock <= minStock ? 'low' :
                daysRemaining !== null && daysRemaining <= 3 ? 'critical' : 'ok',
      };
    });
  },
};
