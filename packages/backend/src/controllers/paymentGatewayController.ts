import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types/index.js';
import { paymentGatewayService } from '../services/paymentGatewayService.js';
import { AppError } from '../lib/errors.js';

export const paymentGatewayController = {
  /**
   * GET /api/public/:restaurantId/payment/config
   * Returns public checkout config (key, mode, currency).
   */
  async getCheckoutConfig(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.params.restaurantId!;
      const config = await paymentGatewayService.getCheckoutConfig(restaurantId);
      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/public/:restaurantId/payment/create-order
   * Create a Razorpay order for online payment.
   */
  async createOrder(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.params.restaurantId!;
      const { orderId, sessionId, amount, currency } = req.body;

      // Validate amount is a positive number
      const numAmount = Number(amount);
      if (!amount || isNaN(numAmount) || numAmount <= 0 || numAmount > 10000000) {
        throw AppError.badRequest('Invalid payment amount');
      }

      const gatewayOrder = await paymentGatewayService.createGatewayOrder({
        restaurantId,
        orderId,
        sessionId,
        amount: numAmount,
        currency: currency || 'INR',
      });

      res.json({ success: true, data: gatewayOrder });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/public/:restaurantId/payment/verify
   * Verify payment after Razorpay checkout.
   */
  async verifyPayment(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.params.restaurantId!;
      const {
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
        orderId,
        sessionId,
        branchId,
      } = req.body;

      const payment = await paymentGatewayService.verifyAndRecordPayment({
        restaurantId,
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
        orderId,
        sessionId,
        branchId,
      });

      res.json({ success: true, data: { paymentId: payment.id, status: payment.status } });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/payments/:paymentId/refund  (admin, authenticated)
   * Process a refund for an online payment.
   */
  async refundPayment(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const paymentId = req.params.paymentId!;
      const { amount, reason } = req.body;

      // Validate refund amount if provided
      if (amount !== undefined) {
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
          throw AppError.badRequest('Invalid refund amount');
        }
      }

      const restaurantId = req.user!.restaurantId;
      const refund = await paymentGatewayService.refundPayment({
        paymentId,
        restaurantId,
        amount: amount ? Number(amount) : undefined,
        reason,
      });

      res.json({ success: true, data: refund });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/payment/webhook
   * Razorpay webhook handler.
   */
  async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = (req as any).rawBody as string;

      if (!signature || !rawBody) {
        res.status(400).json({ success: false, error: { message: 'Missing signature or body' } });
        return;
      }

      const result = await paymentGatewayService.handleWebhook(rawBody, signature);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
};
