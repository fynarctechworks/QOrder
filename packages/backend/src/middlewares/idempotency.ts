import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const IDEMPOTENCY_TTL = 86400; // 24 hours
const KEY_PREFIX = 'idem:';

/**
 * Middleware that enforces idempotency for POST requests using the
 * `X-Idempotency-Key` header.  When a key is first seen the response is
 * cached for 24 h.  Subsequent requests with the same key receive the
 * cached response without hitting the handler again.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-idempotency-key'] as string | undefined;

  // If no key is provided, skip idempotency logic — let the request through.
  if (!key) {
    next();
    return;
  }

  // Basic sanity check — reject keys that are too long or contain invalid chars.
  if (key.length > 128 || !/^[\w\-:.]+$/.test(key)) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid idempotency key format' },
    });
    return;
  }

  const redisKey = `${KEY_PREFIX}${key}`;

  redis.get(redisKey)
    .then((cached) => {
      if (cached) {
        // Return the stored response
        try {
          const parsed = JSON.parse(cached) as { status: number; body: unknown };
          res.status(parsed.status).json(parsed.body);
        } catch {
          // Corrupted cache entry — delete and fall through
          redis.del(redisKey).catch(() => {});
          attachCapture(res, redisKey);
          next();
        }
        return;
      }

      // First time seeing this key — process normally and capture the response.
      attachCapture(res, redisKey);
      next();
    })
    .catch((err) => {
      // Redis down — proceed without idempotency (graceful degradation)
      logger.warn({ err }, 'Idempotency Redis lookup failed — proceeding without dedup');
      next();
    });
}

/** Monkey-patch `res.json` to capture the response and cache it. */
function attachCapture(res: Response, redisKey: string): void {
  const originalJson = res.json.bind(res);

  res.json = function capturedJson(body?: unknown) {
    // Only cache successful responses (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const toCache = JSON.stringify({ status: res.statusCode, body });
      redis.setex(redisKey, IDEMPOTENCY_TTL, toCache).catch((err) => {
        logger.warn({ err }, 'Failed to cache idempotent response');
      });
    }

    return originalJson(body);
  };
}
