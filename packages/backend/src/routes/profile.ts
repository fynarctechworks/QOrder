import { Router } from 'express';
import { profileController } from '../controllers/profileController.js';
import { authenticate } from '../middlewares/auth.js';
import { authLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET  /profile         — get current user profile
router.get('/', profileController.getProfile);

// POST /profile/send-otp — send OTP for profile changes
router.post('/send-otp', authLimiter, profileController.sendOTP);

// PATCH /profile/username — update username
router.patch('/username', profileController.updateUsername);

// PATCH /profile/email — update email
router.patch('/email', profileController.updateEmail);

// POST /profile/change-password — change password
router.post('/change-password', profileController.changePassword);

export default router;
