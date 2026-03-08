import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/index.js';

/**
 * Middleware that resolves branch context from the `X-Branch-Id` header.
 * 
 * - If the header is present and valid, `req.branchId` is set to that branch ID.
 * - If the header is absent or empty, `req.branchId` is null (all branches).
 * - If the header is present but the branch doesn't belong to the user's restaurant,
 *   it silently falls back to null (all branches).
 * 
 * Must be used AFTER `authenticate` middleware.
 */
export const resolveBranch = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const branchIdHeader = req.headers['x-branch-id'] as string | undefined;

    if (!branchIdHeader || branchIdHeader === 'all') {
      req.branchId = null;
      return next();
    }

    const restaurantId = req.restaurantId;
    if (!restaurantId) {
      req.branchId = null;
      return next();
    }

    // Verify the branch belongs to this restaurant and is active
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchIdHeader,
        restaurantId,
        isActive: true,
      },
      select: { id: true },
    });

    req.branchId = branch ? branch.id : null;
    next();
  } catch {
    // Non-critical — fall back to all branches
    req.branchId = null;
    next();
  }
};
