import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/subscriptionService.js';
import { onboardingService } from '../services/onboardingService.js';
import { verifyRazorpaySignature } from '../lib/razorpay.js';
import type { ApiResponse } from '../types/index.js';
import { logger } from '../lib/index.js';

export const subscriptionController = {
  async getPlans(_req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const plans = await subscriptionService.getPlans();
      res.json({ success: true, data: plans });
    } catch (error) {
      next(error);
    }
  },

  async getSubscription(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const subscription = await subscriptionService.getSubscription(req.user!.restaurantId);
      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  },

  async createPaymentOrder(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { planId, billingCycle } = req.body;
      const order = await subscriptionService.createPaymentOrder(req.user!.restaurantId, planId, billingCycle);
      res.json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  },

  async verifyPayment(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { planId, billingCycle, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      const subscription = await subscriptionService.verifyAndActivate(
        req.user!.restaurantId,
        planId,
        billingCycle,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      );

      // Mark plan selection in onboarding
      await onboardingService.completePlanSelection(req.user!.restaurantId);

      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  },

  async startTrial(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const subscription = await subscriptionService.startTrial(req.user!.restaurantId);
      await onboardingService.completePlanSelection(req.user!.restaurantId);
      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  },

  /** Razorpay webhook handler (public, verified via signature) */
  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const body = JSON.stringify(req.body);

      if (!signature || !verifyRazorpaySignature(body, signature)) {
        res.status(400).json({ success: false, error: 'Invalid signature' });
        return;
      }

      const event = req.body.event;
      logger.info(`Razorpay webhook: ${event}`);

      // Handle relevant events
      if (event === 'payment.captured') {
        // Payment already verified via client-side flow
        logger.info('Payment captured via webhook', req.body.payload?.payment?.entity?.id);
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
