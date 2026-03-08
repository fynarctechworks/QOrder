import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

export const reportService = {

  /* ─── Hourly Sales Breakdown ─── */
  async hourlySales(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ hour: number; orders: bigint; revenue: number }[]>`
      SELECT
        EXTRACT(HOUR FROM o."createdAt")::int as hour,
        COUNT(*)::bigint as orders,
        COALESCE(SUM(o.total), 0)::float as revenue
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY hour
      ORDER BY hour
    `;
  },

  /* ─── Daily Sales Summary ─── */
  async dailySales(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ date: string; orders: bigint; revenue: number; avg_order: number }[]>`
      SELECT
        DATE(o."createdAt") as date,
        COUNT(*)::bigint as orders,
        COALESCE(SUM(o.total), 0)::float as revenue,
        COALESCE(AVG(o.total), 0)::float as avg_order
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY DATE(o."createdAt")
      ORDER BY date
    `;
  },

  /* ─── Weekly Sales Summary ─── */
  async weeklySales(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ week: string; orders: bigint; revenue: number }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('week', o."createdAt"), 'YYYY-MM-DD') as week,
        COUNT(*)::bigint as orders,
        COALESCE(SUM(o.total), 0)::float as revenue
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY DATE_TRUNC('week', o."createdAt")
      ORDER BY week
    `;
  },

  /* ─── Monthly Sales Summary ─── */
  async monthlySales(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ month: string; orders: bigint; revenue: number }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', o."createdAt"), 'YYYY-MM') as month,
        COUNT(*)::bigint as orders,
        COALESCE(SUM(o.total), 0)::float as revenue
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY DATE_TRUNC('month', o."createdAt")
      ORDER BY month
    `;
  },

  /* ─── Category Performance ─── */
  async categoryPerformance(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ categoryId: string; categoryName: string; items_sold: bigint; revenue: number; order_count: bigint }[]>`
      SELECT
        c.id as "categoryId",
        c.name as "categoryName",
        COALESCE(SUM(oi.quantity), 0)::bigint as items_sold,
        COALESCE(SUM(oi."totalPrice"), 0)::float as revenue,
        COUNT(DISTINCT o.id)::bigint as order_count
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "MenuItem" mi ON oi."menuItemId" = mi.id
      JOIN "Category" c ON mi."categoryId" = c.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `;
  },

  /* ─── Item Performance (top/bottom selling) ─── */
  async itemPerformance(restaurantId: string, startDate: Date, endDate: Date, limit = 50, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ menuItemId: string; itemName: string; categoryName: string; quantity: bigint; revenue: number; order_count: bigint }[]>`
      SELECT
        mi.id as "menuItemId",
        mi.name as "itemName",
        c.name as "categoryName",
        COALESCE(SUM(oi.quantity), 0)::bigint as quantity,
        COALESCE(SUM(oi."totalPrice"), 0)::float as revenue,
        COUNT(DISTINCT o.id)::bigint as order_count
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "MenuItem" mi ON oi."menuItemId" = mi.id
      JOIN "Category" c ON mi."categoryId" = c.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY mi.id, mi.name, c.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;
  },

  /* ─── Payment Method Breakdown ─── */
  async paymentBreakdown(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ method: string; count: bigint; total: number }[]>`
      SELECT
        p.method,
        COUNT(*)::bigint as count,
        COALESCE(SUM(p.amount), 0)::float as total
      FROM "Payment" p
      WHERE p."restaurantId" = ${restaurantId}
        AND p."createdAt" >= ${startDate}
        AND p."createdAt" <= ${endDate}
        AND p.status = 'COMPLETED'
        ${branchFilter}
      GROUP BY p.method
      ORDER BY total DESC
    `;
  },

  /* ─── Discount Usage Report ─── */
  async discountReport(restaurantId: string, startDate: Date, endDate: Date) {
    return prisma.$queryRaw<{ discountId: string; discountName: string; usageCount: bigint; totalSaved: number }[]>`
      SELECT
        d.id as "discountId",
        d.name as "discountName",
        COUNT(od.id)::bigint as "usageCount",
        COALESCE(SUM(od."discountAmount"), 0)::float as "totalSaved"
      FROM "OrderDiscount" od
      JOIN "Discount" d ON od."discountId" = d.id
      JOIN "Order" o ON od."orderId" = o.id
      WHERE o."restaurantId" = ${restaurantId}
        AND od."createdAt" >= ${startDate}
        AND od."createdAt" <= ${endDate}
      GROUP BY d.id, d.name
      ORDER BY "totalSaved" DESC
    `;
  },

  /* ─── Table Utilization ─── */
  async tableUtilization(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND ts."branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ tableId: string; tableName: string; session_count: bigint; total_revenue: number; avg_session_minutes: number }[]>`
      SELECT
        t.id as "tableId",
        COALESCE(t.name, t.number) as "tableName",
        COUNT(ts.id)::bigint as session_count,
        COALESCE(SUM(ts."totalAmount"), 0)::float as total_revenue,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(ts."closedAt", NOW()) - ts."startedAt")) / 60), 0)::float as avg_session_minutes
      FROM "Table" t
      LEFT JOIN "TableSession" ts ON ts."tableId" = t.id
        AND ts."startedAt" >= ${startDate}
        AND ts."startedAt" <= ${endDate}
        ${branchFilter}
      WHERE t."restaurantId" = ${restaurantId}
      GROUP BY t.id, t.name, t.number
      ORDER BY total_revenue DESC
    `;
  },

  /* ─── Feedback Summary ─── */
  async feedbackSummary(restaurantId: string, startDate: Date, endDate: Date) {
    const [avgRatings, ratingDist] = await Promise.all([
      prisma.$queryRaw<{ avg_overall: number; avg_food: number; avg_service: number; avg_ambience: number; total: bigint }[]>`
        SELECT
          COALESCE(AVG("overallRating"), 0)::float as avg_overall,
          COALESCE(AVG("foodRating"), 0)::float as avg_food,
          COALESCE(AVG("serviceRating"), 0)::float as avg_service,
          COALESCE(AVG("ambienceRating"), 0)::float as avg_ambience,
          COUNT(*)::bigint as total
        FROM "Feedback"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
      `,
      prisma.$queryRaw<{ rating: number; count: bigint }[]>`
        SELECT "overallRating" as rating, COUNT(*)::bigint as count
        FROM "Feedback"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
        GROUP BY "overallRating"
        ORDER BY "overallRating"
      `,
    ]);

    return {
      averages: avgRatings[0] ?? { avg_overall: 0, avg_food: 0, avg_service: 0, avg_ambience: 0, total: 0 },
      distribution: ratingDist.map((r: { rating: number; count: bigint }) => ({ rating: r.rating, count: Number(r.count) })),
    };
  },

  /* ─── Revenue Comparison (current vs previous period) ─── */
  async revenueComparison(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodMs);
    const prevEnd = new Date(startDate.getTime());

    const branchFilter = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty;

    const [current, previous] = await Promise.all([
      prisma.$queryRaw<{ revenue: number; orders: bigint }[]>`
        SELECT COALESCE(SUM(total), 0)::float as revenue, COUNT(*)::bigint as orders
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
          AND status NOT IN ('CANCELLED')
          ${branchFilter}
      `,
      prisma.$queryRaw<{ revenue: number; orders: bigint }[]>`
        SELECT COALESCE(SUM(total), 0)::float as revenue, COUNT(*)::bigint as orders
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND "createdAt" >= ${prevStart} AND "createdAt" <= ${prevEnd}
          AND status NOT IN ('CANCELLED')
          ${branchFilter}
      `,
    ]);

    const cur = current[0] ?? { revenue: 0, orders: 0n };
    const prev = previous[0] ?? { revenue: 0, orders: 0n };

    return {
      current: { revenue: cur.revenue, orders: Number(cur.orders) },
      previous: { revenue: prev.revenue, orders: Number(prev.orders) },
      revenueChange: prev.revenue > 0 ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : 0,
      ordersChange: Number(prev.orders) > 0 ? ((Number(cur.orders) - Number(prev.orders)) / Number(prev.orders)) * 100 : 0,
    };
  },

  /* ─── Inventory Consumption vs Sales ─── */
  async inventoryConsumption(restaurantId: string, startDate: Date, endDate: Date) {
    return prisma.$queryRaw<{ ingredientId: string; ingredientName: string; unit: string; total_consumed: number; cost: number }[]>`
      SELECT
        i.id as "ingredientId",
        i.name as "ingredientName",
        i.unit,
        COALESCE(SUM(sm.quantity), 0)::float as total_consumed,
        COALESCE(SUM(sm.quantity * COALESCE(sm."costPerUnit", i."costPerUnit")), 0)::float as cost
      FROM "StockMovement" sm
      JOIN "Ingredient" i ON sm."ingredientId" = i.id
      WHERE sm."restaurantId" = ${restaurantId}
        AND sm."createdAt" >= ${startDate}
        AND sm."createdAt" <= ${endDate}
        AND sm.type IN ('ORDER_DEDUCT', 'USAGE', 'WASTE')
      GROUP BY i.id, i.name, i.unit
      ORDER BY cost DESC
    `;
  },

  /* ─── Peak Day Analysis ─── */
  async peakDayAnalysis(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ day_of_week: number; day_name: string; avg_orders: number; avg_revenue: number }[]>`
      SELECT
        EXTRACT(DOW FROM "createdAt")::int as day_of_week,
        TO_CHAR("createdAt", 'Day') as day_name,
        (COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (${endDate}::timestamp - ${startDate}::timestamp)) / 604800, 1)) as avg_orders,
        (COALESCE(SUM(total), 0)::float / GREATEST(EXTRACT(EPOCH FROM (${endDate}::timestamp - ${startDate}::timestamp)) / 604800, 1)) as avg_revenue
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        AND status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY day_of_week, day_name
      ORDER BY day_of_week
    `;
  },

  /* ─── Order Status Distribution ─── */
  async orderStatusBreakdown(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      createdAt: { gte: startDate, lte: endDate },
    };
    if (branchId) where.branchId = branchId;

    return prisma.order.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  },

  /* ─── Average Preparation Time ─── */
  async avgPrepTime(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty;

    return prisma.$queryRaw<{ avg_prep_minutes: number; total_orders: bigint }[]>`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM ("preparedAt" - "createdAt")) / 60), 0)::float as avg_prep_minutes,
        COUNT(*)::bigint as total_orders
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        AND "preparedAt" IS NOT NULL
        ${branchFilter}
    `;
  },
};
