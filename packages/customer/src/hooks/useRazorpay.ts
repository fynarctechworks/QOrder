import { useCallback, useRef } from 'react';
import { paymentService, type PaymentConfig, type GatewayOrder } from '../services/paymentService';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: () => void) => void;
    };
  }
}

let scriptLoaded = false;
let scriptLoading: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => { scriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
    document.body.appendChild(script);
  });

  return scriptLoading;
}

interface UseRazorpayParams {
  config: PaymentConfig | null;
  restaurantId: string;
  onSuccess: (data: { paymentId: string }) => void;
  onError?: (error: string) => void;
}

export function useRazorpay({ config, restaurantId, onSuccess, onError }: UseRazorpayParams) {
  const processingRef = useRef(false);

  const initiatePayment = useCallback(async (params: {
    orderId?: string;
    sessionId: string;
    amount: number;
    currency: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    branchId?: string;
    description?: string;
  }) => {
    if (processingRef.current) return;
    if (!config?.enabled || !config.keyId) {
      onError?.('Online payment is not configured');
      return;
    }

    processingRef.current = true;

    try {
      // 1. Load Razorpay SDK
      await loadRazorpayScript();

      // 2. Create gateway order
      const gatewayOrder: GatewayOrder = await paymentService.createOrder(restaurantId, {
        orderId: params.orderId,
        sessionId: params.sessionId,
        amount: params.amount,
        currency: params.currency,
      });

      // 3. Open Razorpay checkout
      const options: Record<string, unknown> = {
        key: config.keyId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        name: config.restaurantName || 'Restaurant',
        description: params.description || 'Order Payment',
        order_id: gatewayOrder.gatewayOrderId,
        prefill: {
          name: params.customerName || '',
          contact: params.customerPhone || '',
          email: params.customerEmail || '',
        },
        theme: { color: '#f97316' }, // primary orange
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            // 4. Verify payment on backend
            const result = await paymentService.verifyPayment(restaurantId, {
              gatewayOrderId: response.razorpay_order_id,
              gatewayPaymentId: response.razorpay_payment_id,
              gatewaySignature: response.razorpay_signature,
              orderId: params.orderId,
              sessionId: params.sessionId,
              branchId: params.branchId,
            });

            onSuccess({ paymentId: result.paymentId });
          } catch (err) {
            onError?.((err as Error).message || 'Payment verification failed');
          } finally {
            processingRef.current = false;
          }
        },
        modal: {
          ondismiss: () => {
            processingRef.current = false;
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', () => {
        processingRef.current = false;
        onError?.('Payment failed. Please try again.');
      });
      razorpay.open();
    } catch (err) {
      processingRef.current = false;
      onError?.((err as Error).message || 'Failed to initiate payment');
    }
  }, [config, restaurantId, onSuccess, onError]);

  return { initiatePayment, isConfigured: !!config?.enabled };
}
