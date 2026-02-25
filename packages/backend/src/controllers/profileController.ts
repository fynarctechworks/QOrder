import { Request, Response, NextFunction } from 'express';
import { profileService } from '../services/profileService.js';
import type { ApiResponse } from '../types/index.js';
import { updateUsernameSchema, updateEmailSchema, changeProfilePasswordSchema } from '../validators/index.js';

export const profileController = {
  /** GET /profile */
  async getProfile(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const profile = await profileService.getProfile(req.user.id);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  /** POST /profile/send-otp */
  async sendOTP(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const result = await profileService.sendProfileOTP(req.user.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /profile/username */
  async updateUsername(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const parsed = updateUsernameSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid input' } });
        return;
      }
      const { username, otp } = parsed.data;
      const profile = await profileService.updateUsername(req.user.id, username.trim(), otp);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /profile/email */
  async updateEmail(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const parsed = updateEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid input' } });
        return;
      }
      const { email, otp } = parsed.data;
      const profile = await profileService.updateEmail(req.user.id, email.trim().toLowerCase(), otp);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  /** POST /profile/change-password */
  async changePassword(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const parsed = changeProfilePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid input' } });
        return;
      }
      const { currentPassword, newPassword, otp } = parsed.data;
      const result = await profileService.changePassword(req.user.id, currentPassword, newPassword, otp);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
};
