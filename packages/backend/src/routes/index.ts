import { Router } from 'express';
import authRoutes from './auth.js';
import menuRoutes from './menu.js';
import tableRoutes from './tables.js';
import orderRoutes from './orders.js';
import restaurantRoutes from './restaurant.js';
import publicRoutes from './public.js';
import uploadRoutes from './upload.js';
import profileRoutes from './profile.js';
import sessionRoutes from './sessions.js';
import staffRoutes from './staff.js';
import sectionRoutes from './sections.js';
import branchRoutes from './branches.js';
import inventoryRoutes from './inventory.js';
import discountRoutes from './discounts.js';
import featureRoutes from './features.js';
import paymentRoutes from './payments.js';
import crmRoutes from './crm.js';
import reportRoutes from './reports.js';
import staffManagementRoutes from './staffManagement.js';
import chatbotRoutes from './chatbot.js';
import creditRoutes from './credit.js';
import { paymentGatewayController } from '../controllers/paymentGatewayController.js';

const router = Router();

// Health check (unauthenticated — used by container probes)
router.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/menu', menuRoutes);
router.use('/tables', tableRoutes);
router.use('/orders', orderRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/upload', uploadRoutes);
router.use('/profile', profileRoutes);
router.use('/sessions', sessionRoutes);
router.use('/staff', staffRoutes);
router.use('/sections', sectionRoutes);
router.use('/branches', branchRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/discounts', discountRoutes);
router.use('/features', featureRoutes);
router.use('/payments', paymentRoutes);

// Razorpay webhook — unauthenticated, raw body parsed by app.ts middleware
router.post('/payment/webhook', paymentGatewayController.handleWebhook);
router.use('/crm', crmRoutes);
router.use('/reports', reportRoutes);
router.use('/staff-management', staffManagementRoutes);
router.use('/chatbot', chatbotRoutes);
router.use('/credit', creditRoutes);

// Public routes (no /api prefix in practice, but grouped here)
router.use('/public', publicRoutes);

// Customer-facing restaurant routes — alias /api/restaurants/* to the same
// public handlers so the customer app can use either /api/public/* or
// /api/restaurants/* interchangeably.
router.use('/restaurants', publicRoutes);

export default router;
