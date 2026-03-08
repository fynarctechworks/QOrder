import { Router } from 'express';
import { sessionController } from '../controllers/index.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/index.js';
import { addPaymentSchema, transferSessionSchema, mergeSessionsSchema, idParamSchema } from '../validators/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(resolveBranch);

// Get or create session for a table
router.get(
  '/table/:tableId',
  (req, res, next) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(req.params.tableId ?? '')) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid table ID format' } });
    }
    next();
  },
  sessionController.getOrCreateSession
);

// Get session by ID
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  sessionController.getSession
);

// Add split payment
router.post(
  '/:id/split-payment',
  validate(idParamSchema, 'params'),
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(addPaymentSchema),
  sessionController.addPayment
);

// Transfer session to another table
router.post(
  '/:id/transfer',
  validate(idParamSchema, 'params'),
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(transferSessionSchema),
  sessionController.transferSession
);

// Merge two sessions
router.post(
  '/merge',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  validate(mergeSessionsSchema),
  sessionController.mergeSessions
);

// Get print-ready invoice
router.get(
  '/:id/print',
  validate(idParamSchema, 'params'),
  sessionController.getPrintInvoice
);

// Send bill via WhatsApp
router.post(
  '/:id/whatsapp-bill',
  validate(idParamSchema, 'params'),
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  sessionController.sendWhatsAppBill
);

export default router;
