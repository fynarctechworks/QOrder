import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Build a RedisStore that falls back to the default MemoryStore
 * when Redis is unavailable (connection lost).
 */
function createRedisStore(prefix: string) {
  try {
    return new RedisStore({
      // `sendCommand` is the only required option for ioredis
      sendCommand: (...args: string[]) =>
        redis.call(args[0]!, ...args.slice(1)) as ReturnType<RedisStore['sendCommand']>,
      prefix: `rl:${prefix}:`,
    });
  } catch (err) {
    logger.warn({ err }, 'Redis unavailable for rate-limiter — using MemoryStore');
    return undefined; // express-rate-limit defaults to MemoryStore
  }
}

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('api'),
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many requests, please try again later'));
  },
});

// Auth rate limiter (stricter)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: createRedisStore('auth'),
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many login attempts, please try again later'));
  },
});

// Order submission rate limiter
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('order'),
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many orders submitted, please wait'));
  },
});
