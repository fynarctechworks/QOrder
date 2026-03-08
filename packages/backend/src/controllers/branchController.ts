import { Request, Response, NextFunction } from 'express';
import { branchService } from '../services/branchService.js';
import type { ApiResponse } from '../types/index.js';

export const branchController = {
  /**
   * GET /api/branches
   */
  async getBranches(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const branches = await branchService.getBranches(restaurantId);

      res.json({ success: true, data: branches });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/branches/:id
   */
  async getBranchById(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const branch = await branchService.getById(req.params.id, restaurantId);

      res.json({ success: true, data: branch });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/branches
   */
  async createBranch(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const branch = await branchService.create(restaurantId, req.body);

      res.status(201).json({ success: true, data: branch });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/branches/:id
   */
  async updateBranch(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const branch = await branchService.update(req.params.id, restaurantId, req.body);

      res.json({ success: true, data: branch });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/branches/:id
   */
  async deleteBranch(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      await branchService.delete(req.params.id, restaurantId);

      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/branches/:id/users
   * Body: { userIds: string[] }
   */
  async assignUsers(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const { userIds } = req.body as { userIds: string[] };
      await branchService.assignUsers(req.params.id, restaurantId, userIds);

      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/branches/:id/users
   * Body: { userIds: string[] }
   */
  async removeUsers(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const { userIds } = req.body as { userIds: string[] };
      await branchService.removeUsers(req.params.id, restaurantId, userIds);

      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/branches/my
   * Get branches assigned to the current user.
   */
  async getMyBranches(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const userId = req.user!.id;
      const branches = await branchService.getUserBranches(userId, restaurantId);

      res.json({ success: true, data: branches });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/branches/:id/settings
   */
  async getSettings(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const result = await branchService.getSettings(req.params.id, restaurantId);

      // Strip raw lockPin hash — expose only hasLockPin boolean
      if (result.settings) {
        const settings = { ...result.settings };
        const hasLockPin = typeof settings.lockPin === 'string' && (settings.lockPin as string).length > 0;
        delete settings.lockPin;
        settings.hasLockPin = hasLockPin;
        result.settings = settings;
      }

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/branches/:id/settings
   */
  async updateSettings(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const restaurantId = req.restaurantId!;
      const branch = await branchService.updateSettings(req.params.id, restaurantId, req.body);

      res.json({ success: true, data: branch });
    } catch (error) {
      next(error);
    }
  },
};
