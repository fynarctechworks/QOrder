import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { restaurantService } from '../services/index.js';
import { prisma, AppError } from '../lib/index.js';
import type { ApiResponse } from '../types/index.js';
import type { UpdateRestaurantInput, UpdateRestaurantSettingsInput } from '../validators/index.js';

export const restaurantController = {
  async getRestaurant(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const restaurant = await restaurantService.getById(restaurantId);

      // Strip secrets from settings before sending to client
      if (restaurant && restaurant.settings) {
        const settings = { ...(restaurant.settings as Record<string, unknown>) };
        const hasLockPin = typeof settings.lockPin === 'string' && settings.lockPin.length > 0;
        delete settings.lockPin;
        (settings as Record<string, unknown>).hasLockPin = hasLockPin;

        // Mask WhatsApp Access Token
        if (typeof settings.whatsappAccessToken === 'string' && settings.whatsappAccessToken.length > 0) {
          const token = settings.whatsappAccessToken as string;
          settings.whatsappAccessToken = token.length > 4
            ? '••••' + token.slice(-4)
            : '••••••••';
        }

        // Mask Twilio Auth Token
        if (typeof settings.twilioAuthToken === 'string' && settings.twilioAuthToken.length > 0) {
          const token = settings.twilioAuthToken as string;
          settings.twilioAuthToken = token.length > 4
            ? '••••' + token.slice(-4)
            : '••••••••';
        }

        (restaurant as Record<string, unknown>).settings = settings;
      }

      res.json({
        success: true,
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  },

  async getPublicRestaurant(
    req: Request<{ slug: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurant = await restaurantService.getBySlug(req.params.slug);

      res.json({
        success: true,
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  },

  async getById(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurant = await restaurantService.getById(req.params.id);

      res.json({
        success: true,
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateRestaurant(
    req: Request<unknown, unknown, UpdateRestaurantInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const restaurant = await restaurantService.update(restaurantId, req.body);

      res.json({
        success: true,
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(
    req: Request<unknown, unknown, UpdateRestaurantSettingsInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      console.log('[updateSettings] raw body:', JSON.stringify(req.body));
      const { password, ...settingsPayload } = req.body as UpdateRestaurantSettingsInput & { password?: string };
      console.log('[updateSettings] settingsPayload:', JSON.stringify(settingsPayload));

      // When turning off acceptsOrders, require password confirmation
      if (settingsPayload.acceptsOrders === false) {
        if (!password) {
          throw AppError.badRequest('Password is required to disable order acceptance');
        }

        const user = await prisma.user.findUnique({
          where: { id: req.user!.id },
          select: { passwordHash: true },
        });

        if (!user) {
          throw AppError.unauthorized('User not found');
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          throw AppError.unauthorized('Incorrect password');
        }
      }

      const restaurant = await restaurantService.updateSettings(restaurantId, settingsPayload);

      res.json({
        success: true,
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  },

  async getDashboardStats(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const stats = await restaurantService.getDashboardStats(restaurantId, req.branchId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUsers(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const users = await restaurantService.getUsers(restaurantId);

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  },
};
