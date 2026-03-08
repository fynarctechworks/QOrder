/**
 * Payment Provider Abstraction Layer
 * Allows swapping Razorpay for Stripe/PayU/etc.
 */

export interface CreateOrderParams {
  amount: number;       // In smallest currency unit (paise for INR, cents for USD)
  currency: string;     // ISO 4217 code (INR, USD, etc.)
  receipt: string;      // Internal order/receipt reference
  notes?: Record<string, string>;
}

export interface GatewayOrder {
  id: string;           // Gateway's order ID (e.g. order_xxx)
  amount: number;
  currency: string;
  status: string;
  receipt: string;
}

export interface VerifyPaymentParams {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

export interface PaymentDetails {
  id: string;           // Gateway payment ID
  orderId: string;      // Gateway order ID
  amount: number;
  currency: string;
  status: string;
  method: string;       // card, upi, netbanking, wallet
  email?: string;
  contact?: string;
  captured: boolean;
}

export interface RefundParams {
  paymentId: string;
  amount?: number;      // Partial refund amount; omit for full refund
  notes?: Record<string, string>;
}

export interface RefundResult {
  id: string;
  paymentId: string;
  amount: number;
  status: string;
}

export interface PaymentProvider {
  readonly name: string;

  /** Create a gateway order for checkout */
  createOrder(params: CreateOrderParams): Promise<GatewayOrder>;

  /** Verify payment signature after checkout */
  verifyPayment(params: VerifyPaymentParams): Promise<boolean>;

  /** Fetch payment details from gateway */
  getPaymentDetails(paymentId: string): Promise<PaymentDetails>;

  /** Process a refund */
  refund(params: RefundParams): Promise<RefundResult>;

  /** Verify webhook signature */
  verifyWebhookSignature(body: string, signature: string): boolean;
}
