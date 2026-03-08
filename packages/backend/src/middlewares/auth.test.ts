import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../lib/errors.js';

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

import { mockPrisma, mockRedisInstance, mockCache } from '../__tests__/setup.js';
import jwt from 'jsonwebtoken';
import { authenticate, authorize } from '../middlewares/auth.js';
import { Request, Response, NextFunction } from 'express';

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';

function createMockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    headers: {},
    user: undefined,
    restaurantId: undefined,
    ...overrides,
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should attach user to request when valid token + cached user', async () => {
      const token = jwt.sign(
        { userId: USER_ID, email: 'owner@test.com', role: 'OWNER', restaurantId: RESTAURANT_ID },
        'test-access-secret-that-is-long-enough-32chars',
        { expiresIn: '15m' },
      );

      // cache.get returns the already-parsed object
      mockCache.get.mockResolvedValue({ id: USER_ID, email: 'owner@test.com', role: 'OWNER', restaurantId: RESTAURANT_ID, isActive: true });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` } as any,
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(); // called without args = success
      expect(req.user).toBeDefined();
      expect(req.user!.id).toBe(USER_ID);
      expect(req.restaurantId).toBe(RESTAURANT_ID);
    });

    it('should fetch user from DB when not in cache', async () => {
      const token = jwt.sign(
        { userId: USER_ID, email: 'owner@test.com', role: 'OWNER', restaurantId: RESTAURANT_ID },
        'test-access-secret-that-is-long-enough-32chars',
        { expiresIn: '15m' },
      );

      mockCache.get.mockResolvedValue(null); // not cached
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'owner@test.com',
        role: 'OWNER',
        restaurantId: RESTAURANT_ID,
        isActive: true,
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` } as any,
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user!.id).toBe(USER_ID);
      expect(mockCache.set).toHaveBeenCalled(); // should cache the user
    });

    it('should call next with error when no token provided', async () => {
      const { req, res, next } = createMockReqRes({
        headers: {} as any,
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = (next as any).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('should reject inactive user from DB', async () => {
      const token = jwt.sign(
        { userId: USER_ID, email: 'owner@test.com', role: 'OWNER', restaurantId: RESTAURANT_ID },
        'test-access-secret-that-is-long-enough-32chars',
        { expiresIn: '15m' },
      );

      mockCache.get.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'owner@test.com',
        role: 'OWNER',
        restaurantId: RESTAURANT_ID,
        isActive: false, // deactivated
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` } as any,
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('should reject tampered token', async () => {
      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer invalid.token.here' } as any,
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('authorize', () => {
    it('should allow user with matching role', () => {
      const { req, res, next } = createMockReqRes();
      req.user = { id: USER_ID, email: 'owner@test.com', role: 'OWNER', restaurantId: RESTAURANT_ID } as any;

      const middleware = authorize('OWNER', 'ADMIN');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject user with non-matching role', () => {
      const { req, res, next } = createMockReqRes();
      req.user = { id: USER_ID, email: 'staff@test.com', role: 'STAFF', restaurantId: RESTAURANT_ID } as any;

      const middleware = authorize('OWNER', 'ADMIN');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = (next as any).mock.calls[0][0];
      expect(error.statusCode).toBe(403);
    });

    it('should reject request with no user attached', () => {
      const { req, res, next } = createMockReqRes();

      const middleware = authorize('OWNER');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});

describe('AppError', () => {
  it('should create errors with correct status codes', () => {
    expect(AppError.badRequest('bad').statusCode).toBe(400);
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound('Item').statusCode).toBe(404);
    expect(AppError.conflict('exists').statusCode).toBe(409);
    expect(AppError.tooManyRequests().statusCode).toBe(429);
    expect(AppError.internal().statusCode).toBe(500);
  });

  it('should include resource name in notFound message', () => {
    const err = AppError.notFound('Table');
    expect(err.message).toBe('Table not found');
  });

  it('should include details when provided', () => {
    const err = AppError.badRequest('Invalid', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });
});
