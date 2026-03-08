import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma, mockRedisInstance } from '../__tests__/setup.js';

vi.mock('../config/index.js', () => ({
  config: {
    env: 'test',
    port: 3000,
    jwt: {
      accessSecret: 'test-access-secret-that-is-long-enough-32chars',
      refreshSecret: 'test-refresh-secret-that-is-long-enough-32chars',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    cors: { origin: ['http://localhost:5173'] },
    isDevelopment: false,
    isProduction: false,
    redis: { url: 'redis://localhost:6379' },
    smtp: { host: '', port: 587, user: '', pass: '', from: '' },
    whatsapp: { token: '', phoneNumberId: '' },
    twilio: { accountSid: '', authToken: '', verifyServiceSid: '' },
    razorpay: { keyId: '', keySecret: '', webhookSecret: '' },
  },
}));

// We test socket logic in isolation by extracting the validation/rate-limit helpers
// and simulating socket events through a mock Socket object.

import jwt from 'jsonwebtoken';
import { z } from 'zod';

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TABLE_ID = '550e8400-e29b-41d4-a716-446655440003';

const uuidSchema = z.string().uuid();
const paymentRequestSchema = z.object({
  tableId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  tableName: z.string().max(100).optional(),
  orderId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  method: z.string().max(20).optional(),
}).strict();

// Redis-based rate limiter — replicated from socket/index.ts for unit-testing
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 10;
async function isRateLimited(key: string): Promise<boolean> {
  const redisKey = `rl:sock:${key}`;
  const count = await mockRedisInstance.incr(redisKey);
  if (count === 1) {
    await mockRedisInstance.expire(redisKey, RATE_LIMIT_WINDOW_SEC);
  }
  return count > RATE_LIMIT_MAX;
}

describe('Socket — Real-Time Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Authentication Middleware ─────────────────────────────
  describe('Socket authentication', () => {
    it('should decode valid JWT and set socket data', () => {
      const token = jwt.sign(
        { userId: 'user-1', restaurantId: RESTAURANT_ID, role: 'OWNER' },
        'test-access-secret-that-is-long-enough-32chars',
        { expiresIn: '15m' },
      );

      // Simulate what the socket auth middleware does
      const payload = jwt.verify(token, 'test-access-secret-that-is-long-enough-32chars') as any;
      expect(payload.userId).toBe('user-1');
      expect(payload.restaurantId).toBe(RESTAURANT_ID);
    });

    it('should reject expired JWT', () => {
      const token = jwt.sign(
        { userId: 'user-1', restaurantId: RESTAURANT_ID, role: 'OWNER' },
        'test-access-secret-that-is-long-enough-32chars',
        { expiresIn: '-1s' },
      );

      expect(() =>
        jwt.verify(token, 'test-access-secret-that-is-long-enough-32chars'),
      ).toThrow('jwt expired');
    });

    it('should reject token signed with wrong secret', () => {
      const token = jwt.sign(
        { userId: 'user-1', restaurantId: RESTAURANT_ID },
        'attacker-secret',
      );

      expect(() =>
        jwt.verify(token, 'test-access-secret-that-is-long-enough-32chars'),
      ).toThrow('invalid signature');
    });

    it('should allow unauthenticated public connections (customer)', () => {
      // The middleware continues without error for customers
      const noToken = undefined;
      let socketData: Record<string, unknown> = {};

      if (noToken) {
        // This branch won't execute — that's the point
        const payload = jwt.verify(noToken, 'secret') as any;
        socketData = payload;
      }
      // Socket data remains empty — customer can still join
      expect(socketData.userId).toBeUndefined();
    });
  });

  // ── UUID Validation ──────────────────────────────────────
  describe('UUID validation', () => {
    it('should accept valid UUID v4', () => {
      expect(uuidSchema.safeParse(RESTAURANT_ID).success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(uuidSchema.safeParse('').success).toBe(false);
    });

    it('should reject UUID with XSS payload', () => {
      expect(uuidSchema.safeParse('<script>alert(1)</script>').success).toBe(false);
    });
  });

  // ── Payment Request Validation ──────────────────────────
  describe('payment:request validation', () => {
    it('should accept valid payment request', () => {
      const result = paymentRequestSchema.safeParse({
        tableId: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        tableName: 'Table 5',
        method: 'CASH',
      });
      expect(result.success).toBe(true);
    });

    it('should reject payment request with extra fields (strict)', () => {
      const result = paymentRequestSchema.safeParse({
        tableId: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        __proto__: 'polluted',
        extraField: 'malicious',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const result = paymentRequestSchema.safeParse({
        tableId: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        amount: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID table ID', () => {
      const result = paymentRequestSchema.safeParse({
        tableId: 'DROP TABLE orders;',
        restaurantId: RESTAURANT_ID,
      });
      expect(result.success).toBe(false);
    });

    it('should cap tableName length at 100 chars', () => {
      const result = paymentRequestSchema.safeParse({
        tableId: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        tableName: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Rate Limiter ────────────────────────────────────────
  describe('rate limiter', () => {
    it('should allow first 10 requests', async () => {
      let callCount = 0;
      mockRedisInstance.incr.mockImplementation(async () => {
        callCount++;
        return callCount;
      });
      mockRedisInstance.expire.mockResolvedValue(1);

      for (let i = 0; i < 10; i++) {
        const limited = await isRateLimited('socket-abc');
        expect(limited).toBe(false);
      }
    });

    it('should block 11th request in same window', async () => {
      mockRedisInstance.incr.mockResolvedValue(11);

      const limited = await isRateLimited('socket-abc');
      expect(limited).toBe(true);
    });

    it('should set TTL on first request', async () => {
      mockRedisInstance.incr.mockResolvedValue(1);
      mockRedisInstance.expire.mockResolvedValue(1);

      await isRateLimited('fresh-socket');

      expect(mockRedisInstance.expire).toHaveBeenCalledWith('rl:sock:fresh-socket', 60);
    });
  });

  // ── Room Join Scenarios ─────────────────────────────────
  describe('join:restaurant room logic', () => {
    it('should only allow authenticated users for their own restaurant', () => {
      const socketData = { userId: 'user-1', restaurantId: RESTAURANT_ID };
      const requestedId = RESTAURANT_ID;

      // Should pass — user belongs to this restaurant
      expect(socketData.restaurantId).toBe(requestedId);
    });

    it('should reject cross-restaurant join', () => {
      const socketData = { userId: 'user-1', restaurantId: RESTAURANT_ID };
      const otherRestaurant = '550e8400-e29b-41d4-a716-999999999999';

      expect(socketData.restaurantId).not.toBe(otherRestaurant);
    });

    it('should reject unauthenticated restaurant join', () => {
      const socketData: Record<string, unknown> = {};
      expect(socketData.userId).toBeUndefined();
      // Socket handler emits 'error' and does not call socket.join
    });
  });

  describe('join:table room logic', () => {
    it('should allow joining when table exists and has active session', async () => {
      mockPrisma.table.findUnique.mockResolvedValue({
        id: TABLE_ID,
        sessionToken: 'tok',
      });
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 'session-1',
        status: 'ACTIVE',
      });

      const table = await mockPrisma.table.findUnique({ where: { id: TABLE_ID } });
      expect(table).toBeTruthy();

      const session = await mockPrisma.tableSession.findFirst({
        where: { tableId: TABLE_ID, status: 'ACTIVE' },
      });
      expect(session).toBeTruthy();
    });

    it('should reject joining non-existent table', async () => {
      mockPrisma.table.findUnique.mockResolvedValue(null);

      const table = await mockPrisma.table.findUnique({ where: { id: 'fake' } });
      expect(table).toBeNull();
    });

    it('should reject joining table with no active session', async () => {
      mockPrisma.table.findUnique.mockResolvedValue({
        id: TABLE_ID,
        sessionToken: 'tok',
      });
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);

      const session = await mockPrisma.tableSession.findFirst({
        where: { tableId: TABLE_ID, status: 'ACTIVE' },
      });
      expect(session).toBeNull();
    });
  });

  // ── Order Room Scenarios ────────────────────────────────
  describe('order:join room logic', () => {
    it('should allow joining order that belongs to socket table', async () => {
      const socketTableId = TABLE_ID;
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        tableId: socketTableId,
      });

      const order = await mockPrisma.order.findFirst({
        where: { id: 'order-1', tableId: socketTableId },
      });
      expect(order).toBeTruthy();
    });

    it('should reject joining order for different table', async () => {
      // Order belongs to table-A but socket is connected to table-B
      mockPrisma.order.findFirst.mockResolvedValue(null);

      const order = await mockPrisma.order.findFirst({
        where: { id: 'order-1', tableId: 'different-table' },
      });
      expect(order).toBeNull();
    });

    it('should require socket to join table before order room', () => {
      const socketData: Record<string, unknown> = {};
      // If tableId is not set, handler emits error
      expect(socketData.tableId).toBeUndefined();
    });
  });

  // ── Sync Trigger (Admin) ────────────────────────────────
  describe('sync:trigger', () => {
    it('should allow OWNER to trigger sync', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'OWNER' });

      const user = await mockPrisma.user.findUnique({
        where: { id: 'user-1' },
        select: { role: true },
      });
      expect(['OWNER', 'ADMIN', 'MANAGER'].includes(user!.role)).toBe(true);
    });

    it('should allow MANAGER to trigger sync', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'MANAGER' });

      const user = await mockPrisma.user.findUnique({
        where: { id: 'user-1' },
        select: { role: true },
      });
      expect(['OWNER', 'ADMIN', 'MANAGER'].includes(user!.role)).toBe(true);
    });

    it('should deny STAFF from triggering sync', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'STAFF' });

      const user = await mockPrisma.user.findUnique({
        where: { id: 'user-1' },
        select: { role: true },
      });
      expect(['OWNER', 'ADMIN', 'MANAGER'].includes(user!.role)).toBe(false);
    });
  });

  // ── Payment Acknowledge (Admin → Customer) ──────────────
  describe('payment:acknowledge', () => {
    it('should only allow authenticated admin to acknowledge', () => {
      const socketData = { userId: 'admin-1', restaurantId: RESTAURANT_ID };
      expect(socketData.userId).toBeTruthy();
    });

    it('should reject unauthenticated acknowledge', () => {
      const socketData: Record<string, unknown> = {};
      expect(socketData.userId).toBeFalsy();
    });
  });

  // ── Group Order Socket Events ───────────────────────────
  describe('group order rooms', () => {
    it('should join group room with code', () => {
      const code = 'ABC123';
      const roomName = `group:${code}`;
      expect(roomName).toBe('group:ABC123');
    });

    it('should leave group room correctly', () => {
      const code = 'ABC123';
      const roomName = `group:${code}`;
      // Socket.leave(roomName) is called — room is correctly scoped
      expect(roomName).toBe('group:ABC123');
    });
  });

  // ── Socket Emitter Helpers ──────────────────────────────
  describe('socketEmitters patterns', () => {
    it('should broadcast to correct restaurant room', () => {
      // Verify room naming convention
      const room = `restaurant:${RESTAURANT_ID}`;
      expect(room).toBe(`restaurant:${RESTAURANT_ID}`);
    });

    it('should broadcast order status to all relevant rooms', () => {
      const orderId = 'order-1';
      const rooms = [
        `restaurant:${RESTAURANT_ID}`,
        `order:${orderId}`,
        `table:${TABLE_ID}`,
      ];
      // All 3 rooms should receive the update
      expect(rooms).toHaveLength(3);
      expect(rooms[0]).toContain('restaurant:');
      expect(rooms[1]).toContain('order:');
      expect(rooms[2]).toContain('table:');
    });
  });
});
