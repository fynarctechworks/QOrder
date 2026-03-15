import { Router } from 'express';
import { authController } from '../controllers/index.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { authLimiter } from '../middlewares/rateLimiter.js';
import { csrfProtection } from '../middlewares/csrfProtection.js';
import { 
  loginSchema, 
  registerSchema, 
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/index.js';

const router = Router();

// Public routes
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  authController.register
);

router.post(
  '/verify-email',
  authLimiter,
  validate(verifyEmailSchema),
  authController.verifyEmail
);

router.post(
  '/resend-verification',
  authLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login
);

router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

router.post(
  '/refresh',
  csrfProtection,
  authLimiter,
  authController.refresh
);

router.post(
  '/logout',
  csrfProtection,
  authController.logout
);

// Protected routes
router.post(
  '/logout-all',
  authenticate,
  authController.logoutAll
);

router.get(
  '/me',
  authenticate,
  authController.me
);

router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
