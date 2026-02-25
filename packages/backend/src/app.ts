import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler, apiLimiter } from './middlewares/index.js';

export function createApp(): Application {
  const app = express();

  // Security middleware — strict CSP, loosened for dev hot-reload
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Remove deprecated X-XSS-Protection header
    xXssProtection: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: config.isDevelopment
          ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] // Vite HMR needs eval
          : ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: config.isDevelopment
          ? ["'self'", 'https:', 'ws:', 'wss:', 'http://localhost:*', 'ws://localhost:*']
          : ["'self'", 'https:', 'ws:', 'wss:'],
        fontSrc: ["'self'", 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));

  // CORS
  app.use(cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parsing
  app.use(cookieParser());

  // Trust proxy — must be set BEFORE rate limiter so client IPs are resolved
  // correctly behind a reverse proxy (e.g. nginx, AWS ALB).
  // Value of 1 means trust exactly one hop (the first proxy).
  app.set('trust proxy', 1);

  // Rate limiting (global)
  app.use('/api', apiLimiter);

  // Serve static uploads
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  // API routes
  app.use('/api', routes);

  // Root route
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'QR Order API',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        menu: '/api/menu',
        orders: '/api/orders',
        tables: '/api/tables',
        restaurant: '/api/restaurant',
      },
    });
  });

  // Health check route (at root level for load balancers)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}
