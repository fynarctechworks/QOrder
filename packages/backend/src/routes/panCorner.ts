import { Router } from 'express';
import { panCornerController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createPanCornerCategorySchema,
  updatePanCornerCategorySchema,
  createPanCornerItemSchema,
  updatePanCornerItemSchema,
  idParamSchema,
} from '../validators/index.js';

const router = Router();

router.use(authenticate);

// ==================== CATEGORIES ====================

router.get('/categories', panCornerController.getCategories);

router.get(
  '/categories/:id',
  validate(idParamSchema, 'params'),
  panCornerController.getCategoryById
);

router.post(
  '/categories',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(createPanCornerCategorySchema),
  panCornerController.createCategory
);

router.patch(
  '/categories/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  validate(updatePanCornerCategorySchema),
  panCornerController.updateCategory
);

router.delete(
  '/categories/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  panCornerController.deleteCategory
);

// ==================== ITEMS ====================

router.get('/items', panCornerController.getItems);

router.get(
  '/items/:id',
  validate(idParamSchema, 'params'),
  panCornerController.getItemById
);

router.post(
  '/items',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(createPanCornerItemSchema),
  panCornerController.createItem
);

router.patch(
  '/items/:id/availability',
  authorize('OWNER', 'ADMIN', 'MANAGER', 'STAFF'),
  validate(idParamSchema, 'params'),
  panCornerController.toggleAvailability
);

router.patch(
  '/items/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  validate(updatePanCornerItemSchema),
  panCornerController.updateItem
);

router.delete(
  '/items/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  panCornerController.deleteItem
);

// ==================== CHECKOUT ====================

router.post(
  '/checkout',
  authorize('OWNER', 'ADMIN', 'MANAGER', 'STAFF'),
  panCornerController.checkout
);

export default router;
