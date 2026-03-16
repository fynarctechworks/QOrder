import { Request, Response, NextFunction } from 'express';
import { onboardingService } from '../services/onboardingService.js';
import type { ApiResponse } from '../types/index.js';

export const onboardingController = {
  async getStatus(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const result = await onboardingService.getStatus(req.user!.restaurantId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async updateBusinessProfile(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const result = await onboardingService.updateBusinessProfile(req.user!.restaurantId, req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async setupBranch(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await onboardingService.setupBranch(req.user!.restaurantId, req.body);
      res.json({ success: true, data: { message: 'Branch setup complete' } });
    } catch (error) {
      next(error);
    }
  },

  async updateTaxCurrency(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await onboardingService.updateTaxCurrency(req.user!.restaurantId, req.body);
      res.json({ success: true, data: { message: 'Tax & currency updated' } });
    } catch (error) {
      next(error);
    }
  },

  async skipStep(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { step } = req.body;
      await onboardingService.skipStep(req.user!.restaurantId, step);
      res.json({ success: true, data: { message: `Step "${step}" skipped` } });
    } catch (error) {
      next(error);
    }
  },

  async completeMenuSetup(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await onboardingService.completeMenuSetup(req.user!.restaurantId);
      res.json({ success: true, data: { message: 'Menu setup marked complete' } });
    } catch (error) {
      next(error);
    }
  },

  async completeTableSetup(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await onboardingService.completeTableSetup(req.user!.restaurantId);
      res.json({ success: true, data: { message: 'Table setup marked complete' } });
    } catch (error) {
      next(error);
    }
  },
};
