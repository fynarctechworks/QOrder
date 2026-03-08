import { Router } from 'express';
import { creditController } from '../controllers/creditController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createCreditAccountSchema,
  updateCreditAccountSchema,
  creditChargeSchema,
  creditRepaymentSchema,
} from '../validators/index.js';

const router = Router();

// All credit routes require authentication and OWNER/ADMIN/MANAGER role
router.use(authenticate);

router.get('/summary', authorize('OWNER', 'ADMIN', 'MANAGER'), creditController.getSummary);
router.get('/', authorize('OWNER', 'ADMIN', 'MANAGER'), creditController.getAccounts);
router.get('/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), creditController.getAccount);
router.post('/', authorize('OWNER', 'ADMIN'), validate(createCreditAccountSchema), creditController.createAccount);
router.patch('/:id', authorize('OWNER', 'ADMIN'), validate(updateCreditAccountSchema), creditController.updateAccount);
router.delete('/:id', authorize('OWNER'), creditController.deleteAccount);

// Transactions
router.post('/:id/charge', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(creditChargeSchema), creditController.chargeToAccount);
router.post('/:id/repayment', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(creditRepaymentSchema), creditController.recordRepayment);
router.get('/:id/transactions', authorize('OWNER', 'ADMIN', 'MANAGER'), creditController.getTransactions);

export default router;
