import { Router } from 'express';
import { paymentGatewayController } from '../controllers/paymentGatewayController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Refund an online payment ───
router.post(
  '/:paymentId/refund',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  paymentGatewayController.refundPayment
);

export default router;
