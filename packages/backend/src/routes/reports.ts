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

export default router;
