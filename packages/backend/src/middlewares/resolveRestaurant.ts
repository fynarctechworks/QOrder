import { Request, Response, NextFunction } from 'express';
import { prisma, AppError } from '../lib/index.js';

interface RestaurantMiddlewareData {
  taxRate: unknown;
  settings: unknown;
}

/**
 * Middleware to resolve a restaurant from the :slug route param
 * and attach restaurantId + restaurantData to the request.
 */
export const resolveRestaurant = async (
  req: Request<{ slug: string }>,
  _res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, isActive: true, taxRate: true, settings: true },
    });

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    if (!restaurant.isActive) {
      throw AppError.forbidden('Restaurant is not active');
    }

    req.restaurantId = restaurant.id;
    (req as unknown as { restaurantData: RestaurantMiddlewareData }).restaurantData = {
      taxRate: restaurant.taxRate,
      settings: restaurant.settings,
    };
    next();
  } catch (error) {
    next(error);
  }
};
