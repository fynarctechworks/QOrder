import nodemailer from 'nodemailer';
import { randomInt } from 'crypto';
import { config } from '../config/index.js';
import { logger } from '../lib/index.js';

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

/** Generate a cryptographically secure 6-digit OTP */
export function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

/** HTML-escape a string to prevent XSS in email templates */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Send verification OTP email */
export async function sendVerificationEmail(
  to: string,
  otp: string,
  userName: string
): Promise<void> {
  const safeUserName = escapeHtml(userName);
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8faf8; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a3c34; font-size: 22px; margin: 0;">Q Order</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Email Verification</p>
      </div>
      
      <div style="background: #ffffff; border-radius: 12px; padding: 28px 24px; border: 1px solid #e5e7eb;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 8px;">Hi <strong>${safeUserName}</strong>,</p>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">
          Use the following code to verify your email address and complete your registration.
        </p>
        
        <div style="text-align: center; margin: 24px 0;">
          <div style="display: inline-block; background: #f0fdf4; border: 2px dashed #1a3c34; border-radius: 12px; padding: 16px 32px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a3c34;">${otp}</span>
          </div>
        </div>
        
        <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0;">
          This code expires in <strong>10 minutes</strong>.
        </p>
      </div>
      
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px; line-height: 1.4;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Q Order" <${config.smtp.from}>`,
      to,
      subject: `${otp} — Verify your email for Q Order`,
      html,
    });
    logger.info({ to }, 'Verification email sent');
  } catch (error) {
    logger.error({ error, to }, 'Failed to send verification email');
    throw new Error('Failed to send verification email. Please try again.');
  }
}
