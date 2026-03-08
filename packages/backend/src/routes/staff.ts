import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/validate.js';
import { createUserSchema, updateUserSchema } from '../validators/index.js';
import { staffService } from '../services/staffService.js';
import { z } from 'zod';
import type { ApiResponse } from '../types/index.js';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// All staff routes require authentication + OWNER role
router.use(authenticate);
router.use(authorize('OWNER'));
router.use(resolveBranch);

// Extend createUserSchema with username
const createStaffSchema = createUserSchema.extend({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  branchIds: z.array(z.string().uuid()).optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const updateBranchesSchema = z.object({
  branchIds: z.array(z.string().uuid()).default([]),
});

// GET /api/staff — List all staff (always show all, regardless of branch)
router.get('/', async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const staff = await staffService.list(req.restaurantId!);
    res.json({ success: true, data: staff });
  } catch (error) {
    next(error);
  }
});

// POST /api/staff — Create staff member
router.post(
  '/',
  validate(createStaffSchema),
  async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const user = await staffService.create(req.restaurantId!, req.body, req.branchId);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/staff/:id — Update staff member
router.patch(
  '/:id',
  validate(updateUserSchema),
  async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const user = await staffService.update(
        req.params.id!,
        req.restaurantId!,
        req.user!.id,
        req.body
      );
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/staff/:id/reset-password — Reset staff password
router.post(
  '/:id/reset-password',
  validate(resetPasswordSchema),
  async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const result = await staffService.resetPassword(
        req.params.id!,
        req.restaurantId!,
        req.body.newPassword
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/staff/:id — Delete staff member
router.delete(
  '/:id',
  async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const result = await staffService.remove(
        req.params.id!,
        req.restaurantId!,
        req.user!.id
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/staff/:id/branches — Update branch assignments
router.patch(
  '/:id/branches',
  validate(updateBranchesSchema),
  async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const result = await staffService.updateBranches(
        req.params.id!,
        req.restaurantId!,
        req.body.branchIds
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
