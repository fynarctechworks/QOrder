import { Router } from 'express';
import { subscriptionController } from '../controllers/subscriptionController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public: list plans (no auth needed for pricing page)
router.get('/plans', subscriptionController.getPlans);

// Razorpay webhook (public, verified via signature)
router.post('/webhook', subscriptionController.webhook);

// Protected routes
router.use(authenticate);

router.get('/current', subscriptionController.getSubscription);
router.post('/create-order', authorize('OWNER'), subscriptionController.createPaymentOrder);
router.post('/verify-payment', authorize('OWNER'), subscriptionController.verifyPayment);
router.post('/start-trial', authorize('OWNER'), subscriptionController.startTrial);

export default router;
