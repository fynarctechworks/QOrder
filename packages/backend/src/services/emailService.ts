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

/** Send password-reset OTP email */
export async function sendPasswordResetEmail(
  to: string,
  otp: string,
  userName: string
): Promise<void> {
  const safeUserName = escapeHtml(userName);
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8faf8; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a3c34; font-size: 22px; margin: 0;">Q Order</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Password Reset</p>
      </div>
      
      <div style="background: #ffffff; border-radius: 12px; padding: 28px 24px; border: 1px solid #e5e7eb;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 8px;">Hi <strong>${safeUserName}</strong>,</p>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">
          We received a request to reset your password. Use the code below to proceed.
        </p>
        
        <div style="text-align: center; margin: 24px 0;">
          <div style="display: inline-block; background: #fef3c7; border: 2px dashed #d97706; border-radius: 12px; padding: 16px 32px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #92400e;">${otp}</span>
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
      subject: `${otp} — Reset your Q Order password`,
      html,
    });
    logger.info({ to }, 'Password reset email sent');
  } catch (error) {
    logger.error({ error, to }, 'Failed to send password reset email');
    throw new Error('Failed to send password reset email. Please try again.');
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

/** Send daily end-of-day report email */
export async function sendDailyReportEmail(recipients: string[], report: {
  restaurantName: string;
  currency: string;
  dateLabel: string;
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  settled: number;
  pending: number;
  cancelledCount: number;
  byType: Array<{ orderType: string; count: bigint; revenue: number }>;
  topItems: Array<{ name: string; qty: bigint; revenue: number }>;
}): Promise<void> {
  const c = report.currency;
  const fmt = (n: number) => `${c}${n.toFixed(2)}`;
  const safe = (s: string) => escapeHtml(s);

  const typeLabels: Record<string, string> = { QSR: 'QSR / Counter', DINE_IN: 'Dine-In', TAKEAWAY: 'Takeaway' };

  const typeRows = report.byType.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${typeLabels[r.orderType] ?? r.orderType}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">${Number(r.count)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmt(r.revenue)}</td>
    </tr>`).join('');

  const itemRows = report.topItems.map((item, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${safe(item.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">${Number(item.qty)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmt(item.revenue)}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f8faf8;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#1a3c34;font-size:22px;margin:0;">${safe(report.restaurantName)}</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">Daily Report — ${safe(report.dateLabel)}</p>
      </div>

      <!-- Summary -->
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;margin-bottom:16px;">
        <h2 style="color:#1a3c34;font-size:15px;margin:0 0 16px;">Day Summary</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <tr><td style="padding:6px 0;">Total Orders</td><td style="text-align:right;font-weight:600;">${report.totalOrders}</td></tr>
          <tr><td style="padding:6px 0;">Total Revenue</td><td style="text-align:right;font-weight:600;">${fmt(report.totalRevenue)}</td></tr>
          <tr><td style="padding:6px 0;">Tax Collected</td><td style="text-align:right;">${fmt(report.totalTax)}</td></tr>
          <tr><td style="padding:6px 0;">Discounts Given</td><td style="text-align:right;">-${fmt(report.totalDiscount)}</td></tr>
          <tr><td style="padding:6px 0;color:#ef4444;">Cancelled Orders</td><td style="text-align:right;color:#ef4444;">${report.cancelledCount}</td></tr>
        </table>
      </div>

      <!-- By Order Type -->
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;margin-bottom:16px;">
        <h2 style="color:#1a3c34;font-size:15px;margin:0 0 16px;">By Order Type</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;">Type</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;">Orders</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;">Revenue</th>
          </tr></thead>
          <tbody>${typeRows}</tbody>
        </table>
      </div>

      <!-- Payment Status -->
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;margin-bottom:16px;">
        <h2 style="color:#1a3c34;font-size:15px;margin:0 0 16px;">Payment Status</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <tr><td style="padding:6px 0;color:#16a34a;">✓ Settled</td><td style="text-align:right;font-weight:600;color:#16a34a;">${fmt(report.settled)}</td></tr>
          <tr><td style="padding:6px 0;color:#d97706;">⏳ Pending</td><td style="text-align:right;font-weight:600;color:#d97706;">${fmt(report.pending)}</td></tr>
        </table>
      </div>

      <!-- Top Items -->
      ${report.topItems.length > 0 ? `
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;margin-bottom:16px;">
        <h2 style="color:#1a3c34;font-size:15px;margin:0 0 16px;">Top Selling Items</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;">#</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;">Item</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;">Revenue</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>` : ''}

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;">Generated by Q Order • ${safe(report.dateLabel)}</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Q Order Reports" <${config.smtp.from}>`,
    to: recipients.join(', '),
    subject: `Daily Report — ${report.restaurantName} — ${report.dateLabel}`,
    html,
  });
  logger.info({ recipients, restaurant: report.restaurantName }, 'Daily report email sent');
}
