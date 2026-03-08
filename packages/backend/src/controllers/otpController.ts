import { Request, Response, NextFunction } from 'express';
import { otpService, validatePhoneFormat, isTwilioConfigured } from '../services/otpService.js';
import type { ApiResponse } from '../types/index.js';

export const otpController = {
  /**
   * POST /api/public/otp/send
   * Body: { phone, restaurantId, tableId }
   * Sends OTP if verification is required; otherwise validates format only.
   */
  async sendOtp(
    req: Request<unknown, unknown, { phone: string; restaurantId: string; tableId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { phone, restaurantId, tableId } = req.body;

      if (!phone || !restaurantId || !tableId) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'phone, restaurantId, and tableId are required' },
        } as unknown as ApiResponse);
      }

      // Always validate format
      const validation = validatePhoneFormat(phone);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validation.reason! },
        } as unknown as ApiResponse);
      }

      // Check if OTP verification is enabled for this branch
      // Get table to find branchId
      const { prisma } = await import('../lib/index.js');
      const table = await prisma.table.findUnique({
        where: { id: tableId },
        select: { branchId: true },
      });

      const isRequired = await otpService.isPhoneVerificationRequired(restaurantId, table?.branchId);

      if (!isRequired) {
        // OTP not required — just save the phone (format-validated only)
        await otpService.savePhoneToSession(restaurantId, tableId, phone, false);
        return res.json({
          success: true,
          data: { otpRequired: false, phoneSaved: true },
        });
      }

      if (!isTwilioConfigured()) {
        // OTP required but Twilio not configured — save phone without verification
        await otpService.savePhoneToSession(restaurantId, tableId, phone, false);
        return res.json({
          success: true,
          data: { otpRequired: false, phoneSaved: true },
        });
      }

      // If the active session already has this phone verified, skip OTP
      const sessionStatus = await otpService.getSessionPhoneStatus(restaurantId, tableId);
      if (sessionStatus.phoneVerified && sessionStatus.phone === phone) {
        return res.json({
          success: true,
          data: { otpRequired: false, phoneSaved: true },
        });
      }

      // OTP required and Twilio configured — send via Twilio
      const result = await otpService.sendOtp(phone);
      res.json({
        success: true,
        data: { otpRequired: true, sent: result.sent },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/public/otp/verify
   * Body: { phone, code, restaurantId, tableId }
   */
  async verifyOtp(
    req: Request<unknown, unknown, { phone: string; code: string; restaurantId: string; tableId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { phone, code, restaurantId, tableId } = req.body;

      if (!phone || !code || !restaurantId || !tableId) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'phone, code, restaurantId, and tableId are required' },
        } as unknown as ApiResponse);
      }

      const result = await otpService.verifyOtp(phone, code);

      // Save to session as verified
      await otpService.savePhoneToSession(restaurantId, tableId, phone, result.verified);

      res.json({
        success: true,
        data: { verified: result.verified },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/public/:restaurantId/tables/:tableId/phone-status
   * Returns whether the current session has a phone and if it's verified.
   */
  async getPhoneStatus(
    req: Request<{ restaurantId: string; tableId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { restaurantId, tableId } = req.params;

      // Get table to find branchId
      const { prisma } = await import('../lib/index.js');
      const table = await prisma.table.findUnique({
        where: { id: tableId },
        select: { branchId: true },
      });

      const isRequired = await otpService.isPhoneVerificationRequired(restaurantId, table?.branchId);
      const phoneStatus = await otpService.getSessionPhoneStatus(restaurantId, tableId);

      res.json({
        success: true,
        data: {
          requirePhoneVerification: isRequired,
          otpEnabled: isRequired && isTwilioConfigured(),
          ...phoneStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
