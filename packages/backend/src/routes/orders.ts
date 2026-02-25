import { Router } from 'express';
import { orderController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
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
  validate(orderQuerySchema, 'query'),
  orderController.getOrders
);

router.get(
  '/active',
  authenticate,
  orderController.getActiveOrders
);

router.get(
  '/stats',
  authenticate,
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  orderController.getOrderStats
);

router.get(
  '/analytics',
  authenticate,
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  orderController.getAnalytics
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
  '/:id/cancel',
  authenticate,
  validate(idParamSchema, 'params'),
  orderController.cancelOrder
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
  validate(createOrderSchema),
  orderController.createCashierOrder
);

export default router;
