import { Router, Request, Response, NextFunction } from 'express';
import { restaurantController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/validate.js';
import { updateRestaurantSchema, updateRestaurantSettingsSchema } from '../validators/index.js';
import { printService } from '../services/printService.js';
import { restaurantService } from '../services/index.js';
import { prisma, AppError } from '../lib/index.js';
import { pinLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', restaurantController.getRestaurant);

router.get('/dashboard', resolveBranch, restaurantController.getDashboardStats);

router.get(
  '/users',
  authorize('OWNER', 'ADMIN'),
  restaurantController.getUsers
);

router.patch(
  '/',
  authorize('OWNER', 'ADMIN'),
  validate(updateRestaurantSchema),
  restaurantController.updateRestaurant
);

router.patch(
  '/settings',
  authorize('OWNER', 'ADMIN'),
  validate(updateRestaurantSettingsSchema),
  restaurantController.updateSettings
);

// PIN verification endpoint (rate-limited)
router.post(
  '/verify-pin',
  pinLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.restaurantId!;
      const { pin } = req.body as { pin?: string };

      if (!pin || !/^\d{6}$/.test(pin)) {
        throw AppError.badRequest('PIN must be a 6-digit number');
      }

      const isValid = await restaurantService.verifyPin(restaurantId, pin);

      if (!isValid) {
        throw AppError.forbidden('Incorrect PIN');
      }

      res.json({ success: true, data: { verified: true } });
    } catch (error) {
      next(error);
    }
  }
);

// Printer test endpoint
router.post(
  '/printer/test',
  authorize('OWNER', 'ADMIN'),
  async (req, res, next) => {
    try {
      const restaurantId = req.restaurantId!;
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { settings: true },
      });
      const settings = (restaurant?.settings as Record<string, unknown>) || {};
      const config = printService.getPrinterConfig(settings);

      // Allow override from body for testing before saving
      if (req.body.printerIp) config.printerIp = req.body.printerIp;
      if (req.body.printerPort) config.printerPort = req.body.printerPort;
      if (req.body.printerType) config.printerType = req.body.printerType;
      if (req.body.printerWidth) config.printerWidth = req.body.printerWidth;

      const result = await printService.testConnection(config);
      res.json({ success: result.success, data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
