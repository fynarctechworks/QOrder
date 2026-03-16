import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { twoFactorService } from '../services/twoFactorService.js';
import { prisma, AppError } from '../lib/index.js';
import type { ApiResponse } from '../types/index.js';

const db = prisma as any;

export const twoFactorController = {
  /** Generate 2FA secret and QR code URI */
  async setup(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const result = await twoFactorService.generateSecret(req.user!.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /** Verify TOTP code and enable 2FA */
  async enable(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { code } = req.body;
      const result = await twoFactorService.enable(req.user!.id, code);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /** Disable 2FA (requires password) */
  async disable(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { password } = req.body;
      const user = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { passwordHash: true },
      });
      if (!user) throw AppError.notFound('User');

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw AppError.unauthorized('Invalid password');

      await twoFactorService.disable(req.user!.id);
      res.json({ success: true, data: { message: '2FA disabled' } });
    } catch (error) {
      next(error);
    }
  },

  /** Get 2FA status */
  async status(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { twoFactorEnabled: true },
      });
      res.json({ success: true, data: { enabled: user?.twoFactorEnabled || false } });
    } catch (error) {
      next(error);
    }
  },
};
