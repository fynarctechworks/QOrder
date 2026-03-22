import type { Request, Response, NextFunction } from 'express';
import { inventoryService } from '../services/inventoryService.js';

export const inventoryController = {
  // ─── INGREDIENTS ───────────────────────────────────────────

  async getIngredients(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const branchId = req.branchId ?? undefined;
      const data = await inventoryService.getIngredients(restaurantId, branchId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async getIngredientById(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.getIngredientById(req.params.id!, restaurantId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async createIngredient(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.createIngredient(restaurantId, {
        ...req.body,
        branchId: req.branchId ?? null,
      });
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  },

  async updateIngredient(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.updateIngredient(req.params.id!, restaurantId, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async deleteIngredient(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      await inventoryService.deleteIngredient(req.params.id!, restaurantId);
      res.json({ success: true, message: 'Ingredient deleted' });
    } catch (err) { next(err); }
  },

  // ─── STOCK ────────────────────────────────────────────────

  async adjustStock(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const userId = req.user!.id;
      const data = await inventoryService.adjustStock(restaurantId, req.params.id!, {
        ...req.body,
        performedBy: userId,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async getStockHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await inventoryService.getStockHistory(restaurantId, {
        ingredientId: req.query.ingredientId as string,
        type: req.query.type as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        limit: Math.min(req.query.limit ? Number(req.query.limit) : 50, 200),
        page: req.query.page ? Number(req.query.page) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  },

  // ─── USAGE / STOCK OUT ──────────────────────────────────────

  async recordUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const userId = req.user!.id;
      const data = await inventoryService.recordUsage(restaurantId, {
        ...req.body,
        performedBy: userId,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async getDailySummary(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const date = req.query.date as string | undefined;
      const data = await inventoryService.getDailySummary(restaurantId, date);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async getUsageTrend(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const days = req.query.days ? Number(req.query.days) : 7;
      const data = await inventoryService.getUsageTrend(restaurantId, days);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async getForecast(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const days = req.query.days ? Number(req.query.days) : 14;
      const data = await inventoryService.getForecast(restaurantId, days);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  // ─── SUPPLIERS ────────────────────────────────────────────

  async getSuppliers(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.getSuppliers(restaurantId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async createSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.createSupplier(restaurantId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  },

  async updateSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.updateSupplier(req.params.id!, restaurantId, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async deleteSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      await inventoryService.deleteSupplier(req.params.id!, restaurantId);
      res.json({ success: true, message: 'Supplier deleted' });
    } catch (err) { next(err); }
  },

  // ─── PURCHASE ORDERS ──────────────────────────────────────

  async getPurchaseOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.getPurchaseOrders(restaurantId, {
        status: req.query.status as string,
        supplierId: req.query.supplierId as string,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async createPurchaseOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const userId = req.user!.id;
      const data = await inventoryService.createPurchaseOrder(restaurantId, {
        ...req.body,
        createdBy: userId,
        branchId: req.branchId ?? null,
      });
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  },

  async receivePurchaseOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const userId = req.user!.id;
      const data = await inventoryService.receivePurchaseOrder(req.params.id!, restaurantId, userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async updatePurchaseOrderStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.updatePurchaseOrderStatus(req.params.id!, restaurantId, req.body.status);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  // ─── OVERVIEW & ALERTS ────────────────────────────────────

  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.getOverview(restaurantId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async getLowStockAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.getLowStockAlerts(restaurantId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  // ─── SUPPLIER LINKS ──────────────────────────────────────

  async linkSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await inventoryService.linkSupplier(
        req.params.ingredientId!, req.body.supplierId, restaurantId, req.body.costPerUnit
      );
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async unlinkSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      await inventoryService.unlinkSupplier(req.params.ingredientId!, req.params.supplierId!, restaurantId);
      res.json({ success: true, message: 'Supplier unlinked' });
    } catch (err) { next(err); }
  },
};
