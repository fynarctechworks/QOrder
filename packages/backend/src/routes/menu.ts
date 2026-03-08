import { Router } from 'express';
import { menuController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/validate.js';
import { 
  createCategorySchema, 
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  updateAvailabilitySchema,
  createModifierGroupSchema,
  menuItemQuerySchema,
  idParamSchema,
} from '../validators/index.js';

const router = Router();

// All routes require authentication and branch resolution
router.use(authenticate);
router.use(resolveBranch);

// ==================== CATEGORIES ====================

router.get('/categories', menuController.getCategories);

router.get(
  '/categories/:id',
  validate(idParamSchema, 'params'),
  menuController.getCategoryById
);

router.post(
  '/categories',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(createCategorySchema),
  menuController.createCategory
);

router.patch(
  '/categories/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  validate(updateCategorySchema),
  menuController.updateCategory
);

router.delete(
  '/categories/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  menuController.deleteCategory
);

// ==================== MENU ITEMS ====================

router.get('/items', validate(menuItemQuerySchema, 'query'), menuController.getMenuItems);

router.get(
  '/items/:id',
  validate(idParamSchema, 'params'),
  menuController.getMenuItemById
);

router.post(
  '/items',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(createMenuItemSchema),
  menuController.createMenuItem
);

// NOTE: /items/availability MUST be defined BEFORE /items/:id
// otherwise Express matches "availability" as an :id param
router.patch(
  '/items/availability',
  authorize('OWNER', 'ADMIN', 'MANAGER', 'STAFF'),
  validate(updateAvailabilitySchema),
  menuController.updateAvailability
);

router.patch(
  '/items/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  validate(updateMenuItemSchema),
  menuController.updateMenuItem
);

router.delete(
  '/items/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  menuController.deleteMenuItem
);

// ==================== MODIFIER GROUPS ====================

router.get('/modifier-groups', menuController.getModifierGroups);

router.post(
  '/modifier-groups',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(createModifierGroupSchema),
  menuController.createModifierGroup
);

router.delete(
  '/modifier-groups/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  menuController.deleteModifierGroup
);

export default router;
