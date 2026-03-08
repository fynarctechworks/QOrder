import { vi, afterEach } from 'vitest';

// ── Hoisted mocks (available inside vi.mock factories) ─────
const { mockRedisInstance, prismaClient, mockCache } = vi.hoisted(() => {
  const mockRedisInstance = {
    status: 'ready',
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(['0', []]),
    call: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    duplicate: vi.fn(),
    on: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
  };
  mockRedisInstance.duplicate.mockReturnValue(mockRedisInstance);

  const prismaClient: Record<string, any> = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(async (fn: any) => fn(prismaClient)),
    user: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    restaurant: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    refreshToken: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    order: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    orderItem: { create: vi.fn(), createMany: vi.fn() },
    table: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    tableSession: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuItem: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    payment: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    section: { findFirst: vi.fn(), findMany: vi.fn() },
    branch: { findFirst: vi.fn(), findMany: vi.fn() },
    discount: { findFirst: vi.fn(), findMany: vi.fn() },
  };

  const mockCache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    delPattern: vi.fn().mockResolvedValue(undefined),
    keys: {
      menu: (restaurantId: string, branchId?: string | null) => branchId ? `menu:${restaurantId}:${branchId}` : `menu:${restaurantId}`,
      categories: (restaurantId: string, branchId?: string | null) => branchId ? `categories:${restaurantId}:${branchId}` : `categories:${restaurantId}`,
      tables: (restaurantId: string) => `tables:${restaurantId}`,
      restaurant: (slug: string) => `restaurant:${slug}`,
      order: (orderId: string) => `order:${orderId}`,
      activeOrders: (restaurantId: string) => `active-orders:${restaurantId}`,
    },
    ttl: {
      short: 60,
      medium: 300,
      long: 3600,
      day: 86400,
    },
  };

  return { mockRedisInstance, prismaClient, mockCache };
});

// ── Mock ioredis ────────────────────────────────────────────
vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedisInstance),
}));

// ── Mock lib/prisma.js ──────────────────────────────────────
vi.mock('../lib/prisma.js', () => ({
  prisma: prismaClient,
}));

// ── Mock lib/index.js (re-exports prisma, cache, AppError, logger) ──
vi.mock('../lib/index.js', async () => {
  const { AppError } = await vi.importActual('../lib/errors.js') as any;
  return {
    prisma: prismaClient,
    redis: mockRedisInstance,
    pubClient: mockRedisInstance,
    subClient: mockRedisInstance,
    cache: mockCache,
    AppError,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
  };
});

// ── Mock lib/redis.js ──────────────────────────────────────
vi.mock('../lib/redis.js', () => ({
  redis: mockRedisInstance,
  pubClient: mockRedisInstance,
  subClient: mockRedisInstance,
  cache: mockCache,
}));

// ── Mock email service ──────────────────────────────────────
vi.mock('../services/emailService.js', () => ({
  generateOTP: vi.fn(() => '123456'),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock logger ─────────────────────────────────────────────
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ── Import prisma so tests can reference the mock ───────────
import { prisma } from '../lib/prisma.js';
const mockPrisma = prisma as any;

// ── Reset mocks after each test ─────────────────────────────
afterEach(() => {
  vi.clearAllMocks();
});

// ── Export for use in test files ─────────────────────────────
export { mockPrisma, mockRedisInstance, mockCache };
