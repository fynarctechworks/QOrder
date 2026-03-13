import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

export const dashboardService = {

  async getExtras(restaurantId: string, branchId?: string | null) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const branchFilter = branchId ? { OR: [{ branchId }, { branchId: null }] } : {};
    const branchSql = branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty;
    const branchSqlO = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    const [
      tableStatusRaw,
      customersToday,
      qrScansToday,
      paymentSummary,
      financials,
      lowStockItems,
      pendingServiceRequests,
      pendingPayments,
    ] = await Promise.all([
      // 1. Table status counts
      prisma.table.groupBy({
        by: ['status'],
        where: { restaurantId, ...branchFilter },
        _count: true,
      }),

      // 2. Unique customers today (distinct phone numbers from orders)
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT COALESCE("customerPhone", "tableId", "id"))::bigint AS count
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${todayStart}
          AND "createdAt" <= ${now}
          ${branchSql}
      `,

      // 3. QR scans approximation: table sessions started today
      prisma.tableSession.count({
        where: {
          restaurantId,
          ...branchFilter,
          startedAt: { gte: todayStart, lte: now },
        },
      }),

      // 4. Payment method breakdown for today
      prisma.$queryRaw<{ method: string; count: bigint; total: number }[]>`
        SELECT
          p."method",
          COUNT(*)::bigint AS count,
          COALESCE(SUM(p."amount"), 0)::float AS total
        FROM "Payment" p
        JOIN "TableSession" ts ON ts."id" = p."sessionId"
        WHERE ts."restaurantId" = ${restaurantId}
          AND p."createdAt" >= ${todayStart}
          AND p."status" = 'COMPLETED'
          ${branchId ? Prisma.sql`AND (ts."branchId" = ${branchId} OR ts."branchId" IS NULL)` : Prisma.empty}
        GROUP BY p."method"
        ORDER BY total DESC
      `,

      // 5. Financial snapshot: total discount & tax from today's completed orders
      prisma.$queryRaw<[{ total_discount: number; total_tax: number; total_subtotal: number }]>`
        SELECT
          COALESCE(SUM("discount"), 0)::float AS total_discount,
          COALESCE(SUM("tax"), 0)::float AS total_tax,
          COALESCE(SUM("subtotal"), 0)::float AS total_subtotal
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${todayStart}
          AND "status" = 'COMPLETED'
          ${branchSql}
      `,

      // 6. Low stock ingredients (currentStock < minStock)
      prisma.$queryRaw<{ id: string; name: string; current_stock: number; min_stock: number; unit: string }[]>`
        SELECT "id", "name", "currentStock"::float AS current_stock, "minStock"::float AS min_stock, "unit"
        FROM "Ingredient"
        WHERE "restaurantId" = ${restaurantId}
          AND "isActive" = true
          AND "currentStock" < "minStock"
          AND "minStock" > 0
          ${branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty}
        ORDER BY ("currentStock" / NULLIF("minStock", 0)) ASC
        LIMIT 10
      `,

      // 7. Pending service requests
      prisma.serviceRequest.count({
        where: {
          restaurantId,
          status: 'PENDING',
        },
      }),

      // 8. Pending payments (sessions not closed with pending payments)
      prisma.payment.count({
        where: {
          session: {
            restaurantId,
            ...branchFilter,
          },
          status: 'PENDING',
          createdAt: { gte: todayStart },
        },
      }),
    ]);

    // Low performing items: Bottom 5 items by quantity sold today
    const lowPerformers = await prisma.$queryRaw<{
      item_name: string;
      quantity: bigint;
      revenue: number;
    }[]>`
      SELECT
        mi."name" AS item_name,
        COALESCE(SUM(oi."quantity"), 0)::bigint AS quantity,
        COALESCE(SUM(oi."totalPrice"), 0)::float AS revenue
      FROM "MenuItem" mi
      LEFT JOIN "OrderItem" oi ON oi."menuItemId" = mi."id"
        AND oi."orderId" IN (
          SELECT o."id" FROM "Order" o
          WHERE o."restaurantId" = ${restaurantId}
            AND o."createdAt" >= ${todayStart}
            AND o."status" IN ('COMPLETED', 'PREPARING', 'READY', 'PAYMENT_PENDING')
            ${branchSqlO}
        )
      WHERE mi."restaurantId" = ${restaurantId}
        AND mi."isAvailable" = true
        ${branchId ? Prisma.sql`AND (mi."branchId" = ${branchId} OR mi."branchId" IS NULL)` : Prisma.empty}
      GROUP BY mi."id", mi."name"
      HAVING COALESCE(SUM(oi."quantity"), 0) > 0
      ORDER BY quantity ASC, revenue ASC
      LIMIT 5
    `;

    // Parse table status
    const tableStatusMap: Record<string, number> = {
      AVAILABLE: 0,
      OCCUPIED: 0,
      RESERVED: 0,
      INACTIVE: 0,
    };
    let totalTables = 0;
    for (const row of tableStatusRaw) {
      tableStatusMap[row.status] = row._count;
      totalTables += row._count;
    }

    const fin = financials[0] ?? { total_discount: 0, total_tax: 0, total_subtotal: 0 };
    const custCount = customersToday[0]?.count ?? BigInt(0);

    return {
      tableStatus: {
        total: totalTables,
        available: tableStatusMap.AVAILABLE ?? 0,
        occupied: tableStatusMap.OCCUPIED ?? 0,
        reserved: tableStatusMap.RESERVED ?? 0,
        inactive: tableStatusMap.INACTIVE ?? 0,
      },
      customersToday: Number(custCount),
      qrScansToday,
      paymentSummary: paymentSummary.map(p => ({
        method: p.method,
        count: Number(p.count),
        total: Number(p.total),
      })),
      financials: {
        totalDiscount: Number(fin.total_discount),
        totalTax: Number(fin.total_tax),
        totalSubtotal: Number(fin.total_subtotal),
      },
      lowStockItems: lowStockItems.map(i => ({
        id: i.id,
        name: i.name,
        currentStock: Number(i.current_stock),
        minStock: Number(i.min_stock),
        unit: i.unit,
      })),
      lowPerformingItems: lowPerformers.map(i => ({
        itemName: i.item_name,
        quantity: Number(i.quantity),
        revenue: Number(i.revenue),
      })),
      pendingServiceRequests,
      pendingPayments,
    };
  },
};
