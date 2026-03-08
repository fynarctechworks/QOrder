import { Request, Response, NextFunction } from 'express';
import { receiptService } from '../services/receiptService.js';
import type { ApiResponse } from '../types/index.js';

export const receiptController = {
  // ─── Customer or admin sends receipt ───
  async send(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { orderId } = req.params;
      const { type, recipient } = req.body;
      const restaurantId = req.user?.restaurantId;
      const result = await receiptService.sendReceipt(orderId!, type, recipient, restaurantId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  // ─── List receipts for an order ───
  async listByOrder(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.user?.restaurantId;
      const receipts = await receiptService.listByOrder(req.params.orderId!, restaurantId);
      res.json({ success: true, data: receipts });
    } catch (err) { next(err); }
  },
};
