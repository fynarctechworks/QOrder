import { Router } from 'express';
import { tableController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/validate.js';
import { 
  createTableSchema, 
  updateTableSchema,
  bulkCreateTablesSchema,
  idParamSchema,
} from '../validators/index.js';

const router = Router();

// All routes require authentication + branch context
router.use(authenticate);
router.use(resolveBranch);

router.get('/', tableController.getTables);

router.get('/stats', tableController.getTableStats);

router.get('/running', tableController.getRunningTables);

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  tableController.getTableById
);

router.get(
  '/:id/orders',
  validate(idParamSchema, 'params'),
  tableController.getTableOrders
);

router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(createTableSchema),
  tableController.createTable
);

router.post(
  '/bulk',
  authorize('OWNER', 'ADMIN'),
  validate(bulkCreateTablesSchema),
  tableController.createBulkTables
);

router.post(
  '/sync-statuses',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  tableController.syncTableStatuses
);

router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  validate(updateTableSchema),
  tableController.updateTable
);

router.patch(
  '/:id/status',
  authorize('OWNER', 'ADMIN', 'MANAGER', 'STAFF'),
  validate(idParamSchema, 'params'),
  tableController.updateTableStatus
);

router.delete(
  '/:id',
  authorize('OWNER', 'ADMIN'),
  validate(idParamSchema, 'params'),
  tableController.deleteTable
);

router.post(
  '/:id/regenerate-qr',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  tableController.regenerateQRCode
);

router.post(
  '/:id/regenerate-session',
  authorize('OWNER', 'ADMIN', 'MANAGER', 'STAFF'),
  validate(idParamSchema, 'params'),
  tableController.regenerateSessionToken
);

export default router;
