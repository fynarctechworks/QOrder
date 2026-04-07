import type { Request, Response, NextFunction } from 'express';
import { reportService } from '../services/reportService.js';

const MAX_DATE_RANGE_DAYS = 3650;

function parseDateRange(query: Record<string, unknown>) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const now = new Date();
  const branchId = query.branchId as string | undefined;

  // Parse "YYYY-MM-DD" as IST start-of-day → UTC. Falls back to native Date parsing for ISO strings.
  const parseISTDate = (s: string, endOfDay = false): Date => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const [, y, mo, d] = m;
      const istMs = Date.UTC(Number(y), Number(mo) - 1, Number(d));
      const utcMs = istMs - IST_OFFSET_MS;
      return new Date(endOfDay ? utcMs + 24 * 60 * 60 * 1000 - 1 : utcMs);
    }
    const dt = new Date(s);
    if (endOfDay) dt.setUTCHours(23, 59, 59, 999);
    return dt;
  };

  const startDate = query.startDate
    ? parseISTDate(query.startDate as string, false)
    : (() => {
        const istNow = new Date(now.getTime() + IST_OFFSET_MS);
        const istMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
        return new Date(istMs - IST_OFFSET_MS);
      })();
  const endDate = query.endDate ? parseISTDate(query.endDate as string, true) : now;

  // Validate parsed dates
  if (isNaN(startDate.getTime())) throw Object.assign(new Error('Invalid startDate'), { status: 400 });
  if (isNaN(endDate.getTime())) throw Object.assign(new Error('Invalid endDate'), { status: 400 });

  if (startDate > endDate) throw Object.assign(new Error('startDate must be before endDate'), { status: 400 });

  // Cap range to prevent excessively large queries
  const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_DATE_RANGE_DAYS) throw Object.assign(new Error(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`), { status: 400 });

  return { startDate, endDate, branchId };
}

export const reportController = {
  async hourlySales(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.hourlySales(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },

  async dailySales(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.dailySales(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },

  async weeklySales(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.weeklySales(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },

  async monthlySales(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.monthlySales(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },

  async categoryPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.categoryPerformance(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, items_sold: Number(d.items_sold), order_count: Number(d.order_count) })) });
    } catch (err) { next(err); }
  },

  async itemPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const limit = Math.min(req.query.limit ? Number(req.query.limit) : 50, 200);
      const data = await reportService.itemPerformance(req.user!.restaurantId, startDate, endDate, limit, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, quantity: Number(d.quantity), order_count: Number(d.order_count) })) });
    } catch (err) { next(err); }
  },

  async paymentBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.paymentBreakdown(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, count: Number(d.count) })) });
    } catch (err) { next(err); }
  },

  async discountReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = parseDateRange(req.query);
      const data = await reportService.discountReport(req.user!.restaurantId, startDate, endDate);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, usageCount: Number(d.usageCount) })) });
    } catch (err) { next(err); }
  },

  async tableUtilization(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.tableUtilization(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, session_count: Number(d.session_count) })) });
    } catch (err) { next(err); }
  },

  async feedbackSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = parseDateRange(req.query);
      const data = await reportService.feedbackSummary(req.user!.restaurantId, startDate, endDate);
      res.json({ success: true, data: { ...data, averages: { ...data.averages, total: Number(data.averages.total) } } });
    } catch (err) { next(err); }
  },

  async revenueComparison(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.revenueComparison(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async inventoryConsumption(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = parseDateRange(req.query);
      const data = await reportService.inventoryConsumption(req.user!.restaurantId, startDate, endDate);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async peakDayAnalysis(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.peakDayAnalysis(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async orderStatusBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.orderStatusBreakdown(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ status: d.status, count: d._count._all })) });
    } catch (err) { next(err); }
  },

  async avgPrepTime(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.avgPrepTime(req.user!.restaurantId, startDate, endDate, branchId);
      const result = data[0] ?? { avg_prep_minutes: 0, total_orders: 0 };
      res.json({ success: true, data: { ...result, total_orders: Number(result.total_orders) } });
    } catch (err) { next(err); }
  },

  /* ═══ Inventory vs Sales Reports ═══ */

  async cogsReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.cogsReport(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, qty_sold: Number(d.qty_sold) })) });
    } catch (err) { next(err); }
  },

  async inventoryVsRevenue(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.inventoryVsRevenue(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async stockForecast(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = parseDateRange(req.query);
      const data = await reportService.stockForecast(req.user!.restaurantId, startDate, endDate);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async wastageVariance(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.wastageVariance(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async topProfitableItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const limit = Math.min(req.query.limit ? Number(req.query.limit) : 30, 200);
      const data = await reportService.topProfitableItems(req.user!.restaurantId, startDate, endDate, limit, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, qty_sold: Number(d.qty_sold) })) });
    } catch (err) { next(err); }
  },

  /* ═══ NEW REPORT HANDLERS ═══ */

  async salesSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.salesSummary(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: { ...data, total_orders: Number(data.total_orders), total_items_sold: Number(data.total_items_sold) } });
    } catch (err) { next(err); }
  },

  async ordersReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.ordersReport(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, items: Number(d.items) })) });
    } catch (err) { next(err); }
  },

  async cancelledOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.cancelledOrders(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, items: Number(d.items) })) });
    } catch (err) { next(err); }
  },

  async topSellingItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const limit = Math.min(req.query.limit ? Number(req.query.limit) : 50, 200);
      const data = await reportService.topSellingItems(req.user!.restaurantId, startDate, endDate, limit, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, quantity: Number(d.quantity), order_count: Number(d.order_count) })) });
    } catch (err) { next(err); }
  },

  async lowPerformingItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const limit = Math.min(req.query.limit ? Number(req.query.limit) : 50, 200);
      const data = await reportService.lowPerformingItems(req.user!.restaurantId, startDate, endDate, limit, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, quantity: Number(d.quantity), order_count: Number(d.order_count) })) });
    } catch (err) { next(err); }
  },

  async tableActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.tableActivity(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, sessions: Number(d.sessions), orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },

  async taxReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.taxReport(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },

  async customerReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = parseDateRange(req.query);
      const data = await reportService.customerReport(req.user!.restaurantId, startDate, endDate);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async repeatCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = parseDateRange(req.query);
      const data = await reportService.repeatCustomers(req.user!.restaurantId, startDate, endDate);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async qrScanReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.qrScanReport(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, scans: Number(d.scans), unique_tables: Number(d.unique_tables), sessions_with_orders: Number(d.sessions_with_orders) })) });
    } catch (err) { next(err); }
  },

  async qrConversion(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.qrConversion(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: { ...data, total_scans: Number(data.total_scans), scans_with_orders: Number(data.scans_with_orders), total_orders: Number(data.total_orders) } });
    } catch (err) { next(err); }
  },

  async tableQrPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.tableQrPerformance(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, scans: Number(d.scans), orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },

  async peakHoursReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.peakHoursReport(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, total_orders: Number(d.total_orders) })) });
    } catch (err) { next(err); }
  },

  async menuPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.menuPerformance(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, total_items: Number(d.total_items), available_items: Number(d.available_items), items_sold: Number(d.items_sold) })) });
    } catch (err) { next(err); }
  },

  async ordersSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.ordersSummary(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async orderTypeBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.orderTypeBreakdown(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, count: Number(d.count) })) });
    } catch (err) { next(err); }
  },

  async orderCompletionRate(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.orderCompletionRate(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async avgOrderValueTrend(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, branchId } = parseDateRange(req.query);
      const data = await reportService.avgOrderValueTrend(req.user!.restaurantId, startDate, endDate, branchId);
      res.json({ success: true, data: data.map((d: any) => ({ ...d, orders: Number(d.orders) })) });
    } catch (err) { next(err); }
  },
};
