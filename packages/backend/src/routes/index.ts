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

// Public routes (no /api prefix in practice, but grouped here)
router.use('/public', publicRoutes);

// Customer-facing restaurant routes — alias /api/restaurants/* to the same
// public handlers so the customer app can use either /api/public/* or
// /api/restaurants/* interchangeably.
router.use('/restaurants', publicRoutes);

export default router;
