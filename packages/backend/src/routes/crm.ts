import { Router } from 'express';
import { crmController } from '../controllers/crmController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { validate } from '../middlewares/validate.js';
import { updateCustomerSchema } from '../validators/index.js';

const router = Router();

// All CRM routes require authentication and OWNER/ADMIN/MANAGER role
router.use(authenticate, resolveBranch);

router.get('/', crmController.getCustomers);
router.get('/insights', authorize('OWNER', 'ADMIN', 'MANAGER'), crmController.getInsights);
router.get('/top', authorize('OWNER', 'ADMIN', 'MANAGER'), crmController.getTopCustomers);
router.get('/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), crmController.getCustomer);
router.patch('/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(updateCustomerSchema), crmController.updateCustomer);

export default router;
