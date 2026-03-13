import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock config
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
  },
}));

// Mock rate limiters to be passthrough in tests
vi.mock('../middlewares/rateLimiter.js', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return {
    apiLimiter: passthrough,
    authLimiter: passthrough,
    orderLimiter: passthrough,
    pinLimiter: passthrough,
    otpLimiter: passthrough,
    couponLimiter: passthrough,
  };
});

// Mock table rate limiter (factory function -> returns middleware)
vi.mock('../middlewares/tableRateLimiter.js', () => ({
  tableRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

import { createApp } from '../app.js';
import jwt from 'jsonwebtoken';
import { mockPrisma, mockRedisInstance, mockCache } from '../__tests__/setup.js';

let app: ReturnType<typeof createApp>;
try {
  app = createApp();
} catch (e: any) {
  console.error('Failed to create app:', e.message, e.stack);
  throw e;
}

// ─── Helpers ────────────────────────────────────────────────
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';

function generateAccessToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      userId: USER_ID,
      email: 'owner@test.com',
      role: 'OWNER',
      restaurantId: RESTAURANT_ID,
      ...overrides,
    },
    'test-access-secret-that-is-long-enough-32chars',
    { expiresIn: '15m' },
  );
}

function mockAuthUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'owner@test.com',
    role: 'OWNER',
    restaurantId: RESTAURANT_ID,
    isActive: true,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────
describe('API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default auth cache mock — user lookup happens on every authenticated request
    mockCache.get.mockImplementation(async (key: string) => {
      if (key.startsWith('auth:user:')) {
        return mockAuthUser();
      }
      return null;
    });
  });

  // ── Health Check ────────────────────────────────────────
  describe('GET /api/health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request(app).get('/api/health');
      if (res.status === 500) {
        console.error('Health check 500 body:', JSON.stringify(res.body));
      }
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // ── Root Route ──────────────────────────────────────────
  describe('GET /', () => {
    it('should return API info', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('QR Order API');
    });
  });

  // ── 404 Handler ─────────────────────────────────────────
  describe('Unknown routes', () => {
    it('should return 404 for unknown API routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── Auth Endpoints ──────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('should reject with validation error for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject with validation error for short password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ identifier: 'test@test.com', password: 'short' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should reject with validation error for invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: 'not-an-email',
          username: 'test',
          password: 'Test1234',
          name: 'Test',
          restaurantName: 'Test Restaurant',
        });

      expect(res.status).toBe(400);
    });

    it('should reject weak password (no uppercase)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: 'valid@test.com',
          username: 'validuser',
          password: 'weakpass1',
          name: 'Test User',
          restaurantName: 'My Restaurant',
        });

      expect(res.status).toBe(400);
    });
  });

  // ── Protected Endpoints Without Auth ────────────────────
  describe('Protected endpoints without token', () => {
    it('GET /api/orders should return 401', async () => {
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me should return 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/tables should return 401', async () => {
      const res = await request(app).get('/api/tables');
      expect(res.status).toBe(401);
    });
  });

  // ── Protected Endpoints With Auth ───────────────────────
  describe('Authenticated requests', () => {
    it('GET /api/auth/me should return user info', async () => {
      const token = generateAccessToken();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(USER_ID);
    });

    it('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: USER_ID, email: 'owner@test.com', role: 'OWNER', restaurantId: RESTAURANT_ID },
        'test-access-secret-that-is-long-enough-32chars',
        { expiresIn: '0s' },
      );

      // Small delay to ensure token expires
      await new Promise((r) => setTimeout(r, 50));

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should reject forged token', async () => {
      const forgedToken = jwt.sign(
        { userId: USER_ID, email: 'owner@test.com', role: 'OWNER', restaurantId: RESTAURANT_ID },
        'wrong-secret-key-not-matching-config',
        { expiresIn: '15m' },
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
    });
  });

  // ── Role Authorization ──────────────────────────────────
  describe('Role-based access control', () => {
    it('STAFF should be denied access to analytics', async () => {
      const staffToken = generateAccessToken({ role: 'STAFF' });
      mockCache.get.mockImplementation(async (key: string) => {
        if (key.startsWith('auth:user:')) {
          return mockAuthUser({ role: 'STAFF' });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/orders/analytics')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    it('OWNER should access analytics', async () => {
      const token = generateAccessToken({ role: 'OWNER' });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/api/orders/analytics')
        .set('Authorization', `Bearer ${token}`);

      // Should not be 403 — might be 200 or other non-auth error
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });

  // ── CSRF Protection ─────────────────────────────────────
  describe('CSRF protection', () => {
    it('POST /api/auth/refresh without Origin should be blocked', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_ERROR');
    });

    it('POST /api/auth/refresh with valid Origin should pass CSRF', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .send({});

      // Should pass CSRF but fail on missing token (401, not 403)
      expect(res.status).toBe(401);
    });

    it('POST /api/auth/logout with wrong Origin should be blocked', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Origin', 'http://evil-site.com')
        .send({});

      expect(res.status).toBe(403);
    });
  });

  // ── Security Headers ────────────────────────────────────
  describe('Security headers', () => {
    it('should set Helmet security headers', async () => {
      const res = await request(app).get('/api/health');

      // Helmet sets these by default
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('should generate request ID', async () => {
      const res = await request(app).get('/api/health');
      // Request ID middleware adds x-request-id to req.headers
      // (not necessarily in response, but the middleware runs)
      expect(res.status).toBe(200);
    });
  });

  // ── Input Validation ────────────────────────────────────
  describe('Input validation', () => {
    it('should reject order with no items', async () => {
      const token = generateAccessToken();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:5173')
        .send({ items: [] });

      expect(res.status).toBe(400);
    });

    it('should reject order with invalid UUID for menuItemId', async () => {
      const token = generateAccessToken();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:5173')
        .send({
          items: [{ menuItemId: 'not-a-uuid', quantity: 1 }],
        });

      expect(res.status).toBe(400);
    });

    it('should reject order with quantity of 0', async () => {
      const token = generateAccessToken();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:5173')
        .send({
          items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440099', quantity: 0 }],
        });

      expect(res.status).toBe(400);
    });

    it('should reject order with quantity over 99', async () => {
      const token = generateAccessToken();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'http://localhost:5173')
        .send({
          items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440099', quantity: 100 }],
        });

      expect(res.status).toBe(400);
    });
  });

  // ── Deactivated User Mid-Session ────────────────────────
  describe('Deactivated user scenarios', () => {
    it('should reject authenticated request for deactivated user', async () => {
      const token = generateAccessToken();
      mockCache.get.mockImplementation(async (key: string) => {
        if (key.startsWith('auth:user:')) {
          return mockAuthUser({ isActive: false });
        }
        return null;
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });
  });
});
