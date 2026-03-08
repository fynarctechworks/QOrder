import { v4 as uuidv4 } from 'uuid';
import { prisma, cache, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import type { CreateTableInput, UpdateTableInput } from '../validators/index.js';
import { TableStatus, OrderStatus } from '@prisma/client';

export const tableService = {
  async getTables(restaurantId: string, branchId?: string | null) {
    // When branch-filtered, skip cache (branch combos make cache keys complex)
    if (branchId) {
      return this.fetchTables(restaurantId, branchId);
    }

    // Try cache first
    const cacheKey = cache.keys.tables(restaurantId);
    const cached = await cache.get<Awaited<ReturnType<typeof this.fetchTables>>>(cacheKey);
    
    if (cached) return cached;

    const tables = await this.fetchTables(restaurantId);
    await cache.set(cacheKey, tables, cache.ttl.short);
    
    return tables;
  },

  async fetchTables(restaurantId: string, branchId?: string | null) {
    return prisma.table.findMany({
      where: { 
        restaurantId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ number: 'asc' }],
      include: {
        section: {
          select: { id: true, name: true, floor: true, sortOrder: true },
        },
        branch: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            orders: {
              where: {
                status: { in: ['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING'] },
              },
            },
          },
        },
      },
    });
  },

  async getTableById(tableId: string, restaurantId: string) {
    // Support lookup by UUID id or by table number
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);

    const table = await prisma.table.findFirst({
      where: { 
        ...(isUUID ? { id: tableId } : { number: tableId }),
        restaurantId,
      },
      include: {
        orders: {
          where: {
            status: { in: ['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!table) {
      throw AppError.notFound('Table');
    }

    return table;
  },

  async getTableByQRCode(qrCode: string) {
    const table = await prisma.table.findUnique({
      where: { qrCode },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (!table || !table.restaurant.isActive) {
      throw AppError.notFound('Table');
    }

    return table;
  },

  async createTable(restaurantId: string, input: CreateTableInput & { branchId?: string | null }) {
    // Check if a table with the same number already exists in this branch+section
    const existing = await prisma.table.findFirst({
      where: { restaurantId, branchId: input.branchId ?? null, sectionId: input.sectionId ?? null, number: input.number },
    });

    if (existing) {
      throw AppError.conflict('A table with this number already exists');
    }

    // Generate unique QR code
    const qrCode = `${restaurantId}-${input.number}-${uuidv4().slice(0, 8)}`;

    const table = await prisma.table.create({
      data: {
        number: input.number,
        name: input.name,
        capacity: input.capacity,
        sectionId: input.sectionId ?? null,
        branchId: input.branchId ?? null,
        qrCode,
        sessionToken: uuidv4(),
        restaurantId,
      },
    });

    // Invalidate cache
    await cache.del(cache.keys.tables(restaurantId));

    return table;
  },

  async createBulkTables(
    restaurantId: string, 
    count: number, 
    startNumber: number, 
    capacity: number,
    sectionId?: string | null,
    branchId?: string | null
  ) {
    const tables = [];

    for (let i = 0; i < count; i++) {
      const number = String(startNumber + i);
      const qrCode = `${restaurantId}-${number}-${uuidv4().slice(0, 8)}`;

      tables.push({
        number,
        capacity,
        qrCode,
        sessionToken: uuidv4(),
        restaurantId,
        sectionId: sectionId ?? null,
        branchId: branchId ?? null,
      });
    }

    const result = await prisma.table.createMany({
      data: tables,
      skipDuplicates: true,
    });

    // Invalidate cache
    await cache.del(cache.keys.tables(restaurantId));

    return { created: result.count };
  },

  async updateTable(tableId: string, restaurantId: string, input: UpdateTableInput) {
    // Verify ownership
    const existing = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
    if (!existing) throw AppError.notFound('Table');

    // If the number is changing, check for conflicts within the same branch+section
    if (input.number && input.number !== existing.number) {
      const conflict = await prisma.table.findFirst({
        where: { restaurantId, branchId: existing.branchId ?? null, sectionId: existing.sectionId ?? null, number: input.number, id: { not: tableId } },
      });
      if (conflict) {
        throw AppError.conflict('A table with this number already exists');
      }
    }

    const table = await prisma.table.update({
      where: { id: tableId },
      data: input,
    });

    // Invalidate cache
    await cache.del(cache.keys.tables(restaurantId));

    return table;
  },

  async updateTableStatus(tableId: string, restaurantId: string, status: TableStatus) {
    // Verify ownership
    const existing = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
    if (!existing) throw AppError.notFound('Table');

    const table = await prisma.table.update({
      where: { id: tableId },
      data: { status },
    });

    // Invalidate cache
    await cache.del(cache.keys.tables(restaurantId));

    return table;
  },

  async deleteTable(tableId: string, restaurantId: string) {
    // Check for active orders
    const activeOrders = await prisma.order.count({
      where: {
        tableId,
        status: { in: ['PENDING', 'PREPARING'] },
      },
    });

    if (activeOrders > 0) {
      throw AppError.badRequest('Cannot delete table with active orders');
    }

    // Verify ownership
    const existing = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
    if (!existing) throw AppError.notFound('Table');

    // Hard delete — FK relations handle cleanup:
    // Orders.tableId → SET NULL
    // TableSessions.tableId → SET NULL
    await prisma.table.delete({
      where: { id: tableId },
    });

    // Invalidate cache
    await cache.del(cache.keys.tables(restaurantId));
  },

  async regenerateQRCode(tableId: string, restaurantId: string) {
    const table = await prisma.table.findFirst({
      where: { id: tableId, restaurantId },
    });

    if (!table) {
      throw AppError.notFound('Table');
    }

    const newQRCode = `${restaurantId}-${table.number}-${uuidv4().slice(0, 8)}`;

    const updated = await prisma.table.update({
      where: { id: tableId },
      data: { qrCode: newQRCode },
    });

    // Invalidate cache
    await cache.del(cache.keys.tables(restaurantId));

    return updated;
  },

  // Get table stats for dashboard
  async getTableStats(restaurantId: string, branchId?: string | null) {
    const tables = await prisma.table.findMany({
      where: { 
        restaurantId,
        ...(branchId ? { branchId } : {}),
      },
      select: { status: true },
    });

    const stats = {
      total: tables.length,
      available: tables.filter(t => t.status === 'AVAILABLE').length,
      occupied: tables.filter(t => t.status === 'OCCUPIED').length,
      reserved: tables.filter(t => t.status === 'RESERVED').length,
      inactive: tables.filter(t => t.status === 'INACTIVE').length,
    };

    return stats;
  },

  // Get all active orders for a table with full item details
  async getTableOrders(tableId: string, restaurantId: string) {
    const table = await prisma.table.findFirst({
      where: { id: tableId, restaurantId },
      select: {
        id: true,
        number: true,
        name: true,
        orders: {
          where: {
            status: { in: ['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING'] },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            subtotal: true,
            tax: true,
            total: true,
            notes: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
                totalPrice: true,
                notes: true,
                menuItem: {
                  select: { id: true, name: true, image: true },
                },
                modifiers: {
                  select: { id: true, name: true, price: true },
                },
              },
            },
          },
        },
      },
    });

    if (!table) {
      throw AppError.notFound('Table');
    }

    // Aggregate all items across orders
    const allItems: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      modifiers: Array<{ name: string; price: number }>;
      notes?: string;
    }> = [];

    let subtotal = 0;
    let tax = 0;
    let total = 0;

    for (const order of table.orders) {
      subtotal += Number(order.subtotal);
      tax += Number(order.tax);
      total += Number(order.total);

      for (const item of order.items) {
        allItems.push({
          name: item.menuItem?.name ?? 'Deleted Item',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          modifiers: item.modifiers.map(m => ({
            name: m.name,
            price: Number(m.price),
          })),
          notes: item.notes ?? undefined,
        });
      }
    }

    return {
      tableId: table.id,
      tableNumber: table.number,
      tableName: table.name,
      orderCount: table.orders.length,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      items: allItems,
    };
  },

  // Get running tables with live billing
  async getRunningTables(restaurantId: string, branchId?: string | null) {
    // Get all tables with active orders in a single optimized query
    const activeOrderStatuses: OrderStatus[] = ['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING'];

    const tablesWithOrders = await prisma.table.findMany({
      where: {
        restaurantId,
        ...(branchId ? { branchId } : {}),
        orders: {
          some: {
            status: { in: activeOrderStatuses },
          },
        },
      },
      select: {
        id: true,
        number: true,
        name: true,
        section: {
          select: { id: true, name: true, floor: true },
        },
        orders: {
          where: {
            status: { in: activeOrderStatuses },
          },
          select: {
            id: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    // Transform and calculate aggregates
    const runningTables = tablesWithOrders
      .map((table) => {
        const totalAmount = table.orders.reduce(
          (sum: number, order) => sum + Number(order.total),
          0
        );

        // Skip tables with zero amount
        if (totalAmount === 0) return null;

        const firstOrder = table.orders[0];
        if (!firstOrder) return null;
        const sessionStart = table.orders.reduce(
          (earliest: Date, order) => 
            order.createdAt < earliest ? order.createdAt : earliest,
          firstOrder.createdAt
        );

        const durationInMinutes = Math.floor(
          (Date.now() - sessionStart.getTime()) / 60000
        );

        return {
          tableId: table.id,
          tableNumber: table.number,
          tableName: table.name,
          sectionId: table.section?.id ?? null,
          sectionName: table.section?.name ?? null,
          invoiceId: null, // TODO: Link to invoice when implemented
          totalAmount,
          orderCount: table.orders.length,
          sessionStart: sessionStart.toISOString(),
          durationInMinutes,
          staffName: null, // TODO: Add staff assignment when implemented
        };
      })
      .filter(Boolean); // Remove null entries

    return runningTables;
  },

  /**
   * Rotate the session token for a table (called when table is cleared/settled).
   * This invalidates all existing customer sessions, preventing remote QR abuse.
   */
  async rotateSessionToken(tableId: string, restaurantId?: string) {
    // Expire any active group orders for this table before rotating
    try {
      const { groupOrderService } = await import('./groupOrderService.js');
      await groupOrderService.expireByTable(tableId);
    } catch (err) {
      // Non-critical — log and continue
      logger.warn({ err, tableId }, 'Failed to expire group orders on session reset');
    }

    const newToken = uuidv4();
    await prisma.table.update({
      where: { id: tableId },
      data: { sessionToken: newToken },
    });
    // Eagerly bust Redis cache so any concurrent refetch gets fresh data
    if (restaurantId) {
      await cache.del(cache.keys.tables(restaurantId)).catch(() => {});
    }
    return newToken;
  },

  /**
   * Manually regenerate session token (admin action for suspicious activity).
   */
  async regenerateSessionToken(tableId: string, restaurantId: string) {
    const existing = await prisma.table.findFirst({ where: { id: tableId, restaurantId } });
    if (!existing) throw AppError.notFound('Table');

    const newToken = uuidv4();
    const table = await prisma.table.update({
      where: { id: tableId },
      data: { sessionToken: newToken },
    });

    await cache.del(cache.keys.tables(restaurantId));
    return table;
  },

  /**
   * Validate that a session token matches the table's current token.
   * Returns true if valid, false if expired/mismatched.
   */
  async validateSessionToken(tableId: string, sessionToken: string): Promise<boolean> {
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: { sessionToken: true },
    });
    if (!table || !table.sessionToken) return false;
    return table.sessionToken === sessionToken;
  },
};
