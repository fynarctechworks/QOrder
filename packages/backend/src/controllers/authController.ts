import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/index.js';
import { config } from '../config/index.js';
import type { ApiResponse } from '../types/index.js';
import type { LoginInput, RegisterInput } from '../validators/index.js';

const REFRESH_TOKEN_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? 'none' as const : 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

/** clearCookie must include sameSite + secure to match how the cookie was set (cross-origin). */
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? 'none' as const : 'lax' as const,
  path: '/',
};

export const authController = {
  async register(
    req: Request<unknown, unknown, RegisterInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const result = await authService.register(req.body);

      // Registration now requires email verification — no tokens yet
      res.status(201).json({
        success: true,
        data: {
          message: result.message,
          email: result.email,
          requiresVerification: result.requiresVerification,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyEmail(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { email, code } = req.body;
      const result = await authService.verifyEmail(email, code);

      // Set refresh token as HttpOnly cookie
      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, COOKIE_OPTIONS);

      res.json({
        success: true,
        data: {
          user: result.user,
          restaurant: result.restaurant,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async resendVerification(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { email } = req.body;
      const result = await authService.resendVerificationCode(email);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async login(
    req: Request<unknown, unknown, LoginInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const result = await authService.login(req.body);

      // If 2FA is required, don't issue tokens yet
      if (result.requires2FA) {
        res.json({
          success: true,
          data: {
            requires2FA: true,
            userId: result.userId,
          },
        });
        return;
      }

      // Set refresh token as HttpOnly cookie
      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken!, COOKIE_OPTIONS);

      res.json({
        success: true,
        data: {
          user: result.user,
          restaurant: result.restaurant,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyTwoFactor(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { userId, code } = req.body;
      if (!userId || !code) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'userId and code are required' },
        });
        return;
      }

      const result = await authService.verifyTwoFactorLogin(userId, code);

      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, COOKIE_OPTIONS);

      res.json({
        success: true,
        data: {
          user: result.user,
          restaurant: result.restaurant,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async refresh(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      // Get refresh token from cookie or body
      const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE] || req.body.refreshToken;

      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Refresh token required',
          },
        });
        return;
      }

      const result = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      // Clear invalid cookie
      res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_COOKIE_OPTIONS);
      next(error);
    }
  },

  async logout(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_COOKIE_OPTIONS);

      res.json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (error) {
      next(error);
    }
  },

  async logoutAll(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      await authService.logoutAll(req.user.id);

      res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_COOKIE_OPTIONS);

      res.json({
        success: true,
        data: { message: 'Logged out from all devices' },
      });
    } catch (error) {
      next(error);
    }
  },

  async me(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      res.json({
        success: true,
        data: {
          user: req.user,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      await authService.changePassword(req.user.id, currentPassword, newPassword);

      res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_COOKIE_OPTIONS);

      res.json({
        success: true,
        data: { message: 'Password changed successfully. Please login again.' },
      });
    } catch (error) {
      next(error);
    }
  },

  async forgotPassword(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(email);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const { email, code, newPassword } = req.body;
      const result = await authService.resetPassword(email, code, newPassword);

      res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_COOKIE_OPTIONS);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
