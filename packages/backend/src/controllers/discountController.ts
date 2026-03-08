import { Request, Response, NextFunction } from 'express';
import { discountService } from '../services/discountService.js';
import type { ApiResponse } from '../types/index.js';
import { Decimal } from '@prisma/client/runtime/library';
import { AppError } from '../lib/errors.js';

export const discountController = {
  // ─── Admin CRUD ───

  async create(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const discount = await discountService.create(req.user!.restaurantId, req.body);
      res.status(201).json({ success: true, data: discount });
    } catch (err) { next(err); }
  },

  async update(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const discount = await discountService.update(req.params.id!, req.user!.restaurantId, req.body);
      res.json({ success: true, data: discount });
    } catch (err) { next(err); }
  },

  async delete(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await discountService.delete(req.params.id!, req.user!.restaurantId);
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async list(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const discounts = await discountService.list(req.user!.restaurantId);
      res.json({ success: true, data: discounts });
    } catch (err) { next(err); }
  },

  // ─── Coupon CRUD ───

  async createCoupon(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const coupon = await discountService.createCoupon(req.user!.restaurantId, req.body);
      res.status(201).json({ success: true, data: coupon });
    } catch (err) { next(err); }
  },

  async updateCoupon(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const coupon = await discountService.updateCoupon(req.params.id!, req.user!.restaurantId, req.body);
      res.json({ success: true, data: coupon });
    } catch (err) { next(err); }
  },

  async deleteCoupon(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await discountService.deleteCoupon(req.params.id!, req.user!.restaurantId);
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async listCoupons(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const coupons = await discountService.listCoupons(req.user!.restaurantId);
      res.json({ success: true, data: coupons });
    } catch (err) { next(err); }
  },

  // ─── Public: Validate coupon ───

  async validateCoupon(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { restaurantId } = req.params;
      if (!restaurantId) throw AppError.badRequest('Restaurant ID is required');
      const { code, subtotal, customerPhone } = req.body;
      if (!code || typeof code !== 'string' || code.length > 50) {
        throw AppError.badRequest('Valid coupon code is required');
      }
      const numSubtotal = Number(subtotal);
      if (isNaN(numSubtotal) || numSubtotal < 0) {
        throw AppError.badRequest('Valid subtotal is required');
      }
      const result = await discountService.validateCoupon(
        restaurantId,
        code.trim(),
        new Decimal(numSubtotal),
        customerPhone,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  // ─── Public: Get auto-apply discounts ───

  async getAutoApply(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { restaurantId } = req.params;
      if (!restaurantId) throw AppError.badRequest('Restaurant ID is required');
      const subtotalStr = req.query.subtotal as string || '0';
      const numSubtotal = Number(subtotalStr);
      if (isNaN(numSubtotal) || numSubtotal < 0) {
        throw AppError.badRequest('Valid subtotal is required');
      }
      const subtotal = new Decimal(numSubtotal);
      const discount = await discountService.getAutoApplyDiscounts(restaurantId, subtotal);
      res.json({ success: true, data: discount });
    } catch (err) { next(err); }
  },
};
