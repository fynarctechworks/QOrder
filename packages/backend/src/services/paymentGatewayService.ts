import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { PaymentProvider } from './payment/types.js';
import { razorpayProvider } from './payment/razorpayProvider.js';

// Registry of available providers
const providers: Record<string, PaymentProvider> = {
  razorpay: razorpayProvider,
};

function getProvider(name?: string): PaymentProvider {
  const providerName = name || 'razorpay';
  const provider = providers[providerName];
  if (!provider) {
    throw AppError.badRequest(`Payment provider "${providerName}" is not supported`);
  }
  return provider;
}

/**
 * Get the payment mode for a restaurant from its settings JSON.
 * 'pay_after' = traditional pay-at-end (default)
 * 'pay_before' = pay online at order placement (QSR style)
 */
async function getPaymentMode(restaurantId: string): Promise<'pay_before' | 'pay_after'> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { settings: true },
  });
  const settings = (restaurant?.settings as Record<string, unknown>) || {};
  return (settings.paymentMode as 'pay_before' | 'pay_after') || 'pay_after';
}

/**
 * Check if a restaurant has payment gateway enabled.
 */
async function isGatewayEnabled(restaurantId: string): Promise<boolean> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { settings: true },
  });
  const settings = (restaurant?.settings as Record<string, unknown>) || {};
  return settings.paymentGatewayEnabled === true;
}

export const paymentGatewayService = {
  getPaymentMode,
  isGatewayEnabled,

  /**
   * Create a gateway order for online checkout.
   * Called when customer wants to pay online.
   */
  async createGatewayOrder(input: {
    restaurantId: string;
    orderId?: string;      // Existing order ID (pay_after mode)
    sessionId?: string;    // Session ID for settling entire table bill
    amount: number;        // Amount in main currency unit (e.g., 499.50)
    currency: string;
  }) {
    const enabled = await isGatewayEnabled(input.restaurantId);
    if (!enabled) {
      throw AppError.badRequest('Online payment is not enabled for this restaurant');
    }

    const provider = getProvider();

    // Convert to smallest unit (paise/cents)
    const amountInSmallestUnit = Math.round(input.amount * 100);
    const receipt = input.orderId
      ? `order_${input.orderId.slice(0, 16)}`
      : `session_${(input.sessionId || 'unknown').slice(0, 16)}`;

    const gatewayOrder = await provider.createOrder({
      amount: amountInSmallestUnit,
      currency: input.currency.toUpperCase(),
      receipt,
      notes: {
        restaurantId: input.restaurantId,
        ...(input.orderId && { orderId: input.orderId }),
        ...(input.sessionId && { sessionId: input.sessionId }),
      },
    });

    // If tied to a specific order, store the gateway order ID
    if (input.orderId) {
      await prisma.order.update({
        where: { id: input.orderId },
        data: { gatewayOrderId: gatewayOrder.id },
      });
    }

    return {
      gatewayOrderId: gatewayOrder.id,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency,
      provider: provider.name,
    };
  },

  /**
   * Verify payment after Razorpay checkout completes on client side.
   * Creates a Payment record and updates order/session status.
   */
  async verifyAndRecordPayment(input: {
    restaurantId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string;
    orderId?: string;
    sessionId: string;
    branchId?: string;
  }) {
    const provider = getProvider();

    // 1. Verify signature
    const isValid = await provider.verifyPayment({
      gatewayOrderId: input.gatewayOrderId,
      gatewayPaymentId: input.gatewayPaymentId,
      gatewaySignature: input.gatewaySignature,
    });

    if (!isValid) {
      throw AppError.badRequest('Payment verification failed — invalid signature');
    }

    // 2. Fetch payment details from gateway
    const details = await provider.getPaymentDetails(input.gatewayPaymentId);

    if (details.status !== 'captured') {
      throw AppError.badRequest(`Payment not captured. Status: ${details.status}`);
    }

    // Idempotency: if this gateway payment was already recorded, return existing record
    const existing = await prisma.payment.findFirst({
      where: { gatewayPaymentId: input.gatewayPaymentId },
    });
    if (existing) {
      return existing;
    }

    // 3. Create Payment record
    const amountInMainUnit = details.amount / 100;

    const payment = await prisma.payment.create({
      data: {
        amount: amountInMainUnit,
        method: 'ONLINE',
        status: 'COMPLETED',
        reference: input.gatewayPaymentId,
        gatewayProvider: provider.name,
        gatewayOrderId: input.gatewayOrderId,
        gatewayPaymentId: input.gatewayPaymentId,
        gatewaySignature: input.gatewaySignature,
        gatewayData: JSON.parse(JSON.stringify(details)),
        sessionId: input.sessionId,
        restaurantId: input.restaurantId,
        branchId: input.branchId || null,
      },
    });

    // 4. If tied to specific order, mark it completed
    if (input.orderId) {
      await prisma.order.update({
        where: { id: input.orderId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    return payment;
  },

  /**
   * Process a refund for an online payment.
   */
  async refundPayment(input: {
    paymentId: string;
    restaurantId: string;
    amount?: number; // Partial refund in main currency unit; omit for full
    reason?: string;
  }) {
    const payment = await prisma.payment.findFirst({
      where: { id: input.paymentId, restaurantId: input.restaurantId },
    });

    if (!payment) throw AppError.notFound('Payment');
    if (payment.method !== 'ONLINE') throw AppError.badRequest('Only online payments can be refunded through gateway');
    if (payment.status === 'REFUNDED') throw AppError.badRequest('Payment already refunded');
    if (!payment.gatewayPaymentId) throw AppError.badRequest('No gateway payment ID found');

    const provider = getProvider(payment.gatewayProvider || undefined);

    const refundAmountSmallest = input.amount
      ? Math.round(input.amount * 100)
      : undefined; // Full refund if omitted

    const refund = await provider.refund({
      paymentId: payment.gatewayPaymentId,
      amount: refundAmountSmallest,
      notes: input.reason ? { reason: input.reason } : undefined,
    });

    // Update payment record
    await prisma.payment.update({
      where: { id: input.paymentId },
      data: {
        status: 'REFUNDED',
        refundId: refund.id,
        refundAmount: input.amount || Number(payment.amount),
        refundedAt: new Date(),
      },
    });

    return refund;
  },

  /**
   * Handle Razorpay webhook events (payment.captured, refund.processed, etc.)
   */
  async handleWebhook(rawBody: string, signature: string) {
    const provider = getProvider();

    const isValid = provider.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw AppError.unauthorized('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;

    if (eventType === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity;
      if (!paymentEntity) return { handled: false };

      // Check if we already recorded this payment
      const existing = await prisma.payment.findFirst({
        where: { gatewayPaymentId: paymentEntity.id },
      });

      if (existing) return { handled: true, message: 'Already recorded' };

      // Webhook backup: record payment if client-side verification was missed
      const notes = paymentEntity.notes || {};
      if (notes.restaurantId && notes.orderId) {
        const order = await prisma.order.findUnique({
          where: { id: notes.orderId },
          select: { sessionId: true, branchId: true },
        });

        if (order?.sessionId) {
          // Record payment directly since webhook signature is already verified
          const amountInMainUnit = paymentEntity.amount / 100;
          await prisma.payment.create({
            data: {
              amount: amountInMainUnit,
              method: 'ONLINE',
              status: 'COMPLETED',
              reference: paymentEntity.id,
              gatewayProvider: 'razorpay',
              gatewayOrderId: paymentEntity.order_id,
              gatewayPaymentId: paymentEntity.id,
              gatewayData: paymentEntity,
              sessionId: order.sessionId,
              restaurantId: notes.restaurantId,
              branchId: order.branchId || null,
            },
          }).catch((err: unknown) => {
            // P2002 = unique constraint (duplicate gatewayPaymentId from client-side verification)
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
            logger.error({ err, paymentId: paymentEntity.id }, 'Webhook: failed to create payment record');
          });

          if (notes.orderId) {
            await prisma.order.update({
              where: { id: notes.orderId },
              data: { status: 'COMPLETED', completedAt: new Date() },
            }).catch((err: unknown) => {
              logger.error({ err, orderId: notes.orderId }, 'Webhook: failed to update order status');
            });
          }
        }
      }

      return { handled: true };
    }

    return { handled: false, event: eventType };
  },

  /**
   * Get Razorpay public key for client-side checkout initialization.
   */
  async getCheckoutConfig(restaurantId: string) {
    const enabled = await isGatewayEnabled(restaurantId);
    if (!enabled) return { enabled: false };

    const mode = await getPaymentMode(restaurantId);
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, currency: true, settings: true },
    });
    const settings = (restaurant?.settings as Record<string, unknown>) || {};

    return {
      enabled: true,
      provider: 'razorpay',
      keyId: (settings.razorpayKeyId as string) || '',
      paymentMode: mode,
      currency: restaurant?.currency || 'INR',
      restaurantName: restaurant?.name || '',
    };
  },
};
