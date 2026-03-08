import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import type {
  PaymentProvider,
  CreateOrderParams,
  GatewayOrder,
  VerifyPaymentParams,
  PaymentDetails,
  RefundParams,
  RefundResult,
} from './types.js';

class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  private instance: InstanceType<typeof Razorpay> | null = null;

  private getClient(): InstanceType<typeof Razorpay> {
    if (!this.instance) {
      if (!config.razorpay.keyId || !config.razorpay.keySecret) {
        throw new Error('Razorpay credentials not configured');
      }
      this.instance = new Razorpay({
        key_id: config.razorpay.keyId,
        key_secret: config.razorpay.keySecret,
      });
    }
    return this.instance;
  }

  async createOrder(params: CreateOrderParams): Promise<GatewayOrder> {
    const client = this.getClient();
    const order = await client.orders.create({
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes || {},
    });

    return {
      id: order.id,
      amount: order.amount as number,
      currency: order.currency,
      status: order.status,
      receipt: order.receipt ?? params.receipt,
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<boolean> {
    const body = params.gatewayOrderId + '|' + params.gatewayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body)
      .digest('hex');

    return expectedSignature === params.gatewaySignature;
  }

  async getPaymentDetails(paymentId: string): Promise<PaymentDetails> {
    const client = this.getClient();
    const payment = await client.payments.fetch(paymentId);

    return {
      id: payment.id,
      orderId: payment.order_id as string,
      amount: payment.amount as number,
      currency: payment.currency,
      status: payment.status,
      method: payment.method as string,
      email: payment.email as string | undefined,
      contact: payment.contact as string | undefined,
      captured: payment.captured as boolean,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const client = this.getClient();
    const refund = await client.payments.refund(params.paymentId, {
      amount: params.amount,
      notes: params.notes || {},
    });

    return {
      id: refund.id,
      paymentId: refund.payment_id as string,
      amount: refund.amount as number,
      status: refund.status ?? 'processed',
    };
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!config.razorpay.webhookSecret) return false;

    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }
}

export const razorpayProvider = new RazorpayProvider();
