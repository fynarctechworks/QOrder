import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../__tests__/setup.js';

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

// Mock the payment provider
vi.mock('./payment/razorpayProvider.js', () => ({
  razorpayProvider: {
    name: 'razorpay',
    createOrder: vi.fn(),
    verifyPayment: vi.fn(),
    getPaymentDetails: vi.fn(),
    refund: vi.fn(),
    verifyWebhookSignature: vi.fn(),
  },
}));

import { paymentGatewayService } from './paymentGatewayService.js';
import { razorpayProvider } from './payment/razorpayProvider.js';

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440010';

describe('PaymentGatewayService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Gateway Order Creation ──────────────────────────────
  describe('createGatewayOrder', () => {
    it('should create a gateway order when payment is enabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        settings: { paymentGatewayEnabled: true },
      });
      (razorpayProvider.createOrder as any).mockResolvedValue({
        id: 'order_test123',
        amount: 49950,
        currency: 'INR',
      });

      const result = await paymentGatewayService.createGatewayOrder({
        restaurantId: RESTAURANT_ID,
        amount: 499.50,
        currency: 'INR',
      });

      expect(result.gatewayOrderId).toBe('order_test123');
      expect(result.provider).toBe('razorpay');
    });

    it('should reject if payment gateway is not enabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        settings: { paymentGatewayEnabled: false },
      });

      await expect(
        paymentGatewayService.createGatewayOrder({
          restaurantId: RESTAURANT_ID,
          amount: 100,
          currency: 'INR',
        }),
      ).rejects.toThrow('Online payment is not enabled');
    });
  });

  // ── Payment Verification ────────────────────────────────
  describe('verifyAndRecordPayment', () => {
    it('should verify and record a valid payment', async () => {
      (razorpayProvider.verifyPayment as any).mockResolvedValue(true);
      (razorpayProvider.getPaymentDetails as any).mockResolvedValue({
        id: 'pay_test123',
        amount: 49950,
        currency: 'INR',
        status: 'captured',
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null); // no existing
      mockPrisma.payment.create.mockResolvedValue({
        id: PAYMENT_ID,
        amount: 499.50,
        status: 'COMPLETED',
      });

      const result = await paymentGatewayService.verifyAndRecordPayment({
        restaurantId: RESTAURANT_ID,
        gatewayOrderId: 'order_test123',
        gatewayPaymentId: 'pay_test123',
        gatewaySignature: 'valid_sig',
        sessionId: 'session_123',
      });

      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.payment.create).toHaveBeenCalled();
    });

    it('should reject payment with invalid signature', async () => {
      (razorpayProvider.verifyPayment as any).mockResolvedValue(false);

      await expect(
        paymentGatewayService.verifyAndRecordPayment({
          restaurantId: RESTAURANT_ID,
          gatewayOrderId: 'order_test123',
          gatewayPaymentId: 'pay_test123',
          gatewaySignature: 'bad_sig',
          sessionId: 'session_123',
        }),
      ).rejects.toThrow('Payment verification failed');
    });

    it('should return existing payment for duplicate gatewayPaymentId (idempotency)', async () => {
      (razorpayProvider.verifyPayment as any).mockResolvedValue(true);
      (razorpayProvider.getPaymentDetails as any).mockResolvedValue({
        id: 'pay_test123',
        amount: 49950,
        currency: 'INR',
        status: 'captured',
      });
      const existingPayment = { id: PAYMENT_ID, amount: 499.50, status: 'COMPLETED' };
      mockPrisma.payment.findFirst.mockResolvedValue(existingPayment);

      const result = await paymentGatewayService.verifyAndRecordPayment({
        restaurantId: RESTAURANT_ID,
        gatewayOrderId: 'order_test123',
        gatewayPaymentId: 'pay_test123',
        gatewaySignature: 'valid_sig',
        sessionId: 'session_123',
      });

      expect(result).toBe(existingPayment);
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('should reject uncaptured payment', async () => {
      (razorpayProvider.verifyPayment as any).mockResolvedValue(true);
      (razorpayProvider.getPaymentDetails as any).mockResolvedValue({
        id: 'pay_test123',
        amount: 49950,
        currency: 'INR',
        status: 'authorized', // not captured
      });

      await expect(
        paymentGatewayService.verifyAndRecordPayment({
          restaurantId: RESTAURANT_ID,
          gatewayOrderId: 'order_test123',
          gatewayPaymentId: 'pay_test123',
          gatewaySignature: 'valid_sig',
          sessionId: 'session_123',
        }),
      ).rejects.toThrow('Payment not captured');
    });
  });

  // ── Refund ──────────────────────────────────────────────
  describe('refundPayment', () => {
    it('should process a full refund with tenant isolation', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        method: 'ONLINE',
        status: 'COMPLETED',
        amount: 499.50,
        gatewayPaymentId: 'pay_test123',
        gatewayProvider: 'razorpay',
        restaurantId: RESTAURANT_ID,
      });
      (razorpayProvider.refund as any).mockResolvedValue({ id: 'rfnd_test123' });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await paymentGatewayService.refundPayment({
        paymentId: PAYMENT_ID,
        restaurantId: RESTAURANT_ID,
      });

      expect(result.id).toBe('rfnd_test123');
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID, restaurantId: RESTAURANT_ID },
      });
    });

    it('should reject refund for payment belonging to different restaurant (C-1 fix)', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null); // not found because restaurantId mismatch

      await expect(
        paymentGatewayService.refundPayment({
          paymentId: PAYMENT_ID,
          restaurantId: 'different-restaurant-id',
        }),
      ).rejects.toThrow('Payment not found');
    });

    it('should reject refund for cash payment', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        method: 'CASH',
        status: 'COMPLETED',
        restaurantId: RESTAURANT_ID,
      });

      await expect(
        paymentGatewayService.refundPayment({
          paymentId: PAYMENT_ID,
          restaurantId: RESTAURANT_ID,
        }),
      ).rejects.toThrow('Only online payments can be refunded');
    });

    it('should reject refund for already refunded payment', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        method: 'ONLINE',
        status: 'REFUNDED',
        restaurantId: RESTAURANT_ID,
      });

      await expect(
        paymentGatewayService.refundPayment({
          paymentId: PAYMENT_ID,
          restaurantId: RESTAURANT_ID,
        }),
      ).rejects.toThrow('Payment already refunded');
    });

    it('should process a partial refund', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        method: 'ONLINE',
        status: 'COMPLETED',
        amount: 499.50,
        gatewayPaymentId: 'pay_test123',
        gatewayProvider: 'razorpay',
        restaurantId: RESTAURANT_ID,
      });
      (razorpayProvider.refund as any).mockResolvedValue({ id: 'rfnd_partial' });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await paymentGatewayService.refundPayment({
        paymentId: PAYMENT_ID,
        restaurantId: RESTAURANT_ID,
        amount: 100, // partial
        reason: 'Item was wrong',
      });

      expect(result.id).toBe('rfnd_partial');
      expect(razorpayProvider.refund).toHaveBeenCalledWith({
        paymentId: 'pay_test123',
        amount: 10000, // 100 * 100
        notes: { reason: 'Item was wrong' },
      });
    });
  });
});
