import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError, prisma } from '../lib/index.js';
import { cache } from '../lib/redis.js';
import type { AccessTokenPayload } from '../types/index.js';
import { UserRole } from '@prisma/client';

interface CachedUser {
  id: string;
  email: string;
  role: UserRole;
  restaurantId: string;
  isActive: boolean;
}

// Verify JWT access token
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw AppError.unauthorized('Access token required');
    }

    const payload = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;

    // Verify user still exists and is active (cached for 60s)
    const userCacheKey = `auth:user:${payload.userId}`;
    let user = await cache.get<CachedUser>(userCacheKey);

    if (!user) {
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, restaurantId: true, isActive: true },
      });

      if (!dbUser || !dbUser.isActive) {
        throw AppError.unauthorized('User not found or inactive');
      }

      user = dbUser;
      await cache.set(userCacheKey, dbUser, cache.ttl.short); // 60s TTL
    }

    if (!user.isActive) {
      throw AppError.unauthorized('User not found or inactive');
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    };
    req.restaurantId = user.restaurantId;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(AppError.unauthorized('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(AppError.unauthorized('Invalid token'));
    } else {
      next(error);
    }
  }
};

// Role-based authorization
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(AppError.forbidden('Insufficient permissions'));
      return;
    }

    next();
  };
};
