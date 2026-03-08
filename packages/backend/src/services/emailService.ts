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

/** Send e-bill / receipt email */
export async function sendReceiptEmail(to: string, order: {
  orderNumber: string;
  subtotal: unknown;
  tax: unknown;
  total: unknown;
  discount: unknown;
  createdAt: Date;
  restaurant: { name: string; address?: string | null; phone?: string | null; currency?: string | null };
  table?: { number: string; name?: string | null } | null;
  items: Array<{
    quantity: number;
    menuItem: { name: string } | null;
    modifiers: Array<{ name: string; price: unknown }>;
  }>;
  orderDiscounts?: Array<{ discountAmount: unknown; discount: { name: string } }>;
}): Promise<void> {
  const currency = order.restaurant.currency || '₹';
  const safeName = escapeHtml(order.restaurant.name);

  const itemRows = order.items.map(item => {
    const itemName = escapeHtml(item.menuItem?.name || 'Item');
    const mods = item.modifiers.length > 0
      ? `<br/><span style="color:#9ca3af;font-size:12px;">${item.modifiers.map(m => escapeHtml(m.name)).join(', ')}</span>`
      : '';
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${itemName}${mods}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:center;">${item.quantity}</td>
    </tr>`;
  }).join('');

  const discountRow = Number(order.discount) > 0
    ? `<tr><td style="padding:4px 0;">Discount</td><td style="text-align:right;">-${currency}${Number(order.discount).toFixed(2)}</td></tr>`
    : '';

  const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8faf8;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#1a3c34;font-size:22px;margin:0;">${safeName}</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">E-Receipt</p>
      </div>
      <div style="background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">Order #${escapeHtml(order.orderNumber)}</p>
        ${order.table ? `<p style="color:#6b7280;font-size:13px;margin:0 0 16px;">Table: ${escapeHtml(order.table.name || order.table.number)}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <thead><tr>
            <th style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">Item</th>
            <th style="text-align:center;padding:8px 0;border-bottom:2px solid #e5e7eb;">Qty</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <table style="width:100%;font-size:14px;color:#374151;margin-top:16px;">
          <tr><td style="padding:4px 0;">Subtotal</td><td style="text-align:right;">${currency}${Number(order.subtotal).toFixed(2)}</td></tr>
          ${discountRow}
          <tr><td style="padding:4px 0;">Tax</td><td style="text-align:right;">${currency}${Number(order.tax).toFixed(2)}</td></tr>
          <tr style="font-weight:700;font-size:16px;"><td style="padding:8px 0;border-top:2px solid #1a3c34;">Total</td><td style="text-align:right;padding:8px 0;border-top:2px solid #1a3c34;">${currency}${Number(order.total).toFixed(2)}</td></tr>
        </table>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;">Thank you for dining with us!</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"${safeName}" <${config.smtp.from}>`,
    to,
    subject: `Receipt — Order #${order.orderNumber} from ${order.restaurant.name}`,
    html,
  });
  logger.info({ to, orderNumber: order.orderNumber }, 'Receipt email sent');
}
