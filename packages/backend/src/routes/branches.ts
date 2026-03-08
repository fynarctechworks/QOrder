import { Router } from 'express';
import { branchController } from '../controllers/branchController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createBranchSchema,
  updateBranchSchema,
  branchUserAssignSchema,
  idParamSchema,
} from '../validators/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get branches assigned to me (must be above /:id to avoid collision)
router.get('/my', branchController.getMyBranches);

// List all branches
router.get('/', branchController.getBranches);

// Get a single branch
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  branchController.getBranchById
);

// Create a branch (OWNER/ADMIN only)
router.post(
  '/',
  authorize('OWNER', 'ADMIN'),
  validate(createBranchSchema),
  branchController.createBranch
);

// Update a branch (OWNER/ADMIN only)
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateBranchSchema),
  branchController.updateBranch
);

// Delete a branch (OWNER only)
router.delete(
  '/:id',
  authorize('OWNER'),
  validate(idParamSchema, 'params'),
  branchController.deleteBranch
);

// Assign users to a branch
router.post(
  '/:id/users',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  validate(branchUserAssignSchema),
  branchController.assignUsers
);

// Remove users from a branch
router.delete(
  '/:id/users',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  validate(branchUserAssignSchema),
  branchController.removeUsers
);

// Get branch settings (merged with restaurant defaults)
router.get(
  '/:id/settings',
  validate(idParamSchema, 'params'),
  branchController.getSettings
);

// Update branch-level settings
router.patch(
  '/:id/settings',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  branchController.updateSettings
);

export default router;
