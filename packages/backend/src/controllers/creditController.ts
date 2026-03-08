import type { Request, Response, NextFunction } from 'express';
import { creditService } from '../services/creditService.js';
import type { ApiResponse } from '../types/index.js';

export const creditController = {
  async getAccounts(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.user!.restaurantId;
      const { search, active } = req.query;
      const accounts = await creditService.getAccounts(restaurantId, {
        search: search as string | undefined,
        activeOnly: active === 'true' ? true : active === 'false' ? false : undefined,
      });
      res.json({ success: true, data: accounts });
    } catch (err) {
      next(err);
    }
  },

  async getAccount(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const account = await creditService.getAccountById(req.params.id, req.user!.restaurantId);
      res.json({ success: true, data: account });
    } catch (err) {
      next(err);
    }
  },

  async createAccount(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const account = await creditService.createAccount(req.user!.restaurantId, req.body);
      res.status(201).json({ success: true, data: account });
    } catch (err) {
      next(err);
    }
  },

  async updateAccount(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const account = await creditService.updateAccount(req.params.id, req.user!.restaurantId, req.body);
      res.json({ success: true, data: account });
    } catch (err) {
      next(err);
    }
  },

  async deleteAccount(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await creditService.deleteAccount(req.params.id, req.user!.restaurantId);
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },

  async chargeToAccount(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const transaction = await creditService.chargeToAccount(
        req.params.id,
        req.user!.restaurantId,
        { ...req.body, createdBy: req.user!.name || req.user!.email },
      );
      res.status(201).json({ success: true, data: transaction });
    } catch (err) {
      next(err);
    }
  },

  async recordRepayment(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const transaction = await creditService.recordRepayment(
        req.params.id,
        req.user!.restaurantId,
        { ...req.body, createdBy: req.user!.name || req.user!.email },
      );
      res.status(201).json({ success: true, data: transaction });
    } catch (err) {
      next(err);
    }
  },

  async getTransactions(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { page, limit } = req.query;
      const result = await creditService.getTransactions(
        req.params.id,
        req.user!.restaurantId,
        { page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50 },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getSummary(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const summary = await creditService.getSummary(req.user!.restaurantId);
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  },
};
