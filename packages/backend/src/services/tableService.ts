import { v4 as uuidv4 } from 'uuid';
import { prisma, cache, AppError } from '../lib/index.js';
import type { CreateTableInput, UpdateTableInput } from '../validators/index.js';
import { TableStatus, OrderStatus } from '@prisma/client';

export const tableService = {
  async getTables(restaurantId: string) {
    // Try cache first
    const cacheKey = cache.keys.tables(restaurantId);
    const cached = await cache.get<Awaited<ReturnType<typeof this.fetchTables>>>(cacheKey);
    
    if (cached) return cached;

    const tables = await this.fetchTables(restaurantId);
    await cache.set(cacheKey, tables, cache.ttl.short);
    
    return tables;
  },

  async fetchTables(restaurantId: string) {
    return prisma.table.findMany({
      where: { 
        restaurantId,
      },
      orderBy: [{ number: 'asc' }],
      include: {
        _count: {
          select: {
            orders: {
              where: {
                status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
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
            status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
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
            logo: true,
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

  async createTable(restaurantId: string, input: CreateTableInput) {
    // Check if a table with the same number already exists
    const existing = await prisma.table.findUnique({
      where: { restaurantId_number: { restaurantId, number: input.number } },
    });

    if (existing) {
      throw AppError.conflict('A table with this number already exists');
    }

    // Generate unique QR code
    const qrCode = `${restaurantId}-${input.number}-${uuidv4().slice(0, 8)}`;

    const table = await prisma.table.create({
      data: {
        ...input,
        qrCode,
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
    capacity: number
  ) {
    const tables = [];

    for (let i = 0; i < count; i++) {
      const number = String(startNumber + i);
      const qrCode = `${restaurantId}-${number}-${uuidv4().slice(0, 8)}`;

      tables.push({
        number,
        capacity,
        qrCode,
        restaurantId,
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

    // If the number is changing, check for conflicts
    if (input.number && input.number !== existing.number) {
      const conflict = await prisma.table.findFirst({
        where: { restaurantId, number: input.number, id: { not: tableId } },
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
  async getTableStats(restaurantId: string) {
    const tables = await prisma.table.findMany({
      where: { 
        restaurantId,
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
            status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
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
          name: item.menuItem.name,
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
  async getRunningTables(restaurantId: string) {
    // Get all tables with active orders in a single optimized query
    const activeOrderStatuses: OrderStatus[] = ['PENDING', 'PREPARING', 'PAYMENT_PENDING'];

    const tablesWithOrders = await prisma.table.findMany({
      where: {
        restaurantId,
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
};
