import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'crypto';
import { prisma, cache, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import type { CreateOrderInput, UpdateOrderStatusInput, OrderQueryInput } from '../validators/index.js';
import { OrderStatus } from '@prisma/client';
import type { OrderSocketPayload, OrderStatusUpdate } from '../types/index.js';
import { sessionService } from './sessionService.js';
import { tableService } from './tableService.js';
import { discountService } from './discountService.js';
import { crmService } from './crmService.js';

// Generate human-readable order number
function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear().toString().slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = randomBytes(3).toString('hex').substring(0, 4).toUpperCase();
  return `${dateStr}-${random}`;
}

export const orderService = {
  async getOrders(restaurantId: string, query: OrderQueryInput, branchId?: string | null) {
    const { status, tableId, dateFrom, dateTo, page, limit, sortBy, sortOrder } = query;

    const where = {
      restaurantId,
      ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
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
          table: { select: { id: true, number: true, name: true, section: { select: { id: true, name: true } } } },
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

  async getActiveOrders(restaurantId: string, branchId?: string | null) {
    // When branch-filtered, skip cache
    if (branchId) {
      return this.fetchActiveOrders(restaurantId, branchId);
    }

    // Try cache first
    const cacheKey = cache.keys.activeOrders(restaurantId);
    const cached = await cache.get<Awaited<ReturnType<typeof this.fetchActiveOrders>>>(cacheKey);
    
    if (cached) return cached;

    const orders = await this.fetchActiveOrders(restaurantId);
    await cache.set(cacheKey, orders, cache.ttl.short);
    
    return orders;
  },

  async fetchActiveOrders(restaurantId: string, branchId?: string | null) {
    return prisma.order.findMany({
      where: {
        restaurantId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
        status: {
          in: ['PENDING', 'PREPARING'],
        },
      },
      include: {
        table: { select: { id: true, number: true, name: true, section: { select: { id: true, name: true } } } },
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
    // Find active session for this table
    const activeSession = await prisma.tableSession.findFirst({
      where: { tableId, status: 'ACTIVE' },
      select: { id: true },
    });

    return prisma.order.findMany({
      where: {
        tableId,
        ...(activeSession
          ? // If there's an active session, show only orders in that session
            { sessionId: activeSession.id }
          : // No active session yet — show recent orders not linked to any session
            {
              sessionId: null,
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            }),
      },
      include: {
        table: { select: { id: true, number: true, name: true, section: { select: { id: true, name: true } } } },
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
    const where: Record<string, unknown> = { id: orderId };
    if (restaurantId) {
      where.restaurantId = restaurantId;
    }

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
        table: { select: { id: true, number: true, name: true, section: { select: { id: true, name: true } } } },
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

  async createOrder(restaurantId: string, input: CreateOrderInput, restaurantData?: { taxRate: unknown; settings: unknown }, initialStatus?: 'PENDING' | 'PREPARING' | 'COMPLETED', fallbackBranchId?: string | null, orderType?: string) {
    const { items, tableId, sessionToken, ...orderData } = input;

    // Parallel fetch: restaurant (if not pre-loaded), table validation, and menu items
    const menuItemIds = [...new Set(items.map(i => i.menuItemId))];

    const [restaurant, table, menuItems, activeSession] = await Promise.all([
      // 1. Restaurant tax rate + settings (skip DB if already resolved by middleware)
      restaurantData
        ? Promise.resolve(restaurantData as { taxRate: unknown; settings: unknown })
        : prisma.restaurant.findUnique({
            where: { id: restaurantId },
            select: { taxRate: true, settings: true },
          }),
      // 2. Table validation (skip if no tableId)
      tableId
        ? prisma.table.findFirst({ where: { id: tableId, restaurantId }, select: { id: true, number: true, name: true, sessionToken: true, branchId: true } })
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
      // 4. Active session for this table (moved here to parallelize)
      tableId
        ? prisma.tableSession.findFirst({
            where: { tableId, status: 'ACTIVE' },
            select: { id: true, expiresAt: true, lastActivityAt: true, createdAt: true, status: true },
          })
        : Promise.resolve(null),
    ]);

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    // Check if restaurant accepts orders (from settings)
    const settings = restaurant.settings as Record<string, unknown> || {};
    if (settings.acceptsOrders === false) {
      throw AppError.badRequest('Restaurant is not currently accepting orders');
    }

    // Validate table
    if (tableId && !table) {
      throw AppError.notFound('Table');
    }

    // Session token validation — only for customer orders (not cashier/admin)
    // Customer orders have no initialStatus; cashier orders have initialStatus='PREPARING'
    if (tableId && table && !initialStatus) {
      if (table.sessionToken) {
        if (!sessionToken) {
          throw AppError.unauthorized('Session expired. Please scan the QR code at your table.');
        }
        if (!timingSafeEqual(Buffer.from(sessionToken), Buffer.from(table.sessionToken))) {
          throw AppError.unauthorized('Session expired. Please scan the QR code at your table.');
        }
      }
    }

    // Check session expiry
    let sessionId: string | undefined;
    if (activeSession) {
      if (!initialStatus && sessionService.isSessionExpired(activeSession)) {
        await sessionService.expireSession(activeSession.id);
        throw AppError.unauthorized('Session expired. Please scan the QR code at your table.');
      }
      sessionId = activeSession.id;
    }

    if (menuItems.length !== menuItemIds.length) {
      throw AppError.badRequest('Some menu items are not available');
    }

    // Create item map for easy lookup
    const menuItemMap = new Map(menuItems.map(item => [item.id, item]));

    // Calculate totals and prepare order items
    let subtotal = new Decimal(0);
    let itemTax = new Decimal(0);
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

      // Per-item tax: use item-level taxRate if set, else fall back to restaurant taxRate
      const itemTaxRate = (menuItem as Record<string, unknown>).taxRate != null
        ? new Decimal((menuItem as Record<string, unknown>).taxRate as string | number)
        : new Decimal(restaurant.taxRate as string | number);
      itemTax = itemTax.plus(totalPrice.times(itemTaxRate).dividedBy(100));

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

    // Use per-item accumulated tax (supports mixed tax rates e.g. restaurant food vs tobacco)
    const tax = itemTax.toDecimalPlaces(2);

    // ─── Discount / Coupon logic ───
    let discountAmount = new Decimal(0);
    let appliedDiscount: { discountId: string; couponId?: string; discountAmount: Decimal; discountName: string } | null = null;

    const manualDiscount = (input as Record<string, unknown>).manualDiscount as number | undefined;
    const manualDiscountType = (input as Record<string, unknown>).manualDiscountType as string | undefined;
    const couponCode = (input as Record<string, unknown>).couponCode as string | undefined;

    if (manualDiscount && manualDiscount > 0) {
      // Manual discount from cashier
      if (manualDiscountType === 'PERCENTAGE') {
        discountAmount = subtotal.times(manualDiscount).dividedBy(100).toDecimalPlaces(2);
      } else {
        discountAmount = new Decimal(manualDiscount).toDecimalPlaces(2);
      }
      // Cap discount at subtotal
      if (discountAmount.greaterThan(subtotal)) discountAmount = subtotal;
    } else if (couponCode) {
      const result = await discountService.validateCoupon(
        restaurantId,
        couponCode,
        subtotal,
        input.customerPhone,
      );
      if (result.valid && result.discount) {
        appliedDiscount = result.discount;
        discountAmount = result.discount.discountAmount;
      }
    } else {
      // Try auto-apply discount
      const auto = await discountService.getAutoApplyDiscounts(restaurantId, subtotal);
      if (auto) {
        appliedDiscount = auto;
        discountAmount = auto.discountAmount;
      }
    }

    const total = subtotal.minus(discountAmount).plus(tax);

    // Create order inside a serializable transaction to prevent race conditions
    // (e.g. two concurrent orders reading the same session state).
    // Retry on unique-constraint collision (P2002) for the generated order number.
    let order;
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const orderNumber = generateOrderNumber();
      try {
        order = await prisma.$transaction(async (tx) => {
          // Lock the session row (if any) to serialise concurrent orders on the same table
          if (sessionId) {
            await tx.$queryRawUnsafe(
              `SELECT id FROM "TableSession" WHERE id = $1 FOR UPDATE`,
              sessionId,
            );
          }

          // Generate sequential token number (001-999, resets daily at IST midnight)
          const effectiveBranchId = table?.branchId ?? fallbackBranchId ?? null;
          const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
          const istNow = new Date(Date.now() + IST_OFFSET_MS);
          const todayStartIST = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
          const todayStartUTC = new Date(todayStartIST.getTime() - IST_OFFSET_MS);
          const lastOrder = await tx.order.findFirst({
            where: {
              restaurantId,
              ...(effectiveBranchId ? { OR: [{ branchId: effectiveBranchId }, { branchId: null }] } : {}),
              tokenNumber: { not: null },
              createdAt: { gte: todayStartUTC },
            },
            orderBy: { createdAt: 'desc' },
            select: { tokenNumber: true },
          });
          const tokenNumber = lastOrder?.tokenNumber && lastOrder.tokenNumber < 999
            ? lastOrder.tokenNumber + 1
            : 1;

          return tx.order.create({
            data: {
              orderNumber,
              tokenNumber,
              restaurantId,
              tableId,
              sessionId,
              branchId: table?.branchId ?? fallbackBranchId ?? null,
              status: initialStatus || 'PENDING',
              orderType: orderType || (tableId ? 'DINE_IN' : 'TAKEAWAY'),
              ...(initialStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
              subtotal,
              tax,
              total,
              discount: discountAmount,
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
            // Minimal select inside transaction — avoid heavy includes that add
            // multiple roundtrips to remote DB. Full data fetched after commit.
            select: {
              id: true,
              orderNumber: true,
              tokenNumber: true,
              restaurantId: true,
              tableId: true,
              sessionId: true,
              branchId: true,
              status: true,
              orderType: true,
              subtotal: true,
              tax: true,
              total: true,
              discount: true,
              notes: true,
              customerName: true,
              customerPhone: true,
              estimatedTime: true,
              preparedAt: true,
              completedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
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

    // Post-create operations — awaited via Promise.allSettled so failures
    // are logged but don't block the response or create unhandled rejections.
    const postOps: Promise<unknown>[] = [
      cache.del(cache.keys.activeOrders(restaurantId)),
    ];

    if (appliedDiscount) {
      postOps.push(
        discountService.recordUsage(
          order.id,
          appliedDiscount.discountId,
          appliedDiscount.discountAmount,
          appliedDiscount.couponId,
          input.customerPhone,
        ),
      );
    }

    if (tableId) {
      postOps.push(
        prisma.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } }),
        cache.del(cache.keys.tables(restaurantId)),
      );
    }

    if (sessionId) {
      postOps.push(
        sessionService.recalculateSessionTotals(sessionId),
      );
    }

    // CRM: record customer visit when phone is available
    if (order.customerPhone) {
      postOps.push(
        crmService.recordVisit(restaurantId, order.customerPhone, Number(order.total), order.customerName || undefined),
      );
    }

    // Rotate session token after customer order creation so old token can't be reused.
    // Only for customer orders (no initialStatus) — cashier orders skip this.
    // This must be awaited because the new token is returned to the client.
    if (tableId && !initialStatus) {
      try {
        const newSessionToken = await tableService.rotateSessionToken(tableId, restaurantId);
        (order as Record<string, unknown>)._newSessionToken = newSessionToken;
        logger.info({ tableId, orderId: order!.id }, 'Rotated session token after order creation');
      } catch (err) {
        logger.error({ err, tableId }, 'Failed to rotate session token after order creation');
      }
    }

    // Fire-and-forget: post-create ops don't block the response to the customer.
    // Errors are logged but the order is already committed.
    Promise.allSettled(postOps).then((settled) => {
      for (const result of settled) {
        if (result.status === 'rejected') {
          logger.error({ err: result.reason }, 'Post-create operation failed');
        }
      }
    });

    // Touch session to extend expiry after successful order
    if (sessionId) {
      sessionService.touchSession(sessionId).catch((err) => {
        logger.error({ err, sessionId }, 'Failed to touch session after order creation');
      });
    }

    return order;
  },

  /**
   * Marks an individual order item as kitchen-ready by setting item.preparedAt.
   * When all items in the order are ready, also sets order.preparedAt.
   */
  async markItemKitchenReady(orderId: string, itemId: string, restaurantId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: { select: { id: true, preparedAt: true, menuItem: { select: { name: true } } } },
        table: { select: { id: true, number: true, name: true } },
      },
    });

    if (!order) throw AppError.notFound('Order');
    // Allow PREPARING and COMPLETED (QSR orders are paid upfront so status is COMPLETED
    // before kitchen has served the food)
    if (order.status !== 'PREPARING' && order.status !== 'COMPLETED') {
      throw AppError.badRequest('Only orders in PREPARING or COMPLETED status can have items marked ready');
    }

    const item = order.items.find(i => i.id === itemId);
    if (!item) throw AppError.notFound('Order item');
    if (item.preparedAt) {
      // Already marked — idempotent
      const allReady = order.items.every(i => i.id === itemId || i.preparedAt);
      const tableName = order.table
        ? (order.table.name ? `${order.table.name} ${order.table.number}` : `Table ${order.table.number}`)
        : 'Takeaway';
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        itemId,
        itemName: item.menuItem?.name ?? 'Item',
        tableName,
        preparedAt: item.preparedAt.toISOString(),
        allItemsReady: allReady,
      };
    }

    const now = new Date();

    // Mark item as ready
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { preparedAt: now },
    });

    // Check if ALL items are now ready
    const allReady = order.items.every(i => i.id === itemId || i.preparedAt);

    // If all items ready, also set order-level preparedAt
    if (allReady && !order.preparedAt) {
      await prisma.order.update({
        where: { id: orderId },
        data: { preparedAt: now },
      });
    }

    // Invalidate caches
    await Promise.all([
      cache.del(cache.keys.activeOrders(restaurantId)).catch(() => {}),
      cache.del(cache.keys.order(orderId)).catch(() => {}),
    ]);

    const tableName = order.table
      ? (order.table.name ? `${order.table.name} ${order.table.number}` : `Table ${order.table.number}`)
      : 'Takeaway';

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      itemId,
      itemName: item.menuItem?.name ?? 'Item',
      tableName,
      preparedAt: now.toISOString(),
      allItemsReady: allReady,
    };
  },

  /**
   * Marks an order as kitchen-ready by setting preparedAt without changing status.
   * Used by the Kitchen Display when the chef marks food as ready.
   */
  async markKitchenReady(orderId: string, restaurantId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { id: true, status: true, tableId: true, preparedAt: true, orderNumber: true },
    });

    if (!order) {
      throw AppError.notFound('Order');
    }

    if (order.status !== 'PREPARING') {
      throw AppError.badRequest('Only orders in PREPARING status can be marked kitchen-ready');
    }

    if (order.preparedAt) {
      // Already marked — return idempotently
      return order;
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { preparedAt: new Date() },
      include: {
        table: { select: { id: true, number: true, name: true, section: { select: { id: true, name: true } } } },
      },
    });

    // Invalidate caches
    await Promise.all([
      cache.del(cache.keys.activeOrders(restaurantId)).catch(() => {}),
      cache.del(cache.keys.order(orderId)).catch(() => {}),
    ]);

    const tableName = updated.table
      ? (updated.table.name ? `${updated.table.name} ${updated.table.number}` : `Table ${updated.table.number}`)
      : 'Takeaway';

    return {
      ...updated,
      tableName,
    };
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

    // Validate status transitions (bidirectional between active statuses)
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      PENDING: ['PREPARING', 'CANCELLED'],
      PREPARING: ['PENDING', 'READY', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'],
      READY: ['PREPARING', 'PAYMENT_PENDING', 'CANCELLED'],
      PAYMENT_PENDING: ['PENDING', 'PREPARING', 'COMPLETED'],
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

    // Clear timestamps when moving backward
    if (status === 'PENDING') {
      updateData.preparedAt = null;
    }

    if (status === 'COMPLETED' || status === 'CANCELLED') {
      updateData.completedAt = new Date();
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        table: { select: { id: true, number: true, name: true, section: { select: { id: true, name: true } } } },
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

    // Cache invalidation — tables cache MUST be cleared synchronously
    // because activeOrders count changes on every status transition
    await Promise.all([
      cache.del(cache.keys.activeOrders(restaurantId)).catch((err) => {
        logger.error({ err }, 'Failed to invalidate active orders cache');
      }),
      cache.del(cache.keys.order(orderId)).catch((err) => {
        logger.error({ err }, 'Failed to invalidate order cache');
      }),
      cache.del(cache.keys.tables(restaurantId)).catch((err) => {
        logger.error({ err }, 'Failed to invalidate tables cache');
      }),
    ]);

    // Table freeing — MUST complete before we return so socket events
    // fire after the DB is updated (avoids stale reads on refetch)
    let tableFreed = false;
    if ((status === 'COMPLETED' || status === 'CANCELLED') && order.tableId) {
      const tId = order.tableId;
      try {
        const activeCount = await prisma.order.count({
          where: {
            tableId: tId,
            status: { in: ['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING'] },
          },
        });
        if (activeCount === 0) {
          // All orders are either COMPLETED or CANCELLED.
          // Only close the session and free the table when ALL orders are CANCELLED
          // (i.e. there are zero completed orders awaiting payment settlement).
          // When completed orders exist, keep the session ACTIVE so the
          // Settle Payment flow can find and settle them.
          const completedCount = await prisma.order.count({
            where: {
              tableId: tId,
              status: 'COMPLETED',
            },
          });

          if (completedCount === 0) {
            // All orders cancelled — no payment needed, close session & free table
            await prisma.tableSession.updateMany({
              where: { tableId: tId, status: 'ACTIVE' },
              data: { status: 'CLOSED', closedAt: new Date() },
            });

            await prisma.table.update({
              where: { id: tId },
              data: { status: 'AVAILABLE' },
            });
            // Rotate session token so old QR screenshots can't order
            const newSessionToken = await tableService.rotateSessionToken(tId, restaurantId).catch((err) => {
              logger.error({ err, tableId: tId }, 'Failed to rotate session token');
              return null;
            });
            await cache.del(cache.keys.tables(restaurantId)).catch(() => {});
            tableFreed = true;
            (order as Record<string, unknown>)._newSessionToken = newSessionToken;
          }
        }
      } catch (err) {
        logger.error({ err, tableId: tId }, 'Failed to free table after order completion');
      }
    }

    // Return payload for Socket.io emission
    // Map backend statuses to frontend
    const statusMap: Record<string, string> = { PAYMENT_PENDING: 'payment_pending' };
    const frontendStatus = statusMap[order.status] || order.status.toLowerCase();
    // Attach tableFreed flag so the controller knows whether to emit table:updated
    (order as Record<string, unknown>)._tableFreed = tableFreed;
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
      tableName: order.table?.name ?? order.table?.number,
      items: order.items.map(item => ({
        name: item.menuItem?.name ?? 'Deleted Item',
        quantity: item.quantity,
      })),
      createdAt: order.createdAt.toISOString(),
    };
  },

  // Get order stats for dashboard
  async getOrderStats(restaurantId: string, dateFrom?: Date, dateTo?: Date, branchId?: string | null) {
    const where = {
      restaurantId,
      ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
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
  async getAnalyticsSummary(restaurantId: string, period: string = 'day', branchId?: string | null) {
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

    const branchFilter = branchId ? { OR: [{ branchId }, { branchId: null }] } : {};

    const completedWhere = {
      restaurantId,
      ...branchFilter,
      createdAt: { gte: startDate, lte: now },
      status: { in: ['COMPLETED' as const] },
    };

    const allWhere = {
      restaurantId,
      ...branchFilter,
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
          DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS date,
          COALESCE(SUM("total"), 0)::float AS revenue,
          COUNT(*)::bigint AS orders
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate}
          AND "status" IN ('COMPLETED')
          ${branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty}
        GROUP BY DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
        ORDER BY date ASC
      `,
      prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          order: {
            restaurantId,
            ...branchFilter,
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
          EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::int AS hour,
          COUNT(*)::bigint AS orders,
          COALESCE(SUM("total"), 0)::float AS revenue
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate}
          AND "createdAt" <= ${now}
          AND "status" NOT IN ('CANCELLED')
          ${branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty}
        GROUP BY EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
        ORDER BY hour ASC
      `,
    ]);

    const totalRevenue = Number(completedRevenue._sum.total || 0);
    const averageOrderValue = completedOrderCount > 0 ? totalRevenue / completedOrderCount : 0;

    // Get item details for top items
    const itemIds = topItemsRaw.map(i => i.menuItemId).filter((id): id is string => id !== null);
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
        const detail = i.menuItemId ? itemMap.get(i.menuItemId) : undefined;
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
  async getAnalytics(restaurantId: string, days: number = 7, branchId?: string | null) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const branchFilter = branchId ? { OR: [{ branchId }, { branchId: null }] } : {};

    // Daily revenue — use $queryRaw to group by DATE (not exact timestamp)
    const dailyRevenue = await prisma.$queryRaw<
      Array<{ date: Date; revenue: number; orders: bigint }>
    >`
      SELECT
        DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS date,
        COALESCE(SUM("total"), 0)::float AS revenue,
        COUNT(*)::bigint AS orders
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${startDate}
        AND "status" IN ('COMPLETED')
        ${branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty}
      GROUP BY DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
      ORDER BY date ASC
    `;

    // Top selling items
    const topItems = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: {
          restaurantId,
          ...branchFilter,
          createdAt: { gte: startDate },
          status: { in: ['COMPLETED'] },
        },
      },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    // Get item details
    const itemIds = topItems.map(i => i.menuItemId).filter((id): id is string => id !== null);
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
        item: i.menuItemId ? itemMap.get(i.menuItemId) : undefined,
        quantity: i._sum.quantity || 0,
        revenue: Number(i._sum.totalPrice || 0),
      })),
    };
  },

  /**
   * Export orders as CSV string for a given date range.
   */
  async exportOrdersCsv(restaurantId: string, dateFrom?: string, dateTo?: string, branchId?: string | null): Promise<string> {
    const where: Record<string, unknown> = { restaurantId };
    if (branchId) {
      where.OR = [{ branchId }, { branchId: null }];
    }
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(new Date(dateTo).getTime() + 86400000) } : {}), // include entire end day
      };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        table: { select: { number: true, name: true, section: { select: { id: true, name: true } } } },
        items: {
          include: {
            menuItem: { select: { name: true } },
          },
        },
        session: {
          include: {
            payments: {
              where: { status: 'COMPLETED' },
              select: { method: true, amount: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // CSV header
    const header = [
      'Order #',
      'Date',
      'Time',
      'Table',
      'Customer Name',
      'Customer Phone',
      'Items',
      'Qty',
      'Subtotal',
      'Tax',
      'Total',
      'Status',
      'Payment Method',
    ].join(',');

    const escCsv = (val: string | null | undefined) => {
      if (!val) return '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const rows = orders.map((o) => {
      const date = new Date(o.createdAt);
      const dateStr = date.toLocaleDateString('en-IN');
      const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const tableName = o.table
        ? (o.table.name ? `${o.table.name} ${o.table.number}` : `Table ${o.table.number}`)
        : 'Takeaway';
      const itemsSummary = o.items.map(i => `${i.menuItem?.name ?? 'Deleted Item'} x${i.quantity}`).join('; ');
      const totalQty = o.items.reduce((sum, i) => sum + i.quantity, 0);
      const paymentMethods = o.session?.payments
        ?.map(p => p.method)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', ') || '';

      return [
        o.orderNumber,
        dateStr,
        timeStr,
        escCsv(tableName),
        escCsv(o.customerName),
        escCsv(o.customerPhone),
        escCsv(itemsSummary),
        totalQty,
        Number(o.subtotal).toFixed(2),
        Number(o.tax).toFixed(2),
        Number(o.total).toFixed(2),
        o.status,
        paymentMethods,
      ].join(',');
    });

    return [header, ...rows].join('\n');
  },

  /** Enhanced analytics: category breakdown, payment methods, staff performance */
  async getAdvancedAnalytics(restaurantId: string, startDate: Date, endDate: Date, branchId?: string | null) {
    const branchFilter = branchId ? { OR: [{ branchId }, { branchId: null }] } : {};

    const completedWhere = {
      restaurantId,
      ...branchFilter,
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['COMPLETED' as const] },
    };

    const [categoryRevenue, paymentMethodBreakdown, weekdayBreakdown, orderStatusCounts] = await Promise.all([
      // Category-wise revenue
      prisma.$queryRaw<Array<{ categoryId: string; categoryName: string; revenue: number; quantity: bigint; itemCount: bigint }>>`
        SELECT
          c."id" AS "categoryId",
          c."name" AS "categoryName",
          COALESCE(SUM(oi."totalPrice"), 0)::float AS revenue,
          COALESCE(SUM(oi."quantity"), 0)::bigint AS quantity,
          COUNT(DISTINCT oi."menuItemId")::bigint AS "itemCount"
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        JOIN "MenuItem" mi ON mi."id" = oi."menuItemId"
        JOIN "Category" c ON c."id" = mi."categoryId"
        WHERE o."restaurantId" = ${restaurantId}
          AND o."createdAt" >= ${startDate}
          AND o."createdAt" <= ${endDate}
          AND o."status" IN ('COMPLETED')
          ${branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty}
        GROUP BY c."id", c."name"
        ORDER BY revenue DESC
      `,

      // Payment method breakdown
      prisma.$queryRaw<Array<{ method: string; count: bigint; total: number }>>`
        SELECT
          p."method",
          COUNT(*)::bigint AS count,
          COALESCE(SUM(p."amount"), 0)::float AS total
        FROM "Payment" p
        JOIN "TableSession" ts ON ts."id" = p."sessionId"
        WHERE ts."restaurantId" = ${restaurantId}
          AND p."createdAt" >= ${startDate}
          AND p."createdAt" <= ${endDate}
          AND p."status" = 'COMPLETED'
          ${branchId ? Prisma.sql`AND (ts."branchId" = ${branchId} OR ts."branchId" IS NULL)` : Prisma.empty}
        GROUP BY p."method"
        ORDER BY total DESC
      `,

      // Weekday breakdown (0=Sun, 6=Sat)
      prisma.$queryRaw<Array<{ weekday: number; orderCount: bigint; revenue: number }>>`
        SELECT
          EXTRACT(DOW FROM "createdAt")::int AS weekday,
          COUNT(*)::bigint AS "orderCount",
          COALESCE(SUM("total"), 0)::float AS revenue
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
          AND "status" IN ('COMPLETED')
          ${branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty}
        GROUP BY EXTRACT(DOW FROM "createdAt")
        ORDER BY weekday ASC
      `,

      // Order status distribution
      prisma.order.groupBy({
        by: ['status'],
        where: {
          restaurantId,
          ...branchFilter,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
        _sum: { total: true },
      }),
    ]);

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      categoryRevenue: categoryRevenue.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        totalRevenue: Number(c.revenue),
        totalQuantity: Number(c.quantity),
      })),
      paymentMethods: paymentMethodBreakdown.map(p => ({
        method: p.method,
        count: Number(p.count),
        totalAmount: Number(p.total),
      })),
      weekdayBreakdown: weekdayBreakdown.map(w => ({
        dayOfWeek: w.weekday,
        dayName: DAY_NAMES[w.weekday] || `Day ${w.weekday}`,
        totalOrders: Number(w.orderCount),
        totalRevenue: Number(w.revenue),
      })),
      orderStatusBreakdown: orderStatusCounts.map(s => ({
        status: s.status,
        count: s._count,
        revenue: Number(s._sum.total || 0),
      })),
    };
  },

  /**
   * Auto-cancel orders stuck in PENDING for longer than the given minutes.
   * Returns the number of orders cancelled.
   */
  async cancelStalePendingOrders(minutesThreshold = 30): Promise<number> {
    const cutoff = new Date(Date.now() - minutesThreshold * 60 * 1000);

    const staleOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      select: { id: true, restaurantId: true, tableId: true },
    });

    if (staleOrders.length === 0) return 0;

    await prisma.order.updateMany({
      where: {
        id: { in: staleOrders.map(o => o.id) },
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    // Invalidate caches for affected restaurants
    const restaurantIds = [...new Set(staleOrders.map(o => o.restaurantId))];
    for (const rid of restaurantIds) {
      await cache.del(`activeOrders:${rid}`);
    }

    return staleOrders.length;
  },
};
