import { Router } from 'express';
import { discountController } from '../controllers/discountController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema, createDiscountSchema, updateDiscountSchema, createCouponSchema, updateCouponSchema } from '../validators/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Discounts ───
router.get('/', discountController.list);
router.post('/', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(createDiscountSchema), discountController.create);
router.put('/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(idParamSchema, 'params'), validate(updateDiscountSchema), discountController.update);
router.delete('/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(idParamSchema, 'params'), discountController.delete);

// ─── Coupons ───
router.get('/coupons', discountController.listCoupons);
router.post('/coupons', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(createCouponSchema), discountController.createCoupon);
router.put('/coupons/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(idParamSchema, 'params'), validate(updateCouponSchema), discountController.updateCoupon);
router.delete('/coupons/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), validate(idParamSchema, 'params'), discountController.deleteCoupon);

export default router;
