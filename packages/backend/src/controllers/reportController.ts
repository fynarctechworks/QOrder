import type { Request, Response, NextFunction } from 'express';
import { reportService } from '../services/reportService.js';

const MAX_DATE_RANGE_DAYS = 366;

function parseDateRange(query: Record<string, unknown>) {
  const now = new Date();
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = query.endDate ? new Date(query.endDate as string) : now;
  const branchId = query.branchId as string | undefined;

  // Validate parsed dates
  if (isNaN(startDate.getTime())) throw Object.assign(new Error('Invalid startDate'), { status: 400 });
  if (isNaN(endDate.getTime())) throw Object.assign(new Error('Invalid endDate'), { status: 400 });

  // Make endDate cover the full day (otherwise dates like '2026-03-05' resolve to midnight,
  // excluding all orders during that day)
  endDate.setUTCHours(23, 59, 59, 999);
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
};
