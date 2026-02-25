import Redis from 'ioredis';
import { config } from '../config/index.js';

const tlsOptions = config.redis.url.startsWith('rediss://') ? {
  rejectUnauthorized: config.isProduction,
} : undefined;

// Redis client for caching and pub/sub
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true,
  tls: tlsOptions,
});

// Redis for Socket.io adapter
export const pubClient = new Redis(config.redis.url, {
  tls: tlsOptions,
});
export const subClient = pubClient.duplicate();

redis.on('error', (err) => {
  // Avoid importing logger here to prevent circular dependency issues.
  // The logger depends on config, and redis is a low-level module.
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  // Startup log uses console because logger may not yet be initialised
  console.log('Redis connected (event)');
});

pubClient.on('error', (err) => {
  console.error('Redis pubClient error:', err);
});

subClient.on('error', (err) => {
  console.error('Redis subClient error:', err);
});

// Cache utilities
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        Number(cursor),
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = String(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  },

  // Restaurant-scoped cache keys
  keys: {
    menu: (restaurantId: string) => `menu:${restaurantId}`,
    categories: (restaurantId: string) => `categories:${restaurantId}`,
    tables: (restaurantId: string) => `tables:${restaurantId}`,
    restaurant: (slug: string) => `restaurant:${slug}`,
    order: (orderId: string) => `order:${orderId}`,
    activeOrders: (restaurantId: string) => `active-orders:${restaurantId}`,
  },

  // Default TTLs in seconds
  ttl: {
    short: 60,          // 1 minute
    medium: 300,        // 5 minutes
    long: 3600,         // 1 hour
    day: 86400,         // 24 hours
  },
};
