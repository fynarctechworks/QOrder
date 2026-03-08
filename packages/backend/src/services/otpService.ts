import { config } from '../config/index.js';
import { prisma, cache, AppError } from '../lib/index.js';

// ── Phone format validation ──────────────────────────────────────────────

/** E.164 format: +{countryCode}{number}, 7-15 digits total */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/** Obvious fake patterns */
const FAKE_PATTERNS = [
  /^(\+\d)\1{6,}$/,           // All same digit after +  e.g. +11111111111
  /(\d)\1{5,}/,                // 6+ repeating digits anywhere
  /0{6,}/,                     // 6+ zeroes
  /1234567890/,                // Sequential
  /0987654321/,                // Reverse sequential
  /^(\+\d{1,3})(0{7,})$/,     // Country code + all zeroes
];

export function validatePhoneFormat(phone: string): { valid: boolean; reason?: string } {
  // Must be E.164
  if (!E164_REGEX.test(phone)) {
    return { valid: false, reason: 'Phone number must be in international format (e.g., +91XXXXXXXXXX)' };
  }

  // Check known fake patterns
  const digitsOnly = phone.replace(/\D/g, '');
  for (const pattern of FAKE_PATTERNS) {
    if (pattern.test(phone) || pattern.test(digitsOnly)) {
      return { valid: false, reason: 'Please enter a valid phone number' };
    }
  }

  // Check all-same digits (e.g. +919999999999)
  const localPart = phone.slice(phone.startsWith('+') ? 2 : 0); // skip +CC
  const uniqueDigits = new Set(localPart.replace(/\D/g, ''));
  if (uniqueDigits.size <= 1 && localPart.length > 3) {
    return { valid: false, reason: 'Please enter a valid phone number' };
  }

  return { valid: true };
}

// ── Twilio Verify integration ────────────────────────────────────────────

export function isTwilioConfigured(): boolean {
  const { accountSid, authToken, verifyServiceSid } = config.twilio;
  return !!(accountSid && authToken && verifyServiceSid);
}

/**
 * Make a request to Twilio Verify API using fetch (no SDK needed).
 */
async function twilioRequest(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const { accountSid, authToken, verifyServiceSid } = config.twilio;
  const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    },
    body: new URLSearchParams(body).toString(),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const message = (data.message as string) || 'Twilio API error';
    console.error('[OTP] Twilio error:', response.status, message);
    throw AppError.internal(`SMS verification failed: ${message}`);
  }

  return data;
}

// ── Rate limiting helpers (using Redis) ───────────────────────────────────

const OTP_RATE_KEY = (phone: string) => `otp:rate:${phone}`;
const OTP_MAX_ATTEMPTS = 5;       // max sends per phone per window
const OTP_RATE_WINDOW = 600;      // 10 min window (seconds)

// ── Public API ───────────────────────────────────────────────────────────

export const otpService = {
  /**
   * Check if phone verification is required for a given restaurant + branch.
   * Reads from branch settings first, then falls back to restaurant settings.
   */
  async isPhoneVerificationRequired(restaurantId: string, branchId?: string | null): Promise<boolean> {
    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { settings: true },
      });
      const branchSettings = (branch?.settings as Record<string, unknown>) || {};
      if (typeof branchSettings.requirePhoneVerification === 'boolean') {
        return branchSettings.requirePhoneVerification;
      }
    }

    // Fall back to restaurant-level settings
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settings: true },
    });
    const settings = (restaurant?.settings as Record<string, unknown>) || {};
    return (settings.requirePhoneVerification as boolean) ?? false;
  },

  /**
   * Send OTP to a phone number via Twilio Verify.
   * Returns { sent: true } on success.
   */
  async sendOtp(phone: string): Promise<{ sent: boolean }> {
    // Validate format first
    const validation = validatePhoneFormat(phone);
    if (!validation.valid) {
      throw AppError.badRequest(validation.reason!);
    }

    // Check Twilio is configured
    if (!isTwilioConfigured()) {
      throw AppError.internal('SMS verification is not configured. Please set Twilio credentials.');
    }

    // Rate limit: max N sends per phone in 10 min
    const rateKey = OTP_RATE_KEY(phone);
    const attempts = await cache.get<number>(rateKey);
    if (attempts !== null && attempts >= OTP_MAX_ATTEMPTS) {
      throw AppError.tooManyRequests('Too many verification attempts. Please try again later.');
    }

    // Send via Twilio Verify
    await twilioRequest('/Verifications', {
      To: phone,
      Channel: 'sms',
    });

    // Increment rate counter
    const newCount = (attempts ?? 0) + 1;
    await cache.set(rateKey, newCount, OTP_RATE_WINDOW);

    return { sent: true };
  },

  /**
   * Verify an OTP code for a phone number.
   * Returns { verified: true } on success.
   */
  async verifyOtp(phone: string, code: string): Promise<{ verified: boolean }> {
    if (!isTwilioConfigured()) {
      throw AppError.internal('SMS verification is not configured.');
    }

    // Validate code format (4-6 digits)
    if (!/^\d{4,6}$/.test(code)) {
      throw AppError.badRequest('Invalid verification code format');
    }

    const data = await twilioRequest('/VerificationCheck', {
      To: phone,
      Code: code,
    });

    if (data.status === 'approved') {
      return { verified: true };
    }

    throw AppError.badRequest('Incorrect verification code');
  },

  /**
   * Save verified phone to the active table session.
   */
  async savePhoneToSession(
    restaurantId: string,
    tableId: string,
    phone: string,
    verified: boolean
  ): Promise<void> {
    // Find the active session for this table
    const session = await prisma.tableSession.findFirst({
      where: { restaurantId, tableId, status: 'ACTIVE' },
      select: { id: true },
    });

    if (session) {
      await prisma.tableSession.update({
        where: { id: session.id },
        data: { customerPhone: phone, phoneVerified: verified },
      });
    }
  },

  /**
   * Check if the current session already has a verified phone.
   */
  async getSessionPhoneStatus(
    restaurantId: string,
    tableId: string
  ): Promise<{ hasPhone: boolean; phoneVerified: boolean; phone?: string }> {
    const session = await prisma.tableSession.findFirst({
      where: { restaurantId, tableId, status: 'ACTIVE' },
      select: { customerPhone: true, phoneVerified: true },
    });

    if (!session || !session.customerPhone) {
      return { hasPhone: false, phoneVerified: false };
    }

    return {
      hasPhone: true,
      phoneVerified: session.phoneVerified,
      phone: session.customerPhone,
    };
  },
};
