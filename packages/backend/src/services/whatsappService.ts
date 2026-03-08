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
  // If it's a 10-digit Indian number, prepend 91
  if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
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
 * Send a text message via Twilio WhatsApp API
 */
async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  const { accountSid, authToken, whatsappFrom } = config.twilio;

  if (!accountSid || !authToken || !whatsappFrom) {
    logger.warn('Twilio WhatsApp not configured — skipping message send');
    return false;
  }

  const formattedPhone = formatPhoneNumber(to);

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const body = new URLSearchParams({
      From: `whatsapp:${whatsappFrom.startsWith('+') ? whatsappFrom : '+' + whatsappFrom}`,
      To: `whatsapp:+${formattedPhone}`,
      Body: message,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error({ status: response.status, error: errorData }, 'Twilio WhatsApp API error');
      return false;
    }

    const data = await response.json() as { sid?: string };
    logger.info({ messageSid: data.sid, to: formattedPhone }, 'WhatsApp bill sent via Twilio');
    return true;
  } catch (error) {
    logger.error({ error, to: formattedPhone }, 'Failed to send Twilio WhatsApp message');
    return false;
  }
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

    const items: BillItem[] = session.orders.flatMap((order) =>
      order.items.map((item) => ({
        name: item.menuItem?.name ?? 'Deleted Item',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice).toFixed(2),
        totalPrice: Number(item.totalPrice).toFixed(2),
      }))
    );

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
    const sent = await sendWhatsAppMessage(customerPhone, message);

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

    const customerPhone = orders.find((o) => o.customerPhone)?.customerPhone;
    if (!customerPhone) {
      logger.info({ orderIds }, 'No customer phone found — skipping WhatsApp bill');
      return { sent: false };
    }

    const restaurant = orders[0].restaurant;

    const items: BillItem[] = orders.flatMap((order) =>
      order.items.map((item) => ({
        name: item.menuItem?.name ?? 'Deleted Item',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice).toFixed(2),
        totalPrice: Number(item.totalPrice).toFixed(2),
      }))
    );

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
      sessionDate: new Date(orders[0].createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const message = buildBillMessage(billData);
    const sent = await sendWhatsAppMessage(customerPhone, message);

    return { sent, phone: customerPhone };
  },
};
