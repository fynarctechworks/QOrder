import { Router } from 'express';
import { serviceRequestController } from '../controllers/serviceRequestController.js';
import { feedbackController } from '../controllers/feedbackController.js';
import { receiptController } from '../controllers/receiptController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/index.js';

const router = Router();

// ─── Service Requests (admin) ───
router.get('/service-requests', authenticate, serviceRequestController.listPending);
router.patch('/service-requests/:id/acknowledge', authenticate, validate(idParamSchema, 'params'), serviceRequestController.acknowledge);
router.patch('/service-requests/:id/resolve', authenticate, validate(idParamSchema, 'params'), serviceRequestController.resolve);

// ─── Feedback (admin) ───
router.get('/feedback', authenticate, authorize('OWNER', 'ADMIN', 'MANAGER'), feedbackController.list);
router.get('/feedback/stats', authenticate, authorize('OWNER', 'ADMIN', 'MANAGER'), feedbackController.getStats);

// ─── Receipts (admin) ───
router.post('/receipts/:orderId/send', authenticate, receiptController.send);
router.get('/receipts/:orderId', authenticate, receiptController.listByOrder);

export default router;
