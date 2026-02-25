import { Request, Response, NextFunction } from 'express';
import { orderService } from '../services/index.js';
import { getIO } from '../socket/index.js';
import { AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import type { ApiResponse } from '../types/index.js';
import type { CreateOrderInput, UpdateOrderStatusInput, OrderQueryInput } from '../validators/index.js';

/* ─── Typed interface for restaurant data from middleware ─── */
interface RestaurantMiddlewareData {
  taxRate: unknown;
  settings: unknown;
}

/* ─── Response transformer ────────────────────────────────── */
// Groups flat OrderItemModifiers by their ModifierGroup so the
// admin front-end receives a hierarchical customization structure.

interface RawModifier {
  id: string;
  name: string;
  price: unknown; // Decimal from Prisma
  modifierId: string;
  modifier?: {
    modifierGroup?: {
      id: string;
      name: string;
    };
  };
}

interface RawOrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: unknown;
  totalPrice: unknown;
  notes?: string | null;
  itemSnapshot?: unknown;
  menuItem: { id?: string; name: string; image?: string | null };
  modifiers?: RawModifier[];
}

interface RawOrder {
  id: string;
  orderNumber: string;
  restaurantId: string;
  tableId?: string | null;
  table?: { id: string; number: string; name?: string | null } | null;
  status: string;
  subtotal: unknown;
  tax: unknown;
  total: unknown;
  notes?: string | null;
  estimatedTime?: number | null;
  createdAt: Date;
  updatedAt: Date;
  items: RawOrderItem[];
  [key: string]: unknown;
}

function groupModifiers(modifiers: RawModifier[] = []) {
  const groups: Record<string, {
    groupId: string;
    groupName: string;
    options: { id: string; name: string; priceModifier: number }[];
  }> = {};

  for (const mod of modifiers) {
    const groupId = mod.modifier?.modifierGroup?.id ?? 'ungrouped';
    const groupName = mod.modifier?.modifierGroup?.name ?? 'Options';

    if (!groups[groupId]) {
      groups[groupId] = { groupId, groupName, options: [] };
    }

    groups[groupId].options.push({
      id: mod.modifierId,
      name: mod.name,
      priceModifier: Number(mod.price),
    });
  }

  return Object.values(groups);
}

function transformOrder(raw: RawOrder) {
  // Map backend statuses to frontend
  const statusMap: Record<string, string> = { PAYMENT_PENDING: 'payment_pending' };
  const status = statusMap[raw.status] || raw.status.toLowerCase();

  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    restaurantId: raw.restaurantId,
    tableId: raw.tableId ?? '',
    tableName: raw.table
      ? (raw.table.name ? `${raw.table.name} ${raw.table.number}` : `Table ${raw.table.number}`)
      : 'Takeaway',
    status,
    items: raw.items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItem.name,
      menuItemImage: item.menuItem.image ?? undefined,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      customizations: groupModifiers(item.modifiers),
      specialInstructions: item.notes ?? undefined,
    })),
    subtotal: Number(raw.subtotal),
    tax: Number(raw.tax),
    total: Number(raw.total),
    specialInstructions: raw.notes ?? undefined,
    customerName: (raw.customerName as string) ?? undefined,
    customerPhone: (raw.customerPhone as string) ?? undefined,
    estimatedReadyTime: raw.estimatedTime
      ? new Date(Date.now() + raw.estimatedTime * 60_000).toISOString()
      : undefined,
    preparedAt: raw.preparedAt ? (raw.preparedAt as Date).toISOString() : undefined,
    completedAt: raw.completedAt ? (raw.completedAt as Date).toISOString() : undefined,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}

/* ─────────────────────────────────────────────────────────── */

export const orderController = {
  async getOrders(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const query = req.query as unknown as OrderQueryInput;
      const result = await orderService.getOrders(restaurantId, query);

      res.json({
        success: true,
        data: result.orders.map(o => transformOrder(o as unknown as RawOrder)),
        meta: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  async getActiveOrders(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const orders = await orderService.getActiveOrders(restaurantId);

      res.json({
        success: true,
        data: orders.map(o => transformOrder(o as unknown as RawOrder)),
      });
    } catch (error) {
      next(error);
    }
  },

  async getOrderById(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId;
      const order = await orderService.getOrderById(req.params.id, restaurantId);

      res.json({
        success: true,
        data: transformOrder(order as unknown as RawOrder),
      });
    } catch (error) {
      next(error);
    }
  },

  async createOrder(
    req: Request<unknown, unknown, CreateOrderInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const restaurantData = (req as unknown as { restaurantData?: RestaurantMiddlewareData }).restaurantData;
      const order = await orderService.createOrder(restaurantId, req.body, restaurantData);

      // Emit new order to restaurant room via Socket.io
      const io = getIO();
      if (io) {
        const payload = orderService.toSocketPayload(order as unknown as Awaited<ReturnType<typeof orderService.getOrderById>>);
        io.to(`restaurant:${restaurantId}`).emit('order:new', payload);
        
        // Emit table update for running bills
        if (order.tableId) {
          io.to(`restaurant:${restaurantId}`).emit('table:updated', { tableId: order.tableId });
        }
      }

      res.status(201).json({
        success: true,
        data: transformOrder(order as unknown as RawOrder),
      });
    } catch (error) {
      next(error);
    }
  },

// Cashier/admin order creation — goes straight to PREPARING
  async createCashierOrder(
    req: Request<unknown, unknown, CreateOrderInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const restaurantData = (req as unknown as { restaurantData?: RestaurantMiddlewareData }).restaurantData;
      const order = await orderService.createOrder(restaurantId, req.body, restaurantData, 'PREPARING');

      // Emit new order to restaurant room via Socket.io
      const io = getIO();
      if (io) {
        const payload = orderService.toSocketPayload(order as unknown as Awaited<ReturnType<typeof orderService.getOrderById>>);
        io.to(`restaurant:${restaurantId}`).emit('order:new', payload);

        if (order.tableId) {
          io.to(`restaurant:${restaurantId}`).emit('table:updated', { tableId: order.tableId });
        }
      }

      res.status(201).json({
        success: true,
        data: transformOrder(order as unknown as RawOrder),
      });
    } catch (error) {
      next(error);
    }
  },

  async updateOrderStatus(
    req: Request<{ id: string }, unknown, UpdateOrderStatusInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const { order, payload } = await orderService.updateOrderStatus(
        req.params.id,
        restaurantId,
        req.body
      );

      // Emit status update via Socket.io (wrapped in try-catch so
      // a socket failure does not prevent the HTTP 200 response)
      try {
        const io = getIO();
        if (io) {
          // Notify restaurant staff
          io.to(`restaurant:${restaurantId}`).emit('order:statusUpdate', payload);
          
          // Notify customer (via order ID room)
          io.to(`order:${order!.id}`).emit('order:statusUpdate', payload);

          // Notify table if applicable
          if (order!.tableId) {
            io.to(`table:${order!.tableId}`).emit('order:statusUpdate', payload);
            
            // Emit table update for running bills
            io.to(`restaurant:${restaurantId}`).emit('table:updated', { tableId: order!.tableId });
          }
        }
      } catch (socketErr) {
        logger.error({ err: socketErr }, 'Socket emission failed after status update');
      }

      res.json({
        success: true,
        data: transformOrder(order as unknown as RawOrder),
      });
    } catch (error) {
      next(error);
    }
  },

  async getOrderStats(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const dateFrom = req.query.dateFrom 
        ? new Date(req.query.dateFrom as string) 
        : undefined;
      const dateTo = req.query.dateTo 
        ? new Date(req.query.dateTo as string) 
        : undefined;

      if (dateFrom && isNaN(dateFrom.getTime())) {
        throw AppError.badRequest('Invalid dateFrom format');
      }
      if (dateTo && isNaN(dateTo.getTime())) {
        throw AppError.badRequest('Invalid dateTo format');
      }

      const stats = await orderService.getOrderStats(restaurantId, dateFrom, dateTo);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getAnalytics(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const period = (req.query.period as string) || 'day';
      const days = Math.min(parseInt(req.query.days as string) || 7, 365);

      // If period is specified, use the summary endpoint
      if (req.query.period) {
        const summary = await orderService.getAnalyticsSummary(restaurantId, period);
        res.json({ success: true, data: summary });
        return;
      }

      const analytics = await orderService.getAnalytics(restaurantId, days);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  },

  // Public endpoint for customers to get their table's orders
  async getPublicTableOrders(
    req: Request<{ tableId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const orders = await orderService.getOrdersByTable(req.params.tableId);

      res.json({
        success: true,
        data: orders.map(o => transformOrder(o as unknown as RawOrder)),
      });
    } catch (error) {
      next(error);
    }
  },

  // Public endpoint for customers to track their order
  async getPublicOrderStatus(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const order = await orderService.getOrderById(req.params.id);

      res.json({
        success: true,
        data: transformOrder(order as unknown as RawOrder),
      });
    } catch (error) {
      next(error);
    }
  },

  // Public endpoint for customers to cancel their order (only while PENDING)
  async cancelOrder(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const order = await orderService.getOrderById(req.params.id);

      if (order.status !== 'PENDING') {
        throw AppError.badRequest('Order can only be cancelled while pending');
      }

      // If the request is authenticated (admin route), verify the order belongs to the user's restaurant
      if (req.restaurantId && order.restaurantId !== req.restaurantId) {
        throw AppError.forbidden('You do not have access to this order');
      }

      const restaurantId = order.restaurantId;
      const { order: updated, payload } = await orderService.updateOrderStatus(
        req.params.id,
        restaurantId,
        { status: 'CANCELLED' }
      );

      // Emit via Socket.io
      const io = getIO();
      if (io) {
        io.to(`restaurant:${restaurantId}`).emit('order:statusUpdate', payload);
        io.to(`order:${updated!.id}`).emit('order:statusUpdate', payload);
        if (updated!.tableId) {
          io.to(`table:${updated!.tableId}`).emit('order:statusUpdate', payload);
          io.to(`restaurant:${restaurantId}`).emit('table:updated', { tableId: updated!.tableId });
        }
      }

      res.json({
        success: true,
        data: transformOrder(updated as unknown as RawOrder),
      });
    } catch (error) {
      next(error);
    }
  },
};
