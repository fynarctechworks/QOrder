import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mockPrisma } from '../__tests__/setup.js';

// Must mock config before authService loads it
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

import { authService } from '../services/authService.js';
import { AppError } from '../lib/errors.js';

// ─── Helpers ────────────────────────────────────────────────
const MOCK_RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440002';

function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_USER_ID,
    email: 'owner@test.com',
    username: 'testowner',
    name: 'Test Owner',
    role: 'OWNER',
    roleTitle: null,
    restaurantId: MOCK_RESTAURANT_ID,
    passwordHash: bcrypt.hashSync('Test1234', 12),
    isActive: true,
    isVerified: true,
    verificationCode: null,
    verificationExpiry: null,
    lastLoginAt: null,
    restaurant: {
      id: MOCK_RESTAURANT_ID,
      name: 'Test Restaurant',
      slug: 'test-restaurant',
      isActive: true,
    },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────
describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Registration ────────────────────────────────────────
  describe('register', () => {
    it('should register a new user and return verification prompt', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.restaurant.create.mockResolvedValue({ id: MOCK_RESTAURANT_ID, slug: 'new-restaurant' });
      mockPrisma.user.create.mockResolvedValue({ id: MOCK_USER_ID });

      const result = await authService.register({
        email: 'new@test.com',
        username: 'newuser',
        password: 'Test1234',
        name: 'New User',
        restaurantName: 'New Restaurant',
      });

      expect(result.requiresVerification).toBe(true);
      expect(result.email).toBe('new@test.com');
    });

    it('should reject registration if email is already verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());

      await expect(
        authService.register({
          email: 'owner@test.com',
          username: 'newuser',
          password: 'Test1234',
          name: 'New User',
          restaurantName: 'New Restaurant',
        }),
      ).rejects.toThrow('This email already has an account');
    });

    it('should allow re-registration of unverified email with updated data', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser({ isVerified: false }));
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({ id: MOCK_USER_ID });

      const result = await authService.register({
        email: 'owner@test.com',
        username: 'newuser',
        password: 'Test1234',
        name: 'Renamed',
        restaurantName: 'Doesnt matter',
      });

      expect(result.requiresVerification).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });
  });

  // ── Email Verification ──────────────────────────────────
  describe('verifyEmail', () => {
    it('should verify email with correct OTP and return tokens', async () => {
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.user.findFirst.mockResolvedValue(
        mockUser({ isVerified: false, verificationCode: '123456', verificationExpiry: expiry }),
      );
      mockPrisma.user.update.mockResolvedValue({
        id: MOCK_USER_ID,
        email: 'owner@test.com',
        username: 'testowner',
        name: 'Test Owner',
        role: 'OWNER',
        roleTitle: null,
        restaurantId: MOCK_RESTAURANT_ID,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.verifyEmail('owner@test.com', '123456');

      expect(result.accessToken).toBeDefined();
      expect(result.user.id).toBe(MOCK_USER_ID);
    });

    it('should reject expired OTP', async () => {
      const expiry = new Date(Date.now() - 1000); // expired
      mockPrisma.user.findFirst.mockResolvedValue(
        mockUser({ isVerified: false, verificationCode: '123456', verificationExpiry: expiry }),
      );

      await expect(authService.verifyEmail('owner@test.com', '123456')).rejects.toThrow(
        'Verification code has expired',
      );
    });

    it('should reject wrong OTP', async () => {
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.user.findFirst.mockResolvedValue(
        mockUser({ isVerified: false, verificationCode: '123456', verificationExpiry: expiry }),
      );

      await expect(authService.verifyEmail('owner@test.com', '999999')).rejects.toThrow(
        'Invalid verification code',
      );
    });

    it('should reject if already verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());

      await expect(authService.verifyEmail('owner@test.com', '123456')).rejects.toThrow(
        'Email is already verified',
      );
    });
  });

  // ── Login ───────────────────────────────────────────────
  describe('login', () => {
    it('should login with valid credentials and return tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login({
        identifier: 'owner@test.com',
        password: 'Test1234',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(MOCK_USER_ID);
      expect(result.restaurant.id).toBe(MOCK_RESTAURANT_ID);
    });

    it('should reject login with wrong password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());

      await expect(
        authService.login({ identifier: 'owner@test.com', password: 'WrongPass1' }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject login for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        authService.login({ identifier: 'nobody@test.com', password: 'Test1234' }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject login for deactivated user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser({ isActive: false }));

      await expect(
        authService.login({ identifier: 'owner@test.com', password: 'Test1234' }),
      ).rejects.toThrow('Account is deactivated');
    });

    it('should reject login for deactivated restaurant', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        mockUser({ restaurant: { id: MOCK_RESTAURANT_ID, name: 'Test', slug: 'test', isActive: false } }),
      );

      await expect(
        authService.login({ identifier: 'owner@test.com', password: 'Test1234' }),
      ).rejects.toThrow('Restaurant is deactivated');
    });

    it('should reject login for unverified user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser({ isVerified: false }));

      await expect(
        authService.login({ identifier: 'owner@test.com', password: 'Test1234' }),
      ).rejects.toThrow('Email not verified');
    });

    it('should login by username too', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser());
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login({
        identifier: 'testowner',
        password: 'Test1234',
      });

      expect(result.user.username).toBe('testowner');
    });
  });

  // ── Token Refresh ───────────────────────────────────────
  describe('refreshToken', () => {
    it('should issue a new access token with valid refresh token', async () => {
      // Generate a real refresh token
      const tokenId = '550e8400-e29b-41d4-a716-446655440090';
      const refreshToken = jwt.sign(
        { userId: MOCK_USER_ID, tokenId },
        'test-refresh-secret-that-is-long-enough-32chars',
        { expiresIn: '7d' },
      );

      // Create hash for DB lookup
      const { createHash } = await import('crypto');
      const hashedToken = createHash('sha256').update(refreshToken).digest('hex');

      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: tokenId,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: {
          id: MOCK_USER_ID,
          email: 'owner@test.com',
          role: 'OWNER',
          restaurantId: MOCK_RESTAURANT_ID,
          isActive: true,
          restaurant: { id: MOCK_RESTAURANT_ID, isActive: true },
        },
      });

      const result = await authService.refreshToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      // Verify it's a valid JWT
      const decoded = jwt.verify(result.accessToken, 'test-access-secret-that-is-long-enough-32chars') as any;
      expect(decoded.userId).toBe(MOCK_USER_ID);
    });

    it('should reject an expired refresh token in DB', async () => {
      const tokenId = '550e8400-e29b-41d4-a716-446655440090';
      const refreshToken = jwt.sign(
        { userId: MOCK_USER_ID, tokenId },
        'test-refresh-secret-that-is-long-enough-32chars',
        { expiresIn: '7d' },
      );

      const { createHash } = await import('crypto');
      const hashedToken = createHash('sha256').update(refreshToken).digest('hex');

      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: tokenId,
        token: hashedToken,
        expiresAt: new Date(Date.now() - 1000), // expired in DB
        user: {
          id: MOCK_USER_ID,
          email: 'owner@test.com',
          role: 'OWNER',
          restaurantId: MOCK_RESTAURANT_ID,
          isActive: true,
          restaurant: { id: MOCK_RESTAURANT_ID, isActive: true },
        },
      });
      mockPrisma.refreshToken.delete.mockResolvedValue({});

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token expired');
    });

    it('should reject refresh for deactivated user', async () => {
      const tokenId = '550e8400-e29b-41d4-a716-446655440090';
      const refreshToken = jwt.sign(
        { userId: MOCK_USER_ID, tokenId },
        'test-refresh-secret-that-is-long-enough-32chars',
        { expiresIn: '7d' },
      );

      const { createHash } = await import('crypto');
      const hashedToken = createHash('sha256').update(refreshToken).digest('hex');

      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: tokenId,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: {
          id: MOCK_USER_ID,
          email: 'owner@test.com',
          role: 'OWNER',
          restaurantId: MOCK_RESTAURANT_ID,
          isActive: false, // deactivated
          restaurant: { id: MOCK_RESTAURANT_ID, isActive: true },
        },
      });

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(
        'Account or restaurant is deactivated',
      );
    });
  });

  // ── Change Password ─────────────────────────────────────
  describe('changePassword', () => {
    it('should change password and revoke all sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser());
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      await authService.changePassword(MOCK_USER_ID, 'Test1234', 'NewPass123');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MOCK_USER_ID } }),
      );
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: MOCK_USER_ID },
      });
    });

    it('should reject if current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser());

      await expect(
        authService.changePassword(MOCK_USER_ID, 'WrongCurrent1', 'NewPass123'),
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  // ── Cleanup ─────────────────────────────────────────────
  describe('cleanupExpiredTokens', () => {
    it('should delete expired refresh tokens', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

      const count = await authService.cleanupExpiredTokens();

      expect(count).toBe(5);
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
