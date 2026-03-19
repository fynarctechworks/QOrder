import { Router } from 'express';
import { orderController } from '../controllers/index.js';
import { dashboardService } from '../services/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/validate.js';
import { orderLimiter } from '../middlewares/rateLimiter.js';
import { 
  createOrderSchema, 
  updateOrderStatusSchema,
  orderQuerySchema,
  idParamSchema,
} from '../validators/index.js';

const router = Router();

// Protected routes (admin)
router.get(
  '/',
  authenticate,
  resolveBranch,
  validate(orderQuerySchema, 'query'),
  orderController.getOrders
);

router.get(
  '/active',
  authenticate,
  resolveBranch,
  orderController.getActiveOrders
);

router.get(
  '/stats',
  authenticate,
  resolveBranch,
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  orderController.getOrderStats
);

router.get(
  '/analytics',
  authenticate,
  resolveBranch,
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  orderController.getAnalytics
);

router.get(
  '/analytics/advanced',
  authenticate,
  resolveBranch,
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  orderController.getAdvancedAnalytics
);

router.get(
  '/analytics/dashboard-extras',
  authenticate,
  resolveBranch,
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  async (req, res, next) => {
    try {
      const data = await dashboardService.getExtras(req.restaurantId!, req.branchId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/export/csv',
  authenticate,
  resolveBranch,
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  orderController.exportCsv
);

router.get(
  '/:id',
  authenticate,
  validate(idParamSchema, 'params'),
  orderController.getOrderById
);

router.patch(
  '/:id/status',
  authenticate,
  validate(idParamSchema, 'params'),
  validate(updateOrderStatusSchema),
  orderController.updateOrderStatus
);

router.patch(
  '/:id/kitchen-ready',
  authenticate,
  validate(idParamSchema, 'params'),
  orderController.markKitchenReady
);

router.patch(
  '/:id/items/:itemId/kitchen-ready',
  authenticate,
  orderController.markItemKitchenReady
);

router.patch(
  '/:id/cancel',
  authenticate,
  validate(idParamSchema, 'params'),
  orderController.cancelOrder
);

router.patch(
  '/:id/settle',
  authenticate,
  resolveBranch,
  validate(idParamSchema, 'params'),
  orderController.settleUnpaidOrder
);

// Customer order creation (requires restaurant context from public route)
// Validate that restaurantId is set on the request (set by resolveRestaurant middleware in public routes)
router.post(
  '/',
  orderLimiter,
  validate(createOrderSchema),
  (req, res, next) => {
    if (!req.restaurantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Restaurant context is required' },
      });
    }
    next();
  },
  orderController.createOrder
);

// Cashier/admin order creation (authenticated) — goes straight to PREPARING
router.post(
  '/cashier',
  authenticate,
  resolveBranch,
  validate(createOrderSchema),
  orderController.createCashierOrder
);

// QSR order creation (authenticated) — pre-paid, goes straight to COMPLETED
router.post(
  '/qsr',
  authenticate,
  resolveBranch,
  validate(createOrderSchema),
  orderController.createQSROrder
);

// Manually send WhatsApp bill for takeaway/QSR orders
router.post(
  '/:orderIds/whatsapp-bill',
  authenticate,
  authorize('OWNER', 'ADMIN', 'MANAGER', 'CASHIER'),
  orderController.sendWhatsAppBill
);

export default router;
