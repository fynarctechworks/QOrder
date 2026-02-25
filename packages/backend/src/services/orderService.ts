import { Decimal } from '@prisma/client/runtime/library';
import { randomBytes } from 'crypto';
import { prisma, cache, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import type { CreateOrderInput, UpdateOrderStatusInput, OrderQueryInput } from '../validators/index.js';
import { OrderStatus } from '@prisma/client';
import type { OrderSocketPayload, OrderStatusUpdate } from '../types/index.js';

// Generate human-readable order number
function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear().toString().slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = randomBytes(3).toString('hex').substring(0, 4).toUpperCase();
  return `${dateStr}-${random}`;
}

export const orderService = {
  async getOrders(restaurantId: string, query: OrderQueryInput) {
    const { status, tableId, dateFrom, dateTo, page, limit, sortBy, sortOrder } = query;

    const where = {
      restaurantId,
      ...(status ? { status } : {}),
      ...(tableId ? { tableId } : {}),
      ...(dateFrom || dateTo ? {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(dateTo) } : {}),
        },
      } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          table: { select: { id: true, number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, image: true } },
              modifiers: {
                include: {
                  modifier: {
                    include: {
                      modifierGroup: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getActiveOrders(restaurantId: string) {
    // Try cache first
    const cacheKey = cache.keys.activeOrders(restaurantId);
    const cached = await cache.get<Awaited<ReturnType<typeof this.fetchActiveOrders>>>(cacheKey);
    
    if (cached) return cached;

    const orders = await this.fetchActiveOrders(restaurantId);
    await cache.set(cacheKey, orders, cache.ttl.short);
    
    return orders;
  },

  async fetchActiveOrders(restaurantId: string) {
    return prisma.order.findMany({
      where: {
        restaurantId,
        status: {
          in: ['PENDING', 'PREPARING'],
        },
      },
      include: {
        table: { select: { id: true, number: true, name: true } },
        items: {
          include: {
            menuItem: { select: { id: true, name: true, price: true, image: true } },
            modifiers: {
              include: {
                modifier: {
                  include: {
                    modifierGroup: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async getOrdersByTable(tableId: string) {
    return prisma.order.findMany({
      where: {
        tableId,
        createdAt: {
          // Only show orders from the last 24 hours
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      include: {
        table: { select: { id: true, number: true, name: true } },
        items: {
          include: {
            menuItem: { select: { id: true, name: true, image: true } },
            modifiers: {
              include: {
                modifier: {
                  include: {
                    modifierGroup: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Reasonable limit — busy tables won't load hundreds of orders
    });
  },

  async getOrderById(orderId: string, restaurantId?: string) {
    const where = restaurantId 
      ? { id: orderId, restaurantId }
      : { id: orderId };

    const order = await prisma.order.findFirst({
      where,
      include: {
        restaurant: { 
          select: { 
            id: true, 
            name: true, 
            slug: true,
            phone: true,
          } 
        },
        table: { select: { id: true, number: true, name: true } },
        items: {
          include: {
            menuItem: { select: { id: true, name: true, image: true } },
            modifiers: {
              include: {
                modifier: {
                  include: {
                    modifierGroup: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw AppError.notFound('Order');
    }

    return order;
  },

  async createOrder(restaurantId: string, input: CreateOrderInput, restaurantData?: { taxRate: unknown; settings: unknown }, initialStatus?: 'PENDING' | 'PREPARING') {
    const { items, tableId, ...orderData } = input;

    // Parallel fetch: restaurant (if not pre-loaded), table validation, and menu items
    const menuItemIds = items.map(i => i.menuItemId);

    const [restaurant, table, menuItems] = await Promise.all([
      // 1. Restaurant tax rate + settings (skip DB if already resolved by middleware)
      restaurantData
        ? Promise.resolve(restaurantData as { taxRate: unknown; settings: unknown })
        : prisma.restaurant.findUnique({
            where: { id: restaurantId },
            select: { taxRate: true, settings: true },
          }),
      // 2. Table validation (skip if no tableId)
      tableId
        ? prisma.table.findFirst({ where: { id: tableId, restaurantId } })
        : Promise.resolve(null),
      // 3. Menu items with modifiers
      prisma.menuItem.findMany({
        where: {
          id: { in: menuItemIds },
          restaurantId,
          isActive: true,
          isAvailable: true,
        },
        include: {
          modifierGroups: {
            include: {
              modifierGroup: {
                include: {
                  modifiers: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    // Check if restaurant accepts orders (from settings)
    const settings = restaurant.settings as Record<string, unknown> || {};
    if (settings.acceptsOrders === false || settings.acceptingOrders === false) {
      throw AppError.badRequest('Restaurant is not currently accepting orders');
    }

    // Validate table
    if (tableId && !table) {
      throw AppError.notFound('Table');
    }

    // Look up active session for this table (to link order → session)
    let sessionId: string | undefined;
    if (tableId) {
      const activeSession = await prisma.tableSession.findFirst({
        where: { tableId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeSession) {
        sessionId = activeSession.id;
      }
    }

    if (menuItems.length !== menuItemIds.length) {
      throw AppError.badRequest('Some menu items are not available');
    }

    // Create item map for easy lookup
    const menuItemMap = new Map(menuItems.map(item => [item.id, item]));

    // Calculate totals and prepare order items
    let subtotal = new Decimal(0);
    const orderItems: Array<{
      menuItemId: string;
      quantity: number;
      unitPrice: Decimal;
      totalPrice: Decimal;
      notes?: string;
      itemSnapshot: object;
      modifiers: Array<{
        modifierId: string;
        name: string;
        price: Decimal;
      }>;
    }> = [];

    for (const item of items) {
      const menuItem = menuItemMap.get(item.menuItemId)!;
      let itemPrice = new Decimal(menuItem.price);

      // Process modifiers
      const itemModifiers: Array<{
        modifierId: string;
        name: string;
        price: Decimal;
      }> = [];

      if (item.modifiers && item.modifiers.length > 0) {
        // Validate modifiers belong to this item's modifier groups
        const validModifierIds = menuItem.modifierGroups.flatMap(
          mg => mg.modifierGroup.modifiers.map(m => m.id)
        );

        for (const mod of item.modifiers) {
          if (!validModifierIds.includes(mod.modifierId)) {
            throw AppError.badRequest(`Invalid modifier for item ${menuItem.name}`);
          }

          const modifier = menuItem.modifierGroups
            .flatMap(mg => mg.modifierGroup.modifiers)
            .find(m => m.id === mod.modifierId);

          if (modifier) {
            itemPrice = itemPrice.plus(modifier.price);
            itemModifiers.push({
              modifierId: modifier.id,
              name: modifier.name,
              price: new Decimal(modifier.price),
            });
          }
        }
      }

      const totalPrice = itemPrice.times(item.quantity);
      subtotal = subtotal.plus(totalPrice);

      orderItems.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: itemPrice,
        totalPrice,
        notes: item.notes,
        itemSnapshot: {
          name: menuItem.name,
          price: menuItem.price,
          description: menuItem.description,
          image: menuItem.image,
        },
        modifiers: itemModifiers,
      });
    }

    // Calculate tax
    const taxRate = new Decimal(restaurant.taxRate as string | number);
    const tax = subtotal.times(taxRate).dividedBy(100).toDecimalPlaces(2);
    const total = subtotal.plus(tax);

    // Create order with unique order number (retry on collision — P2002)
    let order;
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const orderNumber = generateOrderNumber();
      try {
        order = await prisma.order.create({
          data: {
            orderNumber,
            restaurantId,
            tableId,
            sessionId,
            status: initialStatus || 'PENDING',
            subtotal,
            tax,
            total,
            customerName: orderData.customerName,
            customerPhone: orderData.customerPhone,
            notes: orderData.notes,
            items: {
              create: orderItems.map(item => ({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                notes: item.notes,
                itemSnapshot: item.itemSnapshot,
                modifiers: {
                  create: item.modifiers.map(mod => ({
                    modifierId: mod.modifierId,
                    name: mod.name,
                    price: mod.price,
                  })),
                },
              })),
            },
          },
          include: {
            table: { select: { id: true, number: true, name: true } },
            items: {
              include: {
                menuItem: { select: { id: true, name: true, price: true, image: true } },
                modifiers: {
                  include: {
                    modifier: {
                      include: {
                        modifierGroup: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        break; // success — exit retry loop
      } catch (err: unknown) {
        // P2002 = unique constraint violation (order number collision)
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2002' && attempt < MAX_RETRIES - 1) {
          continue; // retry with a new order number
        }
        throw err;
      }
    }

    if (!order) {
      throw AppError.internal('Failed to generate unique order number after retries');
    }

    // Fire-and-forget: table update + cache invalidation (don't block response)
    const postOps: Promise<unknown>[] = [
      cache.del(cache.keys.activeOrders(restaurantId)).catch((err) => {
        logger.error({ err }, 'Failed to invalidate active orders cache');
      }),
    ];
    if (tableId) {
      postOps.push(
        prisma.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } }).catch((err) => {
          logger.error({ err, tableId }, 'Failed to update table status to OCCUPIED');
        }),
        cache.del(cache.keys.tables(restaurantId)).catch((err) => {
          logger.error({ err }, 'Failed to invalidate tables cache');
        }),
      );
    }
    // Run all post-create ops in parallel, don't await (non-critical)
    Promise.all(postOps).catch((err) => {
      logger.error({ err }, 'Post-create operations failed');
    });

    return order;
  },

  async updateOrderStatus(
    orderId: string, 
    restaurantId: string, 
    input: UpdateOrderStatusInput
  ): Promise<{ order: Awaited<ReturnType<typeof prisma.order.findFirst>>; payload: OrderStatusUpdate }> {
    const { status, estimatedTime } = input;

    const existingOrder = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { id: true, status: true, tableId: true },
    });

    if (!existingOrder) {
      throw AppError.notFound('Order');
    }

    // Validate status transitions
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      PENDING: ['PREPARING', 'CANCELLED'],
      PREPARING: ['PAYMENT_PENDING', 'CANCELLED'],
      PAYMENT_PENDING: ['COMPLETED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    if (!validTransitions[existingOrder.status].includes(status)) {
      throw AppError.badRequest(
        `Cannot transition from ${existingOrder.status} to ${status}`
      );
    }

    const updateData: Parameters<typeof prisma.order.update>[0]['data'] = {
      status,
      estimatedTime,
    };

    if (status === 'PAYMENT_PENDING') {
      updateData.preparedAt = new Date();
    }

    if (status === 'COMPLETED' || status === 'CANCELLED') {
      updateData.completedAt = new Date();
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        table: { select: { id: true, number: true, name: true } },
        items: {
          include: {
            menuItem: { select: { id: true, name: true } },
            modifiers: {
              include: {
                modifier: {
                  include: {
                    modifierGroup: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Fire-and-forget: table freeing + cache invalidation (don't block response)
    const postOps: Promise<unknown>[] = [
      cache.del(cache.keys.activeOrders(restaurantId)).catch((err) => {
        logger.error({ err }, 'Failed to invalidate active orders cache');
      }),
      cache.del(cache.keys.order(orderId)).catch((err) => {
        logger.error({ err }, 'Failed to invalidate order cache');
      }),
    ];

    if ((status === 'COMPLETED' || status === 'CANCELLED') && order.tableId) {
      const tId = order.tableId;
      postOps.push(
        prisma.$transaction(async (tx) => {
          const activeCount = await tx.order.count({
            where: {
              tableId: tId,
              status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
            },
          });
          if (activeCount === 0) {
            await tx.table.update({
              where: { id: tId },
              data: { status: 'AVAILABLE' },
            });
            await cache.del(cache.keys.tables(restaurantId)).catch((err) => {
              logger.error({ err }, 'Failed to invalidate tables cache');
            });
          }
        }).catch((err) => {
          logger.error({ err, tableId: tId }, 'Failed to free table after order completion');
        })
      );
    }

    // Run all post-update ops in parallel without blocking
    Promise.all(postOps).catch((err) => {
      logger.error({ err }, 'Post-update operations failed');
    });

    // Return payload for Socket.io emission
    // Map backend statuses to frontend
    const statusMap: Record<string, string> = { PAYMENT_PENDING: 'payment_pending' };
    const frontendStatus = statusMap[order.status] || order.status.toLowerCase();
    const payload: OrderStatusUpdate = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: frontendStatus,
      previousStatus: statusMap[existingOrder.status] || existingOrder.status.toLowerCase(),
      estimatedTime: order.estimatedTime ?? undefined,
      updatedAt: order.updatedAt.toISOString(),
    };

    return { order, payload };
  },

  // Convert order to socket payload
  toSocketPayload(order: Awaited<ReturnType<typeof this.getOrderById>>): OrderSocketPayload {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.total),
      tableNumber: order.table?.number,
      items: order.items.map(item => ({
        name: item.menuItem.name,
        quantity: item.quantity,
      })),
      createdAt: order.createdAt.toISOString(),
    };
  },

  // Get order stats for dashboard
  async getOrderStats(restaurantId: string, dateFrom?: Date, dateTo?: Date) {
    const where = {
      restaurantId,
      createdAt: {
        gte: dateFrom || new Date(new Date().setHours(0, 0, 0, 0)),
        lte: dateTo || new Date(),
      },
    };

    const [total, byStatus, revenue] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      prisma.order.aggregate({
        where: {
          ...where,
          status: { in: ['COMPLETED'] },
        },
        _sum: { total: true },
      }),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(
        byStatus.map(s => [s.status, s._count])
      ),
      revenue: Number(revenue._sum.total || 0),
    };
  },

  // Combined analytics summary for the admin dashboard
  async getAnalyticsSummary(restaurantId: string, period: string = 'day') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default: // day
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
    }

    const completedWhere = {
      restaurantId,
      createdAt: { gte: startDate, lte: now },
      status: { in: ['COMPLETED' as const] },
    };

    const allWhere = {
      restaurantId,
      createdAt: { gte: startDate, lte: now },
    };

    const [totalOrders, completedOrderCount, completedRevenue, dailyRevenueRaw, topItemsRaw, hourlyRaw] = await Promise.all([
      prisma.order.count({ where: allWhere }),
      prisma.order.count({ where: completedWhere }),
      prisma.order.aggregate({
        where: completedWhere,
        _sum: { total: true },
      }),
      prisma.$queryRaw<Array<{ date: Date; revenue: number; orders: bigint }>>`
        SELECT
          DATE("createdAt") AS date,
          COALESCE(SUM("total"), 0)::float AS revenue,
          COUNT(*)::bigint AS orders
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate}
          AND "status" IN ('COMPLETED')
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
      prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          order: {
            restaurantId,
            createdAt: { gte: startDate },
            status: { in: ['COMPLETED'] },
          },
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
      prisma.$queryRaw<Array<{ hour: number; orders: bigint; revenue: number }>>`
        SELECT
          EXTRACT(HOUR FROM "createdAt")::int AS hour,
          COUNT(*)::bigint AS orders,
          COALESCE(SUM("total"), 0)::float AS revenue
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate}
          AND "createdAt" <= ${now}
          AND "status" IN ('COMPLETED')
        GROUP BY EXTRACT(HOUR FROM "createdAt")
        ORDER BY hour ASC
      `,
    ]);

    const totalRevenue = Number(completedRevenue._sum.total || 0);
    const averageOrderValue = completedOrderCount > 0 ? totalRevenue / completedOrderCount : 0;

    // Get item details for top items
    const itemIds = topItemsRaw.map(i => i.menuItemId);
    const items = itemIds.length > 0
      ? await prisma.menuItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, image: true },
        })
      : [];
    const itemMap = new Map(items.map(i => [i.id, i]));

    return {
      totalRevenue,
      totalOrders,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      tableConversionRate: 0,
      dailyRevenue: dailyRevenueRaw.map(d => ({
        date: d.date,
        revenue: Number(d.revenue),
        orders: Number(d.orders),
      })),
      topItems: topItemsRaw.map(i => {
        const detail = itemMap.get(i.menuItemId);
        return {
          itemId: i.menuItemId,
          itemName: detail?.name ?? 'Unknown Item',
          image: detail?.image ?? null,
          quantity: i._sum.quantity || 0,
          revenue: Number(i._sum.totalPrice || 0),
        };
      }),
      hourlyData: hourlyRaw.map(h => ({
        hour: h.hour,
        orders: Number(h.orders),
        revenue: Number(h.revenue),
      })),
    };
  },

  // Get analytics data
  async getAnalytics(restaurantId: string, days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Daily revenue — use $queryRaw to group by DATE (not exact timestamp)
    const dailyRevenue = await prisma.$queryRaw<
      Array<{ date: Date; revenue: number; orders: bigint }>
    >`
      SELECT
        DATE("createdAt") AS date,
        COALESCE(SUM("total"), 0)::float AS revenue,
        COUNT(*)::bigint AS orders
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${startDate}
        AND "status" IN ('COMPLETED')
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // Top selling items
    const topItems = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: {
          restaurantId,
          createdAt: { gte: startDate },
          status: { in: ['COMPLETED'] },
        },
      },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    // Get item details
    const itemIds = topItems.map(i => i.menuItemId);
    const items = await prisma.menuItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true, image: true },
    });

    const itemMap = new Map(items.map(i => [i.id, i]));

    return {
      dailyRevenue: dailyRevenue.map(d => ({
        date: d.date,
        revenue: Number(d.revenue),
        orders: Number(d.orders),
      })),
      topItems: topItems.map(i => ({
        item: itemMap.get(i.menuItemId),
        quantity: i._sum.quantity || 0,
        revenue: Number(i._sum.totalPrice || 0),
      })),
    };
  },
};
