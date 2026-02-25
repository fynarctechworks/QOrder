import { Router, Request, Response, NextFunction } from 'express';
import { menuController, orderController, restaurantController, tableController } from '../controllers/index.js';
import { validate } from '../middlewares/validate.js';
import { orderLimiter } from '../middlewares/rateLimiter.js';
import { resolveRestaurant } from '../middlewares/resolveRestaurant.js';
import { prisma } from '../lib/index.js';
import { 
  createOrderSchema, 
  restaurantSlugSchema,
  idParamSchema,
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
  tableController.getTableByQRCode
);

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

export default router;
