import { config } from '../config/index.js';
import { logger, prisma } from '../lib/index.js';

interface BillItem {
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface BillData {
  restaurantName: string;
  currency: string;
  tableNumber: string;
  invoiceId?: string | null;
  items: BillItem[];
  subtotal: string;
  tax: string;
  total: string;
  payments: Array<{ method: string; amount: string }>;
  sessionDate: string;
}

/**
 * Format a phone number to WhatsApp format (E.164 without +)
 * Examples: "+91 98765 43210" → "919876543210", "9876543210" → "919876543210"
 */
function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  // Strip leading 0 from 11-digit numbers (e.g. 09876543210 → 9876543210)
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  // If it's a 10-digit number, assume Indian — prepend 91
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

/**
 * Truncate a Twilio template variable value to stay within the 1024-char limit.
 */
function truncateVar(value: string, max = 1000): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

/**
 * fetch() with an AbortController timeout (default 15 s).
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a formatted bill text message
 */
function buildBillMessage(bill: BillData): string {
  const line = '─'.repeat(28);
  const doubleLine = '═'.repeat(28);

  let message = `🧾 *INVOICE*\n`;
  message += `${doubleLine}\n`;
  message += `🏪 *${bill.restaurantName}*\n`;
  if (bill.invoiceId) {
    message += `📋 Invoice: ${bill.invoiceId}\n`;
  }
  message += `🪑 Table: ${bill.tableNumber}\n`;
  message += `📅 ${bill.sessionDate}\n`;
  message += `${line}\n\n`;

  message += `*ITEMS*\n`;
  message += `${line}\n`;

  for (const item of bill.items) {
    message += `${item.quantity}x ${item.name}\n`;
    message += `   ${bill.currency} ${item.unitPrice} × ${item.quantity} = ${bill.currency} ${item.totalPrice}\n`;
  }

  message += `\n${line}\n`;
  message += `Subtotal: ${bill.currency} ${bill.subtotal}\n`;
  message += `Tax: ${bill.currency} ${bill.tax}\n`;
  message += `${doubleLine}\n`;
  message += `*TOTAL: ${bill.currency} ${bill.total}*\n`;
  message += `${doubleLine}\n\n`;

  if (bill.payments.length > 0) {
    message += `💳 *PAYMENTS*\n`;
    message += `${line}\n`;
    for (const payment of bill.payments) {
      message += `${payment.method}: ${bill.currency} ${payment.amount}\n`;
    }
    message += `\n`;
  }

  message += `✅ *PAID IN FULL*\n\n`;
  message += `Thank you for dining with us! 🙏`;

  return message;
}

/**
 * Send a text message via Twilio WhatsApp API (plain text fallback)
 */
async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  const { accountSid, authToken, whatsappFrom } = config.twilio;

  if (!accountSid || !authToken || !whatsappFrom) {
    logger.warn('Twilio WhatsApp not configured — skipping message send');
    return false;
  }

  const formattedPhone = formatPhoneNumber(to);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const bodyParams = new URLSearchParams({
    From: `whatsapp:${whatsappFrom.startsWith('+') ? whatsappFrom : '+' + whatsappFrom}`,
    To: `whatsapp:+${formattedPhone}`,
    Body: message,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });

      if (response.status === 429 && attempt === 1) {
        logger.warn({ to: formattedPhone }, 'Twilio rate-limited (429) — retrying after 2 s');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ status: response.status, error: errorData }, 'Twilio WhatsApp API error');
        if (response.status >= 500 && attempt === 1) {
          logger.warn({ to: formattedPhone }, 'Twilio 5xx — retrying after 3 s');
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        return false;
      }

      const data = await response.json() as { sid?: string };
      logger.info({ messageSid: data.sid, to: formattedPhone }, 'WhatsApp message sent via Twilio');
      return true;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      logger.error({ error, to: formattedPhone, attempt, isTimeout }, 'Failed to send Twilio WhatsApp message');
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return false;
    }
  }
  return false;
}

/**
 * Send a WhatsApp message using a Twilio Content Template (for business-initiated messages).
 * Templates can be sent to ANY WhatsApp number without prior opt-in.
 * Only falls back to plain text if no template SID is configured (session-based fallback).
 */
async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string>,
  fallbackMessage: string,
): Promise<boolean> {
  if (!contentSid) {
    // No template configured — fall back to plain text (only works in 24hr session window)
    logger.warn('No Content Template SID configured — falling back to plain text (requires opt-in)');
    return sendWhatsAppMessage(to, fallbackMessage);
  }

  const { accountSid, authToken, whatsappFrom } = config.twilio;

  if (!accountSid || !authToken || !whatsappFrom) {
    logger.warn('Twilio WhatsApp not configured — skipping message send');
    return false;
  }

  const formattedPhone = formatPhoneNumber(to);

  // Sanitize: Twilio does not support newlines in ContentVariables; also truncate to 1000 chars each
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    sanitized[key] = truncateVar(value.replace(/\n/g, ', '));
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const bodyParams = new URLSearchParams({
    From: `whatsapp:${whatsappFrom.startsWith('+') ? whatsappFrom : '+' + whatsappFrom}`,
    To: `whatsapp:+${formattedPhone}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(sanitized),
  });

  logger.info({ to: formattedPhone, contentSid }, 'Sending WhatsApp template message');

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.status === 429 && attempt === 1) {
        logger.warn({ to: formattedPhone, contentSid }, 'Twilio rate-limited (429) — retrying after 2 s');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!response.ok) {
        logger.error(
          { status: response.status, errorCode: data.code, errorMessage: data.message, contentSid, to: formattedPhone, attempt },
          'Twilio WhatsApp template API error'
        );
        if (response.status >= 500 && attempt === 1) {
          logger.warn({ to: formattedPhone, contentSid }, 'Twilio 5xx — retrying after 3 s');
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        return false;
      }

      logger.info({ messageSid: data.sid, to: formattedPhone, contentSid }, 'WhatsApp template message sent via Twilio');
      return true;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      logger.error({ error, to: formattedPhone, contentSid, attempt, isTimeout }, 'Failed to send Twilio WhatsApp template');
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return false;
    }
  }
  return false;
}

export const whatsappService = {
  /**
   * Send bill to customer via WhatsApp after session settlement (dine-in)
   */
  async sendBill(sessionId: string, restaurantId: string): Promise<{ sent: boolean; phone?: string }> {
    const session = await prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId },
      include: {
        table: true,
        restaurant: { select: { name: true, currency: true } },
        orders: {
          where: { status: { notIn: ['CANCELLED'] } },
          include: {
            items: {
              include: {
                menuItem: { select: { name: true } },
                modifiers: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        payments: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      logger.warn({ sessionId }, 'Session not found for WhatsApp bill');
      return { sent: false };
    }

    const customerPhone = session.orders.find((o) => o.customerPhone)?.customerPhone;
    if (!customerPhone) {
      logger.info({ sessionId }, 'No customer phone found — skipping WhatsApp bill');
      return { sent: false };
    }

    const rawItems = session.orders.flatMap((order) =>
      order.items.map((item) => ({
        name: item.menuItem?.name ?? 'Deleted Item',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      }))
    );

    // Group identical items
    const grouped = new Map<string, { name: string; quantity: number; unitPrice: number; totalPrice: number }>();
    for (const item of rawItems) {
      const existing = grouped.get(item.name);
      if (existing && existing.unitPrice === item.unitPrice) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.totalPrice;
      } else {
        grouped.set(item.name + '::' + item.unitPrice, { ...item });
      }
    }

    const items: BillItem[] = Array.from(grouped.values()).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      totalPrice: item.totalPrice.toFixed(2),
    }));

    const billData: BillData = {
      restaurantName: session.restaurant.name,
      currency: session.restaurant.currency,
      tableNumber: session.table?.number || 'N/A',
      invoiceId: session.invoiceId,
      items,
      subtotal: Number(session.subtotal).toFixed(2),
      tax: Number(session.tax).toFixed(2),
      total: Number(session.totalAmount).toFixed(2),
      payments: session.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount).toFixed(2),
      })),
      sessionDate: new Date(session.startedAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const message = buildBillMessage(billData);

    // Universal 6-variable template: works for dine-in, takeaway, and QSR
    const templateSid = config.twilio.templates.orderInvoice;
    const orderInfo = `Dine-in | Table ${billData.tableNumber} | ${billData.sessionDate}`;
    const itemsText = items.map(i => `${i.quantity}x ${i.name} ${billData.currency}${i.totalPrice}`).join(', ');

    const sent = await sendWhatsAppTemplate(
      customerPhone,
      templateSid,
      {
        '1': billData.restaurantName,
        '2': orderInfo,
        '3': itemsText,
        '4': `${billData.currency}${billData.subtotal}`,
        '5': `${billData.currency}${billData.tax}`,
        '6': `${billData.currency}${billData.total}`,
      },
      message,
    );

    return { sent, phone: customerPhone };
  },

  /**
   * Send bill to customer via WhatsApp after takeaway order settlement
   */
  async sendOrderBill(orderIds: string[], restaurantId: string): Promise<{ sent: boolean; phone?: string }> {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, restaurantId },
      include: {
        restaurant: { select: { name: true, currency: true } },
        items: {
          include: {
            menuItem: { select: { name: true } },
            modifiers: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (orders.length === 0) {
      logger.warn({ orderIds }, 'No orders found for WhatsApp bill');
      return { sent: false };
    }

    const firstOrder = orders[0]!;

    const customerPhone = orders.find((o) => o.customerPhone)?.customerPhone;
    if (!customerPhone) {
      logger.info({ orderIds }, 'No customer phone found on order — skipping WhatsApp bill');
      return { sent: false };
    }

    logger.info({ customerPhone, orderIds, restaurantId }, 'Preparing WhatsApp invoice for customer');

    const restaurant = firstOrder.restaurant;

    const rawOrderItems = orders.flatMap((order) =>
      order.items.map((item) => ({
        name: item.menuItem?.name ?? 'Deleted Item',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      }))
    );

    // Group identical items
    const groupedOrder = new Map<string, { name: string; quantity: number; unitPrice: number; totalPrice: number }>();
    for (const item of rawOrderItems) {
      const gKey = item.name + '::' + item.unitPrice;
      const existing = groupedOrder.get(gKey);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.totalPrice;
      } else {
        groupedOrder.set(gKey, { ...item });
      }
    }

    const items: BillItem[] = Array.from(groupedOrder.values()).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      totalPrice: item.totalPrice.toFixed(2),
    }));

    const subtotal = orders.reduce((s, o) => s + Number(o.subtotal), 0);
    const tax = orders.reduce((s, o) => s + Number(o.tax), 0);
    const total = orders.reduce((s, o) => s + Number(o.total), 0);

    const billData: BillData = {
      restaurantName: restaurant.name,
      currency: restaurant.currency,
      tableNumber: 'Takeaway',
      items,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      payments: [],
      sessionDate: new Date(firstOrder.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const message = buildBillMessage(billData);

    // Universal 6-variable template: works for dine-in, takeaway, and QSR
    const templateSid = config.twilio.templates.orderInvoice;
    const orderType = firstOrder.orderType === 'QSR' ? 'QSR' : 'Takeaway';
    const orderInfo = `${orderType} | ${billData.sessionDate}`;
    const itemsText = items.map(i => `${i.quantity}x ${i.name} ${billData.currency}${i.totalPrice}`).join(', ');

    const sent = await sendWhatsAppTemplate(
      customerPhone,
      templateSid,
      {
        '1': billData.restaurantName,
        '2': orderInfo,
        '3': itemsText,
        '4': `${billData.currency}${billData.subtotal}`,
        '5': `${billData.currency}${billData.tax}`,
        '6': `${billData.currency}${billData.total}`,
      },
      message,
    );

    return { sent, phone: customerPhone };
  },

  /**
   * Send low stock alert to admin via WhatsApp
   */
  async sendLowStockAlert(
    adminPhone: string,
    restaurantName: string,
    items: Array<{ name: string; unit: string; currentStock: number; minStock: number }>
  ): Promise<boolean> {
    const line = '─'.repeat(28);
    let message = `⚠️ *LOW STOCK ALERT*\n`;
    message += `${line}\n`;
    message += `🏪 *${restaurantName}*\n`;
    message += `📅 ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;
    message += `${line}\n\n`;
    message += `${items.length} ingredient(s) are running low:\n\n`;

    for (const item of items) {
      const pct = item.minStock > 0 ? Math.round((item.currentStock / item.minStock) * 100) : 0;
      message += `🔴 *${item.name}*\n`;
      message += `   Stock: ${item.currentStock} ${item.unit} (min: ${item.minStock} ${item.unit}) — ${pct}%\n\n`;
    }

    message += `Please restock soon to avoid disruptions. 🙏`;

    const templateSid = config.twilio.templates.lowStock;
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const itemsText = items.map(i => {
      const pct = i.minStock > 0 ? Math.round((i.currentStock / i.minStock) * 100) : 0;
      return `🔴 ${i.name} — Stock: ${i.currentStock} ${i.unit} (min: ${i.minStock} ${i.unit}) — ${pct}%`;
    }).join(', ');

    return sendWhatsAppTemplate(
      adminPhone,
      templateSid,
      {
        '1': restaurantName,
        '2': dateStr,
        '3': String(items.length),
        '4': itemsText,
      },
      message,
    );
  },

  /**
   * Send staff late login alert to admin via WhatsApp
   */
  async sendStaffLateAlert(
    adminPhone: string,
    restaurantName: string,
    lateStaff: Array<{ name: string; shiftName: string; shiftStart: string; minutesLate: number }>
  ): Promise<boolean> {
    const line = '─'.repeat(28);
    let message = `⏰ *STAFF LATE ALERT*\n`;
    message += `${line}\n`;
    message += `🏪 *${restaurantName}*\n`;
    message += `📅 ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;
    message += `${line}\n\n`;
    message += `${lateStaff.length} staff member(s) haven't checked in:\n\n`;

    for (const staff of lateStaff) {
      message += `🔶 *${staff.name}*\n`;
      message += `   Shift: ${staff.shiftName} (${staff.shiftStart})\n`;
      message += `   Late by: ${staff.minutesLate} minutes\n\n`;
    }

    message += `Please follow up with them. 🙏`;

    const templateSid = config.twilio.templates.staffLate;
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const staffText = lateStaff.map(s => `🔶 ${s.name} — Shift: ${s.shiftName} (${s.shiftStart}) — Late by: ${s.minutesLate} minutes`).join(', ');

    return sendWhatsAppTemplate(
      adminPhone,
      templateSid,
      {
        '1': restaurantName,
        '2': dateStr,
        '3': String(lateStaff.length),
        '4': staffText,
      },
      message,
    );
  },

  /**
   * Send staff early checkout alert to admin via WhatsApp
   */
  async sendStaffEarlyCheckoutAlert(
    adminPhone: string,
    restaurantName: string,
    earlyStaff: Array<{ name: string; shiftName: string; shiftEnd: string; minutesEarly: number }>
  ): Promise<boolean> {
    const line = '─'.repeat(28);
    let message = `🚪 *EARLY CHECKOUT ALERT*\n`;
    message += `${line}\n`;
    message += `🏪 *${restaurantName}*\n`;
    message += `📅 ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;
    message += `${line}\n\n`;
    message += `${earlyStaff.length} staff member(s) checked out early:\n\n`;

    for (const staff of earlyStaff) {
      message += `🔶 *${staff.name}*\n`;
      message += `   Shift: ${staff.shiftName} (ends ${staff.shiftEnd})\n`;
      message += `   Left ${staff.minutesEarly} minutes early\n\n`;
    }

    message += `Please follow up with them. 🙏`;

    const templateSid = config.twilio.templates.earlyCheckout;
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const staffText = earlyStaff.map(s => `🔶 ${s.name} — Shift: ${s.shiftName} (ends ${s.shiftEnd}) — Left ${s.minutesEarly} minutes early`).join(', ');

    return sendWhatsAppTemplate(
      adminPhone,
      templateSid,
      {
        '1': restaurantName,
        '2': dateStr,
        '3': String(earlyStaff.length),
        '4': staffText,
      },
      message,
    );
  },
};
