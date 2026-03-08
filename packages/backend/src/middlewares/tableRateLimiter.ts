import type { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Per-table rate limiter using Redis sliding window counters.
 * Limits the number of orders (or group submits) per table within a time window.
 *
 * Defaults: max 10 orders per table per hour.
 */
const TABLE_RATE_LIMIT_WINDOW_S = 60 * 60; // 1 hour
const TABLE_RATE_LIMIT_MAX = 10;

/**
 * Middleware factory for table-based rate limiting.
 * Expects `req.params.tableId` or `req.body.tableId` to identify the table.
 */
export function tableRateLimiter(opts?: { windowSeconds?: number; max?: number }) {
  const windowS = opts?.windowSeconds ?? TABLE_RATE_LIMIT_WINDOW_S;
  const max = opts?.max ?? TABLE_RATE_LIMIT_MAX;

  return async (req: Request, _res: Response, next: NextFunction) => {
    // Resolve tableId from route params, body, or skip if not present
    const tableId =
      (req as any).params?.tableId ||
      (req as any).body?.tableId;

    if (!tableId) {
      // No table context — skip per-table rate limiting (e.g. takeaway)
      return next();
    }

    const key = `rl:table:${tableId}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        // First hit — set expiry
        await redis.expire(key, windowS);
      }

      if (current > max) {
        logger.warn({ tableId, current, max }, 'Table rate limit exceeded');
        return next(
          AppError.tooManyRequests(
            'Too many orders from this table. Please wait before ordering again.'
          )
        );
      }
    } catch (err) {
      // Redis unavailable — fail open
      logger.error({ err, tableId }, 'Table rate-limiter Redis error — skipping');
    }

    next();
  };
}
