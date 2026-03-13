import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),

  // Twilio (phone OTP + WhatsApp)
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_VERIFY_SERVICE_SID: z.string().default(''),
  TWILIO_WHATSAPP_FROM: z.string().default(''),

  // Twilio WhatsApp Content Template SIDs
  TWILIO_TPL_LOW_STOCK: z.string().default(''),
  TWILIO_TPL_STAFF_LATE: z.string().default(''),
  TWILIO_TPL_EARLY_CHECKOUT: z.string().default(''),
  TWILIO_TPL_ORDER_INVOICE: z.string().default(''),

  // Gemini AI (chatbot)
  GEMINI_API_KEY: z.string().default(''),

  // OpenAI (chatbot alternative)
  OPENAI_API_KEY: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

// Production safety checks
if (parsed.data.NODE_ENV === 'production') {
  if (!parsed.data.REDIS_URL || parsed.data.REDIS_URL === 'redis://localhost:6379') {
    console.error('❌ REDIS_URL must be set to a non-default value in production');
    process.exit(1);
  }
}

// Warn if SMTP is not configured (email features will silently fail)
if (!parsed.data.SMTP_USER || !parsed.data.SMTP_PASS) {
  console.warn('⚠️  SMTP_USER / SMTP_PASS not set — email sending (verification, OTP) will fail silently.');
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parseInt(parsed.data.PORT, 10),
  database: {
    url: parsed.data.DATABASE_URL,
  },
  redis: {
    url: parsed.data.REDIS_URL,
  },
  jwt: {
    accessSecret: parsed.data.JWT_ACCESS_SECRET,
    refreshSecret: parsed.data.JWT_REFRESH_SECRET,
    accessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  },
  cors: {
    origin: parsed.data.CORS_ORIGIN.split(','),
  },
  smtp: {
    host: parsed.data.SMTP_HOST,
    port: parseInt(parsed.data.SMTP_PORT, 10),
    user: parsed.data.SMTP_USER,
    pass: parsed.data.SMTP_PASS,
    from: parsed.data.SMTP_FROM || parsed.data.SMTP_USER,
  },
  twilio: {
    accountSid: parsed.data.TWILIO_ACCOUNT_SID,
    authToken: parsed.data.TWILIO_AUTH_TOKEN,
    verifyServiceSid: parsed.data.TWILIO_VERIFY_SERVICE_SID,
    whatsappFrom: parsed.data.TWILIO_WHATSAPP_FROM,
    templates: {
      lowStock: parsed.data.TWILIO_TPL_LOW_STOCK,
      staffLate: parsed.data.TWILIO_TPL_STAFF_LATE,
      earlyCheckout: parsed.data.TWILIO_TPL_EARLY_CHECKOUT,
      orderInvoice: parsed.data.TWILIO_TPL_ORDER_INVOICE,
    },
  },
  gemini: {
    apiKey: parsed.data.GEMINI_API_KEY,
  },
  openai: {
    apiKey: parsed.data.OPENAI_API_KEY,
  },
  isProduction: parsed.data.NODE_ENV === 'production',
  isDevelopment: parsed.data.NODE_ENV === 'development',
} as const;

export type Config = typeof config;
