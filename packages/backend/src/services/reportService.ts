import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

export const reportService = {

  /* ─── Hourly Sales Breakdown ─── */
  async hourlySales(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ hour: number; orders: bigint; revenue: number }[]>`
      SELECT
        EXTRACT(HOUR FROM (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::int as hour,
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
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ date: string; orders: bigint; revenue: number; avg_order: number }[]>`
      SELECT
        DATE((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') as date,
        COUNT(*)::bigint as orders,
        COALESCE(SUM(o.total), 0)::float as revenue,
        COALESCE(AVG(o.total), 0)::float as avg_order
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY DATE((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
      ORDER BY date
    `;
  },

  /* ─── Weekly Sales Summary ─── */
  async weeklySales(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ week: string; orders: bigint; revenue: number }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('week', (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') as week,
        COUNT(*)::bigint as orders,
        COALESCE(SUM(o.total), 0)::float as revenue
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY DATE_TRUNC('week', (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
      ORDER BY week
    `;
  },

  /* ─── Monthly Sales Summary ─── */
  async monthlySales(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ month: string; orders: bigint; revenue: number }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') as month,
        COUNT(*)::bigint as orders,
        COALESCE(SUM(o.total), 0)::float as revenue
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY DATE_TRUNC('month', (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
      ORDER BY month
    `;
  },

  /* ─── Category Performance ─── */
  async categoryPerformance(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

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
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

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
    const branchFilter = branchId ? Prisma.sql`AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)` : Prisma.empty;

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
    const branchFilter = branchId ? Prisma.sql`AND (ts."branchId" = ${branchId} OR ts."branchId" IS NULL)` : Prisma.empty;

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

    const branchFilter = branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty;

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
    const branchFilter = branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ day_of_week: number; day_name: string; avg_orders: number; avg_revenue: number }[]>`
      SELECT
        EXTRACT(DOW FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::int as day_of_week,
        TO_CHAR(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'Day') as day_name,
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
    if (branchId) where.OR = [{ branchId }, { branchId: null }];

    return prisma.order.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  },

  /* ─── Average Preparation Time ─── */
  async avgPrepTime(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND ("branchId" = ${branchId} OR "branchId" IS NULL)` : Prisma.empty;

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

  /* ═══ INVENTORY VS SALES REPORTS ═══ */

  /* ─── Cost of Goods Sold (COGS) ─── */
  async cogsReport(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{
      menuItemId: string; itemName: string; categoryName: string;
      qty_sold: bigint; revenue: number; ingredient_cost: number; profit: number; margin_pct: number;
    }[]>`
      SELECT
        mi.id as "menuItemId",
        mi.name as "itemName",
        c.name as "categoryName",
        COALESCE(SUM(oi.quantity), 0)::bigint as qty_sold,
        COALESCE(SUM(oi."totalPrice"), 0)::float as revenue,
        COALESCE(SUM(oi.quantity * recipe_cost.cost_per_item), 0)::float as ingredient_cost,
        (COALESCE(SUM(oi."totalPrice"), 0) - COALESCE(SUM(oi.quantity * recipe_cost.cost_per_item), 0))::float as profit,
        CASE
          WHEN COALESCE(SUM(oi."totalPrice"), 0) > 0
          THEN ((COALESCE(SUM(oi."totalPrice"), 0) - COALESCE(SUM(oi.quantity * recipe_cost.cost_per_item), 0))
                / COALESCE(SUM(oi."totalPrice"), 0) * 100)::float
          ELSE 0
        END as margin_pct
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "MenuItem" mi ON oi."menuItemId" = mi.id
      JOIN "Category" c ON mi."categoryId" = c.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(r.quantity * i."costPerUnit"), 0)::float as cost_per_item
        FROM "Recipe" r
        JOIN "Ingredient" i ON r."ingredientId" = i.id
        WHERE r."menuItemId" = mi.id
      ) recipe_cost ON true
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY mi.id, mi.name, c.name
      ORDER BY revenue DESC
    `;
  },

  /* ─── Inventory Cost vs Revenue (monthly timeline) ─── */
  async inventoryVsRevenue(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;
    const poBranchFilter = branchId ? Prisma.sql`AND (po."branchId" = ${branchId} OR po."branchId" IS NULL)` : Prisma.empty;

    const [revenueData, costData] = await Promise.all([
      prisma.$queryRaw<{ month: string; revenue: number; orders: bigint }[]>`
        SELECT
          TO_CHAR((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') as month,
          COALESCE(SUM(o.total), 0)::float as revenue,
          COUNT(*)::bigint as orders
        FROM "Order" o
        WHERE o."restaurantId" = ${restaurantId}
          AND o."createdAt" >= ${startDate}
          AND o."createdAt" <= ${endDate}
          AND o.status NOT IN ('CANCELLED')
          ${branchFilter}
        GROUP BY TO_CHAR((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')
        ORDER BY month
      `,
      prisma.$queryRaw<{ month: string; cost: number }[]>`
        SELECT
          TO_CHAR(COALESCE(po."receivedAt", po."createdAt"), 'YYYY-MM') as month,
          COALESCE(SUM(poi."totalCost"), 0)::float as cost
        FROM "PurchaseOrderItem" poi
        JOIN "PurchaseOrder" po ON poi."purchaseOrderId" = po.id
        WHERE po."restaurantId" = ${restaurantId}
          AND COALESCE(po."receivedAt", po."createdAt") >= ${startDate}
          AND COALESCE(po."receivedAt", po."createdAt") <= ${endDate}
          AND po.status IN ('RECEIVED', 'ORDERED')
          ${poBranchFilter}
        GROUP BY TO_CHAR(COALESCE(po."receivedAt", po."createdAt"), 'YYYY-MM')
        ORDER BY month
      `,
    ]);

    // Collect all unique months from both datasets
    const monthMap = new Map<string, { revenue: number; cost: number; orders: number }>();
    for (const r of revenueData) {
      const key = String(r.month);
      monthMap.set(key, { revenue: r.revenue, cost: 0, orders: Number(r.orders) });
    }
    for (const c of costData) {
      const key = String(c.month);
      const existing = monthMap.get(key);
      if (existing) {
        existing.cost = c.cost;
      } else {
        monthMap.set(key, { revenue: 0, cost: c.cost, orders: 0 });
      }
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        revenue: d.revenue,
        cost: d.cost,
        profit: d.revenue - d.cost,
        orders: d.orders,
      }));
  },

  /* ─── Stock Forecast (days of stock remaining per ingredient) ─── */
  async stockForecast(restaurantId: string, startDate: Date, endDate: Date) {
    const daySpan = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    return prisma.$queryRaw<{
      ingredientId: string; ingredientName: string; unit: string;
      current_stock: number; min_stock: number; daily_usage: number; days_remaining: number; status: string;
    }[]>`
      SELECT
        i.id as "ingredientId",
        i.name as "ingredientName",
        i.unit,
        i."currentStock"::float as current_stock,
        i."minStock"::float as min_stock,
        COALESCE(usage.total_used / ${daySpan}, 0)::float as daily_usage,
        CASE
          WHEN COALESCE(usage.total_used, 0) = 0 THEN 9999
          ELSE (i."currentStock" / (usage.total_used / ${daySpan}))::float
        END as days_remaining,
        CASE
          WHEN i."currentStock" <= 0 THEN 'OUT_OF_STOCK'
          WHEN i."currentStock" <= i."minStock" THEN 'LOW_STOCK'
          WHEN COALESCE(usage.total_used, 0) > 0
            AND (i."currentStock" / (usage.total_used / ${daySpan})) <= 7 THEN 'REORDER_SOON'
          ELSE 'OK'
        END as status
      FROM "Ingredient" i
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(sm.quantity), 0)::float as total_used
        FROM "StockMovement" sm
        WHERE sm."ingredientId" = i.id
          AND sm.type IN ('ORDER_DEDUCT', 'USAGE', 'WASTE')
          AND sm."createdAt" >= ${startDate}
          AND sm."createdAt" <= ${endDate}
      ) usage ON true
      WHERE i."restaurantId" = ${restaurantId}
        AND i."isActive" = true
      ORDER BY days_remaining ASC
    `;
  },

  /* ─── Wastage / Variance Report (theoretical vs actual consumption) ─── */
  async wastageVariance(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    const [theoretical, actual] = await Promise.all([
      // Theoretical: quantity sold × recipe quantity per ingredient
      prisma.$queryRaw<{ ingredientId: string; ingredientName: string; unit: string; expected: number; cost_per_unit: number }[]>`
        SELECT
          ing.id as "ingredientId",
          ing.name as "ingredientName",
          ing.unit,
          COALESCE(SUM(oi.quantity * r.quantity), 0)::float as expected,
          ing."costPerUnit"::float as cost_per_unit
        FROM "OrderItem" oi
        JOIN "Order" o ON oi."orderId" = o.id
        JOIN "Recipe" r ON r."menuItemId" = oi."menuItemId"
        JOIN "Ingredient" ing ON r."ingredientId" = ing.id
        WHERE o."restaurantId" = ${restaurantId}
          AND o."createdAt" >= ${startDate}
          AND o."createdAt" <= ${endDate}
          AND o.status NOT IN ('CANCELLED')
          ${branchFilter}
        GROUP BY ing.id, ing.name, ing.unit, ing."costPerUnit"
      `,
      // Actual: stock movements for deduction types
      prisma.$queryRaw<{ ingredientId: string; actual_used: number; waste: number }[]>`
        SELECT
          sm."ingredientId" as "ingredientId",
          COALESCE(SUM(CASE WHEN sm.type IN ('ORDER_DEDUCT', 'USAGE') THEN sm.quantity ELSE 0 END), 0)::float as actual_used,
          COALESCE(SUM(CASE WHEN sm.type = 'WASTE' THEN sm.quantity ELSE 0 END), 0)::float as waste
        FROM "StockMovement" sm
        WHERE sm."restaurantId" = ${restaurantId}
          AND sm."createdAt" >= ${startDate}
          AND sm."createdAt" <= ${endDate}
          AND sm.type IN ('ORDER_DEDUCT', 'USAGE', 'WASTE')
        GROUP BY sm."ingredientId"
      `,
    ]);

    const actualMap = new Map(actual.map(a => [a.ingredientId, a]));

    return theoretical.map(t => {
      const a = actualMap.get(t.ingredientId);
      const actualUsed = a ? a.actual_used + a.waste : 0;
      const variance = actualUsed - t.expected;
      const variancePct = t.expected > 0 ? (variance / t.expected) * 100 : 0;
      const varianceCost = variance * t.cost_per_unit;
      return {
        ingredientId: t.ingredientId,
        ingredientName: t.ingredientName,
        unit: t.unit,
        expected: t.expected,
        actual: actualUsed,
        waste: a?.waste ?? 0,
        variance,
        variance_pct: variancePct,
        variance_cost: varianceCost,
      };
    });
  },

  /* ─── Top Profitable Items ─── */
  async topProfitableItems(restaurantId: string, startDate: Date, endDate: Date, limit = 30, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{
      menuItemId: string; itemName: string; categoryName: string;
      qty_sold: bigint; selling_price: number; cost_price: number; profit_per_unit: number;
      total_profit: number; margin_pct: number;
    }[]>`
      SELECT
        mi.id as "menuItemId",
        mi.name as "itemName",
        c.name as "categoryName",
        COALESCE(SUM(oi.quantity), 0)::bigint as qty_sold,
        CASE WHEN SUM(oi.quantity) > 0
          THEN (SUM(oi."totalPrice") / SUM(oi.quantity))::float
          ELSE 0
        END as selling_price,
        COALESCE(recipe_cost.cost_per_item, 0)::float as cost_price,
        CASE WHEN SUM(oi.quantity) > 0
          THEN ((SUM(oi."totalPrice") / SUM(oi.quantity)) - COALESCE(recipe_cost.cost_per_item, 0))::float
          ELSE 0
        END as profit_per_unit,
        (COALESCE(SUM(oi."totalPrice"), 0) - COALESCE(SUM(oi.quantity) * recipe_cost.cost_per_item, 0))::float as total_profit,
        CASE
          WHEN COALESCE(SUM(oi."totalPrice"), 0) > 0
          THEN ((COALESCE(SUM(oi."totalPrice"), 0) - COALESCE(SUM(oi.quantity) * recipe_cost.cost_per_item, 0))
                / COALESCE(SUM(oi."totalPrice"), 0) * 100)::float
          ELSE 0
        END as margin_pct
      FROM "OrderItem" oi
      JOIN "Order" o ON oi."orderId" = o.id
      JOIN "MenuItem" mi ON oi."menuItemId" = mi.id
      JOIN "Category" c ON mi."categoryId" = c.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(r.quantity * i."costPerUnit"), 0)::float as cost_per_item
        FROM "Recipe" r
        JOIN "Ingredient" i ON r."ingredientId" = i.id
        WHERE r."menuItemId" = mi.id
      ) recipe_cost ON true
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY mi.id, mi.name, c.name, recipe_cost.cost_per_item
      ORDER BY total_profit DESC
      LIMIT ${limit}
    `;
  },

  /* ═══════════════════ NEW REPORTS ═══════════════════ */

  /* ─── Sales Summary Report ─── */
  async salesSummary(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    const rows = await prisma.$queryRaw<{ total_revenue: number; total_orders: bigint; avg_order_value: number; total_items_sold: bigint; total_tax: number; total_discount: number; highest_order: number; lowest_order: number }[]>`
      SELECT
        COALESCE(SUM(o."total"::numeric), 0) AS total_revenue,
        COUNT(o.id) AS total_orders,
        COALESCE(AVG(o."total"::numeric), 0) AS avg_order_value,
        COALESCE(SUM(sub.item_count), 0) AS total_items_sold,
        COALESCE(SUM(o."tax"::numeric), 0) AS total_tax,
        COALESCE(SUM(o."discount"::numeric), 0) AS total_discount,
        COALESCE(MAX(o."total"::numeric), 0) AS highest_order,
        COALESCE(MIN(o."total"::numeric), 0) AS lowest_order
      FROM "Order" o
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(oi.quantity), 0) AS item_count
        FROM "OrderItem" oi WHERE oi."orderId" = o.id
      ) sub ON true
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
    `;
    return rows[0] ?? { total_revenue: 0, total_orders: 0, avg_order_value: 0, total_items_sold: 0, total_tax: 0, total_discount: 0, highest_order: 0, lowest_order: 0 };
  },

  /* ─── Orders Report (detailed listing) ─── */
  async ordersReport(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ orderId: string; orderNumber: string; status: string; customerName: string; tableName: string; items: bigint; subtotal: number; tax: number; discount: number; total: number; createdAt: Date }[]>`
      SELECT
        o.id AS "orderId",
        o."orderNumber",
        o.status,
        COALESCE(o."customerName", 'Walk-in') AS "customerName",
        COALESCE(t."name", t."number", 'Takeaway') AS "tableName",
        COALESCE(sub.item_count, 0) AS items,
        o."subtotal"::numeric AS subtotal,
        o."tax"::numeric AS tax,
        o."discount"::numeric AS discount,
        o."total"::numeric AS total,
        o."createdAt"
      FROM "Order" o
      LEFT JOIN "Table" t ON t.id = o."tableId"
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity) AS item_count FROM "OrderItem" oi WHERE oi."orderId" = o.id
      ) sub ON true
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
        ${branchFilter}
      ORDER BY o."createdAt" DESC
      LIMIT 500
    `;
  },

  /* ─── Cancelled Orders Report ─── */
  async cancelledOrders(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ orderId: string; orderNumber: string; customerName: string; tableName: string; total: number; items: bigint; createdAt: Date }[]>`
      SELECT
        o.id AS "orderId",
        o."orderNumber",
        COALESCE(o."customerName", 'Walk-in') AS "customerName",
        COALESCE(t."name", t."number", 'Takeaway') AS "tableName",
        o."total"::numeric AS total,
        COALESCE(sub.item_count, 0) AS items,
        o."createdAt"
      FROM "Order" o
      LEFT JOIN "Table" t ON t.id = o."tableId"
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity) AS item_count FROM "OrderItem" oi WHERE oi."orderId" = o.id
      ) sub ON true
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
        AND o.status = 'CANCELLED'
        ${branchFilter}
      ORDER BY o."createdAt" DESC
      LIMIT 500
    `;
  },

  /* ─── Top Selling Items Report (by quantity) ─── */
  async topSellingItems(restaurantId: string, startDate: Date, endDate: Date, limit = 50, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ menuItemId: string; itemName: string; categoryName: string; quantity: bigint; revenue: number; order_count: bigint }[]>`
      SELECT
        mi.id AS "menuItemId",
        mi.name AS "itemName",
        c.name AS "categoryName",
        SUM(oi.quantity) AS quantity,
        SUM(oi."totalPrice"::numeric) AS revenue,
        COUNT(DISTINCT o.id) AS order_count
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "MenuItem" mi ON mi.id = oi."menuItemId"
      LEFT JOIN "Category" c ON c.id = mi."categoryId"
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY mi.id, mi.name, c.name
      ORDER BY quantity DESC
      LIMIT ${limit}
    `;
  },

  /* ─── Low Performing Items Report ─── */
  async lowPerformingItems(restaurantId: string, startDate: Date, endDate: Date, limit = 50, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;
    const miBranchFilter = branchId ? Prisma.sql`AND (mi."branchId" = ${branchId} OR mi."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ menuItemId: string; itemName: string; categoryName: string; quantity: bigint; revenue: number; order_count: bigint }[]>`
      SELECT
        mi.id AS "menuItemId",
        mi.name AS "itemName",
        c.name AS "categoryName",
        COALESCE(sales.quantity, 0) AS quantity,
        COALESCE(sales.revenue, 0) AS revenue,
        COALESCE(sales.order_count, 0) AS order_count
      FROM "MenuItem" mi
      LEFT JOIN "Category" c ON c.id = mi."categoryId"
      LEFT JOIN LATERAL (
        SELECT
          SUM(oi.quantity) AS quantity,
          SUM(oi."totalPrice"::numeric) AS revenue,
          COUNT(DISTINCT o.id) AS order_count
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE oi."menuItemId" = mi.id
          AND o."restaurantId" = ${restaurantId}
          AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
          AND o.status NOT IN ('CANCELLED')
          ${branchFilter}
      ) sales ON true
      WHERE mi."restaurantId" = ${restaurantId}
        AND mi."isActive" = true
        AND mi."isAvailable" = true
        ${miBranchFilter}
      ORDER BY quantity ASC, revenue ASC
      LIMIT ${limit}
    `;
  },

  /* ─── Table Activity Report ─── */
  async tableActivity(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (ts."branchId" = ${branchId} OR ts."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ tableId: string; tableName: string; sessions: bigint; avg_duration_min: number; total_revenue: number; orders: bigint; turnover_rate: number }[]>`
      SELECT
        t.id AS "tableId",
        COALESCE(t.name, t.number) AS "tableName",
        COUNT(ts.id) AS sessions,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(ts."closedAt", NOW()) - ts."startedAt")) / 60), 0) AS avg_duration_min,
        COALESCE(SUM(ts."totalAmount"::numeric), 0) AS total_revenue,
        COALESCE(SUM(sub.order_count), 0) AS orders,
        CASE WHEN COUNT(ts.id) > 0
          THEN ROUND(COUNT(ts.id)::numeric / GREATEST(EXTRACT(EPOCH FROM (${endDate}::timestamp - ${startDate}::timestamp)) / 3600, 1), 2)
          ELSE 0
        END AS turnover_rate
      FROM "Table" t
      LEFT JOIN "TableSession" ts ON ts."tableId" = t.id
        AND ts."startedAt" BETWEEN ${startDate} AND ${endDate}
        AND ts."restaurantId" = ${restaurantId}
        ${branchFilter}
      LEFT JOIN LATERAL (
        SELECT COUNT(o.id) AS order_count FROM "Order" o
        WHERE o."sessionId" = ts.id AND o.status NOT IN ('CANCELLED')
      ) sub ON true
      WHERE t."restaurantId" = ${restaurantId}
        ${branchId ? Prisma.sql`AND (t."branchId" = ${branchId} OR t."branchId" IS NULL)` : Prisma.empty}
      GROUP BY t.id, t.name, t.number
      ORDER BY sessions DESC
    `;
  },

  /* ─── Tax Report ─── */
  async taxReport(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ date: string; orders: bigint; subtotal: number; tax: number; total: number; effective_tax_rate: number }[]>`
      SELECT
        TO_CHAR((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
        COUNT(o.id) AS orders,
        SUM(o."subtotal"::numeric) AS subtotal,
        SUM(o."tax"::numeric) AS tax,
        SUM(o."total"::numeric) AS total,
        CASE WHEN SUM(o."subtotal"::numeric) > 0
          THEN ROUND(SUM(o."tax"::numeric) / SUM(o."subtotal"::numeric) * 100, 2)
          ELSE 0
        END AS effective_tax_rate
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY TO_CHAR((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
      ORDER BY date ASC
    `;
  },

  /* ─── Customer Report ─── */
  async customerReport(restaurantId: string, startDate: Date, endDate: Date) {
    return prisma.$queryRaw<{ customerId: string; phone: string; name: string; totalVisits: number; totalSpend: number; avgOrderValue: number; lastVisitAt: Date | null; firstVisitAt: Date | null }[]>`
      SELECT
        c.id AS "customerId",
        c.phone,
        COALESCE(c.name, 'Unknown') AS name,
        c."totalVisits",
        c."totalSpend"::numeric AS "totalSpend",
        c."avgOrderValue"::numeric AS "avgOrderValue",
        c."lastVisitAt",
        c."firstVisitAt"
      FROM "Customer" c
      WHERE c."restaurantId" = ${restaurantId}
        AND (c."lastVisitAt" BETWEEN ${startDate} AND ${endDate}
             OR c."firstVisitAt" BETWEEN ${startDate} AND ${endDate})
      ORDER BY c."totalSpend" DESC
      LIMIT 500
    `;
  },

  /* ─── Repeat Customers Report ─── */
  async repeatCustomers(restaurantId: string, startDate: Date, endDate: Date) {
    return prisma.$queryRaw<{ customerId: string; phone: string; name: string; totalVisits: number; totalSpend: number; avgOrderValue: number; lastVisitAt: Date | null }[]>`
      SELECT
        c.id AS "customerId",
        c.phone,
        COALESCE(c.name, 'Unknown') AS name,
        c."totalVisits",
        c."totalSpend"::numeric AS "totalSpend",
        c."avgOrderValue"::numeric AS "avgOrderValue",
        c."lastVisitAt"
      FROM "Customer" c
      WHERE c."restaurantId" = ${restaurantId}
        AND c."totalVisits" > 1
        AND (c."lastVisitAt" BETWEEN ${startDate} AND ${endDate}
             OR c."firstVisitAt" BETWEEN ${startDate} AND ${endDate})
      ORDER BY c."totalVisits" DESC
      LIMIT 500
    `;
  },

  /* ─── QR Scan Report ─── */
  async qrScanReport(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (ts."branchId" = ${branchId} OR ts."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ date: string; scans: bigint; unique_tables: bigint; sessions_with_orders: bigint; conversion_rate: number }[]>`
      SELECT
        TO_CHAR(ts."startedAt", 'YYYY-MM-DD') AS date,
        COUNT(ts.id) AS scans,
        COUNT(DISTINCT ts."tableId") AS unique_tables,
        COUNT(DISTINCT CASE WHEN sub.has_order THEN ts.id END) AS sessions_with_orders,
        CASE WHEN COUNT(ts.id) > 0
          THEN ROUND(COUNT(DISTINCT CASE WHEN sub.has_order THEN ts.id END)::numeric / COUNT(ts.id) * 100, 1)
          ELSE 0
        END AS conversion_rate
      FROM "TableSession" ts
      LEFT JOIN LATERAL (
        SELECT EXISTS(SELECT 1 FROM "Order" o WHERE o."sessionId" = ts.id AND o.status NOT IN ('CANCELLED')) AS has_order
      ) sub ON true
      WHERE ts."restaurantId" = ${restaurantId}
        AND ts."startedAt" BETWEEN ${startDate} AND ${endDate}
        ${branchFilter}
      GROUP BY TO_CHAR(ts."startedAt", 'YYYY-MM-DD')
      ORDER BY date ASC
    `;
  },

  /* ─── QR Scan → Order Conversion Report ─── */
  async qrConversion(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (ts."branchId" = ${branchId} OR ts."branchId" IS NULL)` : Prisma.empty;

    const rows = await prisma.$queryRaw<{ total_scans: bigint; scans_with_orders: bigint; total_orders: bigint; total_revenue: number; avg_time_to_order_min: number }[]>`
      SELECT
        COUNT(ts.id) AS total_scans,
        COUNT(DISTINCT CASE WHEN sub.order_count > 0 THEN ts.id END) AS scans_with_orders,
        COALESCE(SUM(sub.order_count), 0) AS total_orders,
        COALESCE(SUM(sub.revenue), 0) AS total_revenue,
        COALESCE(AVG(CASE WHEN sub.first_order_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (sub.first_order_at - ts."startedAt")) / 60
        END), 0) AS avg_time_to_order_min
      FROM "TableSession" ts
      LEFT JOIN LATERAL (
        SELECT
          COUNT(o.id) AS order_count,
          SUM(o."total"::numeric) AS revenue,
          MIN(o."createdAt") AS first_order_at
        FROM "Order" o
        WHERE o."sessionId" = ts.id AND o.status NOT IN ('CANCELLED')
      ) sub ON true
      WHERE ts."restaurantId" = ${restaurantId}
        AND ts."startedAt" BETWEEN ${startDate} AND ${endDate}
        ${branchFilter}
    `;
    return rows[0] ?? { total_scans: 0, scans_with_orders: 0, total_orders: 0, total_revenue: 0, avg_time_to_order_min: 0 };
  },

  /* ─── Table QR Performance Report ─── */
  async tableQrPerformance(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (ts."branchId" = ${branchId} OR ts."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ tableId: string; tableName: string; scans: bigint; orders: bigint; conversion_rate: number; revenue: number; avg_order_value: number }[]>`
      SELECT
        t.id AS "tableId",
        COALESCE(t.name, t.number) AS "tableName",
        COUNT(ts.id) AS scans,
        COALESCE(SUM(sub.order_count), 0) AS orders,
        CASE WHEN COUNT(ts.id) > 0
          THEN ROUND(COUNT(DISTINCT CASE WHEN sub.order_count > 0 THEN ts.id END)::numeric / COUNT(ts.id) * 100, 1)
          ELSE 0
        END AS conversion_rate,
        COALESCE(SUM(sub.revenue), 0) AS revenue,
        CASE WHEN COALESCE(SUM(sub.order_count), 0) > 0
          THEN ROUND(COALESCE(SUM(sub.revenue), 0) / SUM(sub.order_count), 2)
          ELSE 0
        END AS avg_order_value
      FROM "Table" t
      LEFT JOIN "TableSession" ts ON ts."tableId" = t.id
        AND ts."startedAt" BETWEEN ${startDate} AND ${endDate}
        AND ts."restaurantId" = ${restaurantId}
        ${branchFilter}
      LEFT JOIN LATERAL (
        SELECT
          COUNT(o.id) AS order_count,
          SUM(o."total"::numeric) AS revenue
        FROM "Order" o
        WHERE o."sessionId" = ts.id AND o.status NOT IN ('CANCELLED')
      ) sub ON true
      WHERE t."restaurantId" = ${restaurantId}
        ${branchId ? Prisma.sql`AND (t."branchId" = ${branchId} OR t."branchId" IS NULL)` : Prisma.empty}
      GROUP BY t.id, t.name, t.number
      ORDER BY scans DESC
    `;
  },

  /* ─── Peak Hours Report ─── */
  async peakHoursReport(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ hour: number; avg_orders: number; avg_revenue: number; total_orders: bigint; total_revenue: number }[]>`
      SELECT
        EXTRACT(HOUR FROM (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS hour,
        ROUND(COUNT(o.id)::numeric / GREATEST(COUNT(DISTINCT TO_CHAR((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')), 1), 1) AS avg_orders,
        ROUND(SUM(o."total"::numeric) / GREATEST(COUNT(DISTINCT TO_CHAR((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')), 1), 2) AS avg_revenue,
        COUNT(o.id) AS total_orders,
        SUM(o."total"::numeric) AS total_revenue
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
        AND o.status NOT IN ('CANCELLED')
        ${branchFilter}
      GROUP BY EXTRACT(HOUR FROM (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
      ORDER BY hour ASC
    `;
  },

  /* ─── Menu Performance Report ─── */
  async menuPerformance(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;
    const miBranchFilter = branchId ? Prisma.sql`AND (mi."branchId" = ${branchId} OR mi."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ categoryName: string; total_items: bigint; available_items: bigint; avg_price: number; items_sold: bigint; revenue: number; avg_rating: number }[]>`
      SELECT
        c.name AS "categoryName",
        COUNT(DISTINCT mi.id) AS total_items,
        COUNT(DISTINCT CASE WHEN mi."isAvailable" THEN mi.id END) AS available_items,
        ROUND(AVG(mi.price::numeric), 2) AS avg_price,
        COALESCE(SUM(sales.quantity), 0) AS items_sold,
        COALESCE(SUM(sales.revenue), 0) AS revenue,
        COALESCE(fb.avg_rating, 0) AS avg_rating
      FROM "Category" c
      JOIN "MenuItem" mi ON mi."categoryId" = c.id AND mi."isActive" = true ${miBranchFilter}
      LEFT JOIN LATERAL (
        SELECT
          SUM(oi.quantity) AS quantity,
          SUM(oi."totalPrice"::numeric) AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE oi."menuItemId" = mi.id
          AND o."restaurantId" = ${restaurantId}
          AND o."createdAt" BETWEEN ${startDate} AND ${endDate}
          AND o.status NOT IN ('CANCELLED')
          ${branchFilter}
      ) sales ON true
      LEFT JOIN LATERAL (
        SELECT AVG(f."overallRating"::numeric) AS avg_rating
        FROM "Feedback" f
        JOIN "Order" o2 ON o2.id = f."orderId"
        WHERE o2."restaurantId" = ${restaurantId}
          AND o2."createdAt" BETWEEN ${startDate} AND ${endDate}
      ) fb ON true
      WHERE c."restaurantId" = ${restaurantId}
        ${branchId ? Prisma.sql`AND (c."branchId" = ${branchId} OR c."branchId" IS NULL)` : Prisma.empty}
        AND c."isActive" = true
      GROUP BY c.name, fb.avg_rating
      ORDER BY revenue DESC
    `;
  },

  /* ─── Orders Summary (total orders, avg/day, avg value, completion rate) ─── */
  async ordersSummary(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*)::bigint AS total_orders,
        COUNT(*) FILTER (WHERE o.status::text = 'COMPLETED')::bigint AS completed_orders,
        COUNT(*) FILTER (WHERE o.status::text = 'CANCELLED')::bigint AS cancelled_orders,
        COUNT(*) FILTER (WHERE o.status::text NOT IN ('COMPLETED', 'CANCELLED'))::bigint AS active_orders,
        COALESCE(SUM(o.total) FILTER (WHERE o.status::text != 'CANCELLED'), 0)::float AS total_revenue,
        COALESCE(AVG(o.total) FILTER (WHERE o.status::text != 'CANCELLED'), 0)::float AS avg_order_value,
        EXTRACT(DAY FROM (${endDate}::timestamp - ${startDate}::timestamp)) + 1 AS total_days
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        ${branchFilter}
    `;
    const r = rows[0] ?? {};
    const totalDays = Number(r.total_days) || 1;
    const totalOrders = Number(r.total_orders) || 0;
    return {
      total_orders: totalOrders,
      completed_orders: Number(r.completed_orders) || 0,
      cancelled_orders: Number(r.cancelled_orders) || 0,
      active_orders: Number(r.active_orders) || 0,
      total_revenue: Number(r.total_revenue) || 0,
      avg_order_value: Number(r.avg_order_value) || 0,
      avg_orders_per_day: totalDays > 0 ? Math.round((totalOrders / totalDays) * 10) / 10 : 0,
      completion_rate: totalOrders > 0 ? Math.round((Number(r.completed_orders) / totalOrders) * 1000) / 10 : 0,
      cancellation_rate: totalOrders > 0 ? Math.round((Number(r.cancelled_orders) / totalOrders) * 1000) / 10 : 0,
    };
  },

  /* ─── Order Type Breakdown (DINE_IN, TAKEAWAY, QSR) ─── */
  async orderTypeBreakdown(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ order_type: string; count: bigint; revenue: number; avg_order_value: number }[]>`
      SELECT
        COALESCE(o."orderType", 'DINE_IN') AS order_type,
        COUNT(*)::bigint AS count,
        COALESCE(SUM(o.total), 0)::float AS revenue,
        COALESCE(AVG(o.total), 0)::float AS avg_order_value
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status::text != 'CANCELLED'
        ${branchFilter}
      GROUP BY order_type
      ORDER BY count DESC
    `;
  },

  /* ─── Order Completion Rate (status breakdown with percentages) ─── */
  async orderCompletionRate(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    const rows = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT
        o.status,
        COUNT(*)::bigint AS count
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        ${branchFilter}
      GROUP BY o.status
      ORDER BY count DESC
    `;
    const total = rows.reduce((s, r) => s + Number(r.count), 0);
    return rows.map(r => ({
      status: r.status,
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
    }));
  },

  /* ─── Avg Order Value Trend (daily) ─── */
  async avgOrderValueTrend(restaurantId: string, startDate: Date, endDate: Date, branchId?: string) {
    const branchFilter = branchId ? Prisma.sql`AND (o."branchId" = ${branchId} OR o."branchId" IS NULL)` : Prisma.empty;

    return prisma.$queryRaw<{ date: string; avg_order_value: number; orders: bigint; revenue: number }[]>`
      SELECT
        TO_CHAR((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
        COALESCE(AVG(o.total), 0)::float AS avg_order_value,
        COUNT(*)::bigint AS orders,
        COALESCE(SUM(o.total), 0)::float AS revenue
      FROM "Order" o
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${endDate}
        AND o.status::text != 'CANCELLED'
        ${branchFilter}
      GROUP BY date
      ORDER BY date
    `;
  },
};
