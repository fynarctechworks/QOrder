import Razorpay from 'razorpay';
import { createHmac } from 'crypto';
import { config } from '../config/index.js';

let razorpayInstance: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!razorpayInstance) {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error('Razorpay credentials not configured');
    }
    razorpayInstance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return razorpayInstance;
}

export function verifyRazorpaySignature(
  body: string,
  signature: string,
): boolean {
  const expectedSignature = createHmac('sha256', config.razorpay.webhookSecret)
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const generated = createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return generated === signature;
}
