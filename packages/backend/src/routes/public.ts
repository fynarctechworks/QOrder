import { Router, Request, Response, NextFunction } from 'express';
import { menuController, orderController, restaurantController, tableController, groupOrderController } from '../controllers/index.js';
import { discountController } from '../controllers/discountController.js';
import { serviceRequestController } from '../controllers/serviceRequestController.js';
import { feedbackController } from '../controllers/feedbackController.js';
import { receiptController } from '../controllers/receiptController.js';
import { otpController } from '../controllers/otpController.js';
import { validate } from '../middlewares/validate.js';
import { orderLimiter, otpLimiter, couponLimiter, apiLimiter } from '../middlewares/rateLimiter.js';
import { resolveRestaurant } from '../middlewares/resolveRestaurant.js';
import { validateGeoFence } from '../middlewares/geoValidation.js';
import { tableRateLimiter } from '../middlewares/tableRateLimiter.js';
import { idempotency } from '../middlewares/idempotency.js';
import { prisma } from '../lib/index.js';
import { 
  createOrderSchema, 
  restaurantSlugSchema,
  idParamSchema,
  createGroupOrderSchema,
  joinGroupSchema,
  addGroupCartItemSchema,
  updateGroupCartItemSchema,
  groupParticipantActionSchema,
} from '../validators/index.js';

const router = Router();

// Middleware to verify restaurant is active for ID-based routes
const verifyActiveRestaurant = async (req: Request, res: Response, next: NextFunction) => {
  const restaurantId = req.params.id;
  if (!restaurantId) return next();
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { isActive: true },
    });
    if (!restaurant) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Restaurant not found' } });
    }
    if (!restaurant.isActive) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Restaurant is not active' } });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Public restaurant info
router.get(
  '/r/:slug',
  validate(restaurantSlugSchema, 'params'),
  restaurantController.getPublicRestaurant
);

// Alternative route for customer app compatibility
router.get(
  '/slug/:slug',
  validate(restaurantSlugSchema, 'params'),
  restaurantController.getPublicRestaurant
);

// Get table by QR code (for initial scan) - must be before /:id routes
router.get(
  '/tables/qr/:qrCode',
  apiLimiter,
  tableController.getTableByQRCode
);

// ── Phone OTP verification (customer-facing) ──
// Only rate-limit /otp/send when OTP verification is actually enabled;
// otherwise the rate limiter fires on phone-save requests that never send an OTP.
const conditionalOtpLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantId, tableId } = req.body as { restaurantId?: string; tableId?: string };
    if (restaurantId) {
      const [restaurant, table] = await Promise.all([
        prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { settings: true } }),
        tableId ? prisma.table.findUnique({ where: { id: tableId }, select: { branchId: true } }) : null,
      ]);
      const rSettings = (restaurant?.settings as Record<string, unknown>) ?? {};

      // Check branch-level override first, then restaurant-level
      if (table?.branchId) {
        const branch = await prisma.branch.findUnique({ where: { id: table.branchId }, select: { settings: true } });
        const bSettings = (branch?.settings as Record<string, unknown>) ?? {};
        if (typeof bSettings.requirePhoneVerification === 'boolean') {
          if (!bSettings.requirePhoneVerification) return next(); // Skip limiter
          return otpLimiter(req, res, next);
        }
      }

      if (rSettings.requirePhoneVerification === false) return next(); // Skip limiter
    }
  } catch { /* fall through to rate limiter on error */ }
  return otpLimiter(req, res, next);
};

router.post('/otp/send', conditionalOtpLimiter, otpController.sendOtp);
router.post('/otp/verify', otpLimiter, otpController.verifyOtp);
router.get('/:restaurantId/tables/:tableId/phone-status', otpController.getPhoneStatus);

// Get restaurant categories (for customer app) - specific routes before generic /:id
router.get(
  '/:id/categories',
  validate(idParamSchema, 'params'),
  verifyActiveRestaurant,
  menuController.getCategoriesByRestaurant
);

// Get menu items by category (for customer app)
router.get(
  '/:id/categories/:categoryId/items',
  menuController.getMenuItemsByCategory
);

// Get restaurant menu items (for customer app)
router.get(
  '/:id/menu',
  validate(idParamSchema, 'params'),
  verifyActiveRestaurant,
  menuController.getMenuByRestaurant
);

// Get single menu item (for customer app)
router.get(
  '/:id/menu/:itemId',
  verifyActiveRestaurant,
  menuController.getMenuItem
);

// Get table info (for customer app)
router.get(
  '/:id/tables/:tableId',
  verifyActiveRestaurant,
  tableController.getPublicTable
);

// Get restaurant by ID (for customer app) - must be last among /:id routes
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  verifyActiveRestaurant,
  restaurantController.getById
);

// Create order (customer)
router.post(
  '/r/:slug/orders',
  validate(restaurantSlugSchema, 'params'),
  resolveRestaurant,
  orderLimiter,
  validate(createOrderSchema),
  tableRateLimiter(),
  validateGeoFence,
  idempotency,
  orderController.createOrder
);

// Get orders for a table (customer)
router.get(
  '/tables/:tableId/orders',
  (req: Request, res: Response, next: NextFunction) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(req.params.tableId ?? '')) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid table ID format' } });
    }
    next();
  },
  orderController.getPublicTableOrders
);

// Track order status (customer)
router.get(
  '/orders/:id/status',
  validate(idParamSchema, 'params'),
  orderController.getPublicOrderStatus
);

// Cancel order (customer – only allowed while still PENDING)
// Requires tableId query param to validate the order belongs to the requester's table
router.patch(
  '/orders/:id/cancel',
  validate(idParamSchema, 'params'),
  orderLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tableId } = req.query as { tableId?: string };
      if (!tableId) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'tableId query parameter is required' },
        });
      }
      // Verify the order belongs to the claimed table
      const order = await prisma.order.findFirst({
        where: { id: req.params.id, tableId },
        select: { id: true },
      });
      if (!order) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Order not found for this table' },
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  },
  orderController.cancelOrder
);

// ==================== GROUP ORDERS ====================

// Create group order
router.post(
  '/group',
  orderLimiter,
  validate(createGroupOrderSchema),
  // Geo-fence: resolve restaurant from body.restaurantId and validate
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { restaurantId } = req.body;
      if (restaurantId) {
        (req as any).restaurantId = restaurantId;
      }
      next();
    } catch (err) { next(err); }
  },
  tableRateLimiter(),
  validateGeoFence,
  groupOrderController.create
);

// Get group order by code
router.get('/group/:code', groupOrderController.getByCode);

// Join group order
router.post(
  '/group/:code/join',
  validate(joinGroupSchema),
  // Geo-fence: resolve restaurant from the group order
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const group = await prisma.groupOrder.findUnique({
        where: { code: req.params.code!.toUpperCase() },
        select: { restaurantId: true },
      });
      if (group) {
        (req as any).restaurantId = group.restaurantId;
      }
      next();
    } catch (err) { next(err); }
  },
  validateGeoFence,
  groupOrderController.join
);

// Add item to participant's cart
router.post(
  '/group/:code/participants/:participantId/cart',
  validate(addGroupCartItemSchema),
  groupOrderController.addCartItem
);

// Update cart item
router.patch(
  '/group/:code/participants/:participantId/cart/:itemId',
  validate(updateGroupCartItemSchema),
  groupOrderController.updateCartItem
);

// Remove cart item
router.delete(
  '/group/:code/participants/:participantId/cart/:itemId',
  groupOrderController.removeCartItem
);

// Mark participant ready
router.post(
  '/group/:code/participants/:participantId/ready',
  groupOrderController.markReady
);

// Submit group order (host only)
router.post(
  '/group/:code/submit',
  orderLimiter,
  validate(groupParticipantActionSchema),
  // Geo-fence: resolve restaurant (and tableId for rate-limiting) from the group order
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const group = await prisma.groupOrder.findUnique({
        where: { code: req.params.code!.toUpperCase() },
        select: { restaurantId: true, tableId: true },
      });
      if (group) {
        (req as any).restaurantId = group.restaurantId;
        if (group.tableId) {
          req.body.tableId = group.tableId;
        }
      }
      next();
    } catch (err) { next(err); }
  },
  tableRateLimiter(),
  validateGeoFence,
  groupOrderController.submit
);

// Cancel group order (host only)
router.post(
  '/group/:code/cancel',
  validate(groupParticipantActionSchema),
  groupOrderController.cancel
);

// ─── Discounts: Validate coupon ───
router.post('/:restaurantId/discounts/validate-coupon', couponLimiter, discountController.validateCoupon);
router.get('/:restaurantId/discounts/auto-apply', apiLimiter, discountController.getAutoApply);

// ─── TV Menu Slides: Customer display ───
router.get('/:restaurantId/tv-slides', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantId } = req.params;
    const branchId = req.query.branchId as string | undefined;

    const where: Record<string, unknown> = { restaurantId, isActive: true };
    if (branchId) {
      where.OR = [{ branchId }, { branchId: null }];
    }

    const slides = await prisma.tVMenuSlide.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      select: { id: true, imageUrl: true, sortOrder: true },
    });

    res.json({ success: true, data: slides });
  } catch (error) {
    next(error);
  }
});

// ─── Service Requests: Customer creates ───
router.post('/:restaurantId/service-requests', serviceRequestController.create);

// ─── Feedback: Customer submits ───
router.post('/:restaurantId/feedback', feedbackController.create);

// ─── Receipt: Customer requests e-bill ───
router.post('/orders/:orderId/receipt', receiptController.send);

// ─── Queue Display: Public endpoint for TV/display showing active orders ───
router.get('/:restaurantId/queue', apiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantId } = req.params;
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['PENDING', 'PREPARING', 'READY'] },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        customerName: true,
        createdAt: true,
        updatedAt: true,
        estimatedTime: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, coverImage: true },
    });

    res.json({ success: true, data: { restaurant, orders } });
  } catch (err) { next(err); }
});

export default router;
