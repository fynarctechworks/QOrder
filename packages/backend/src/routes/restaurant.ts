import { Router } from 'express';
import { restaurantController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { updateRestaurantSchema, updateRestaurantSettingsSchema } from '../validators/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', restaurantController.getRestaurant);

router.get('/dashboard', restaurantController.getDashboardStats);

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

export default router;
