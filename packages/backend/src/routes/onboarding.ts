import { Router } from 'express';
import { onboardingController } from '../controllers/onboardingController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// All onboarding routes require authentication
router.use(authenticate);

router.get('/status', onboardingController.getStatus);
router.post('/business-profile', authorize('OWNER'), onboardingController.updateBusinessProfile);
router.post('/branch-setup', authorize('OWNER'), onboardingController.setupBranch);
router.post('/tax-currency', authorize('OWNER'), onboardingController.updateTaxCurrency);
router.post('/skip-step', authorize('OWNER'), onboardingController.skipStep);
router.post('/complete-menu', authorize('OWNER'), onboardingController.completeMenuSetup);
router.post('/complete-tables', authorize('OWNER'), onboardingController.completeTableSetup);

export default router;
