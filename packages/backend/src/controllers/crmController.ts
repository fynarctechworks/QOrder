import type { Request, Response, NextFunction } from 'express';
import { crmService } from '../services/crmService.js';

export const crmController = {
  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const { page, limit, search, tags, sortBy, sortOrder } = req.query;

      const result = await crmService.getCustomers(restaurantId, {
        page: page ? Number(page) : undefined,
        limit: Math.min(limit ? Number(limit) : 25, 100),
        search: search as string | undefined,
        tags: tags ? (tags as string).split(',') : undefined,
        sortBy: sortBy as 'totalSpend' | 'totalVisits' | 'lastVisitAt' | 'createdAt' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  },

  async getCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await crmService.getCustomerById(req.params.id!, req.user!.restaurantId);
      if (!customer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      res.json({ success: true, data: customer });
    } catch (err) { next(err); }
  },

  async updateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await crmService.updateCustomer(req.params.id!, req.user!.restaurantId, req.body);
      res.json({ success: true, data: customer });
    } catch (err) { next(err); }
  },

  async getInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const insights = await crmService.getInsights(req.user!.restaurantId);
      res.json({ success: true, data: insights });
    } catch (err) { next(err); }
  },

  async getTopCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit, metric } = req.query;
      const customers = await crmService.getTopCustomers(
        req.user!.restaurantId,
        Math.min(limit ? Number(limit) : 10, 100),
        (metric as 'totalSpend' | 'totalVisits') || 'totalSpend',
      );
      res.json({ success: true, data: customers });
    } catch (err) { next(err); }
  },
};
