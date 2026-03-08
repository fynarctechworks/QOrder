import { prisma, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import { sendReceiptEmail } from './emailService.js';

export const receiptService = {
  async sendReceipt(orderId: string, type: 'EMAIL' | 'WHATSAPP' | 'SMS', recipient: string, restaurantId?: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, ...(restaurantId ? { restaurantId } : {}) },
      include: {
        restaurant: { select: { name: true, address: true, phone: true, currency: true, taxRate: true } },
        table: { select: { number: true, name: true } },
        items: {
          include: {
            menuItem: { select: { name: true } },
            modifiers: true,
          },
        },
        orderDiscounts: { include: { discount: { select: { name: true } } } },
      },
    });

    if (!order) throw AppError.notFound('Order');

    // Create receipt record
    const receipt = await prisma.receipt.create({
      data: { orderId, type, recipient, status: 'PENDING' },
    });

    try {
      if (type === 'EMAIL') {
        await sendReceiptEmail(recipient, order);
      }
      // WhatsApp and SMS can be added later with providers

      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: 'SENT', sentAt: new Date() },
      });

      return { ...receipt, status: 'SENT' };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, orderId, type }, 'Failed to send receipt');
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: 'FAILED', error: errMsg },
      });
      return { ...receipt, status: 'FAILED', error: errMsg };
    }
  },

  async listByOrder(orderId: string, restaurantId?: string) {
    if (restaurantId) {
      const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
      if (!order) throw AppError.notFound('Order');
    }
    return prisma.receipt.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
