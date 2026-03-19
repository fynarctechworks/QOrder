import { Router } from 'express';
import { reportController } from '../controllers/reportController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';

const router = Router();

router.use(authenticate, resolveBranch);

// All report routes require OWNER/ADMIN/MANAGER
const auth = authorize('OWNER', 'ADMIN', 'MANAGER');

router.get('/hourly-sales', auth, reportController.hourlySales);
router.get('/daily-sales', auth, reportController.dailySales);
router.get('/weekly-sales', auth, reportController.weeklySales);
router.get('/monthly-sales', auth, reportController.monthlySales);
router.get('/category-performance', auth, reportController.categoryPerformance);
router.get('/item-performance', auth, reportController.itemPerformance);
router.get('/payment-breakdown', auth, reportController.paymentBreakdown);
router.get('/discount-report', auth, reportController.discountReport);
router.get('/table-utilization', auth, reportController.tableUtilization);
router.get('/feedback-summary', auth, reportController.feedbackSummary);
router.get('/revenue-comparison', auth, reportController.revenueComparison);
router.get('/inventory-consumption', auth, reportController.inventoryConsumption);
router.get('/peak-day-analysis', auth, reportController.peakDayAnalysis);
router.get('/order-status', auth, reportController.orderStatusBreakdown);
router.get('/avg-prep-time', auth, reportController.avgPrepTime);

// Inventory vs Sales reports
router.get('/cogs', auth, reportController.cogsReport);
router.get('/inventory-vs-revenue', auth, reportController.inventoryVsRevenue);
router.get('/stock-forecast', auth, reportController.stockForecast);
router.get('/wastage-variance', auth, reportController.wastageVariance);
router.get('/top-profitable-items', auth, reportController.topProfitableItems);

// New reports
router.get('/sales-summary', auth, reportController.salesSummary);
router.get('/orders-report', auth, reportController.ordersReport);
router.get('/cancelled-orders', auth, reportController.cancelledOrders);
router.get('/top-selling-items', reportController.topSellingItems);
router.get('/low-performing-items', auth, reportController.lowPerformingItems);
router.get('/table-activity', auth, reportController.tableActivity);
router.get('/tax-report', auth, reportController.taxReport);
router.get('/customer-report', auth, reportController.customerReport);
router.get('/repeat-customers', auth, reportController.repeatCustomers);
router.get('/qr-scan-report', auth, reportController.qrScanReport);
router.get('/qr-conversion', auth, reportController.qrConversion);
router.get('/table-qr-performance', auth, reportController.tableQrPerformance);
router.get('/peak-hours', auth, reportController.peakHoursReport);
router.get('/menu-performance', auth, reportController.menuPerformance);

// Order analysis reports
router.get('/orders-summary', auth, reportController.ordersSummary);
router.get('/order-type-breakdown', auth, reportController.orderTypeBreakdown);
router.get('/order-completion-rate', auth, reportController.orderCompletionRate);
router.get('/avg-order-value-trend', auth, reportController.avgOrderValueTrend);

export default router;
