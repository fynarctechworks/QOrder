import type { Request, Response, NextFunction } from 'express';
import { prisma, AppError } from '../lib/index.js';

export const billController = {
  async getBill(req: Request, res: Response, next: NextFunction) {
    try {
      const { orderId } = req.params;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          restaurant: { select: { name: true, currency: true, address: true, phone: true } },
          items: {
            include: {
              menuItem: { select: { name: true } },
              modifiers: { select: { name: true, price: true } },
            },
          },
        },
      });

      if (!order) throw AppError.notFound('Bill not found');

      res.json({
        id: order.id,
        tokenNumber: order.tokenNumber,
        orderNumber: order.orderNumber,
        restaurantName: order.restaurant.name,
        currency: order.restaurant.currency,
        restaurantAddress: order.restaurant.address,
        restaurantPhone: order.restaurant.phone,
        customerName: order.customerName,
        createdAt: order.createdAt,
        items: order.items.map(item => ({
          name: item.menuItem?.name ?? 'Item',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          modifiers: item.modifiers.map(m => ({ name: m.name, price: Number(m.price) })),
        })),
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        total: Number(order.total),
      });
    } catch (err) {
      next(err);
    }
  },
};
