import { Router } from 'express';
import { sectionController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/validate.js';
import {
  createSectionSchema,
  updateSectionSchema,
  idParamSchema,
} from '../validators/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(resolveBranch);

// GET all sections
router.get('/', sectionController.getSections);

// GET section by id
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  sectionController.getSectionById
);

// CREATE section (OWNER, ADMIN, MANAGER)
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(createSectionSchema),
  sectionController.createSection
);

// UPDATE section (OWNER, ADMIN, MANAGER)
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(updateSectionSchema),
  sectionController.updateSection
);

// DELETE section (OWNER, ADMIN)
router.delete(
  '/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  sectionController.deleteSection
);

export default router;
