import { Request, Response, NextFunction } from 'express';
import { feedbackService } from '../services/feedbackService.js';
import type { ApiResponse } from '../types/index.js';

export const feedbackController = {
  // ─── Customer submits feedback ───
  async create(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { restaurantId } = req.params;
      const feedback = await feedbackService.create(restaurantId!, req.body);
      res.status(201).json({ success: true, data: feedback });
    } catch (err) { next(err); }
  },

  // ─── Admin views feedback list ───
  async list(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const result = await feedbackService.list(req.user!.restaurantId, {
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: Math.min(req.query.limit ? Number(req.query.limit) : 25, 100),
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
        maxRating: req.query.maxRating ? Number(req.query.maxRating) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      });
      res.json({
        success: true,
        data: result.feedbacks,
        meta: result.pagination,
      });
    } catch (err) { next(err); }
  },

  // ─── Admin views feedback stats ───
  async getStats(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const stats = await feedbackService.getStats(req.user!.restaurantId);
      res.json({ success: true, data: stats });
    } catch (err) { next(err); }
  },
};
