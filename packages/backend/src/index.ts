import { createServer } from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { prisma, redis, logger } from './lib/index.js';
import { initializeSocket } from './socket/index.js';
import { authService } from './services/authService.js';
import { sessionService } from './services/sessionService.js';

async function bootstrap() {
  try {
    // Connect to database
    await prisma.$connect();
    logger.info('Database connected');

    // Connect to Redis (only if not already connected)
    if (redis.status === 'wait') {
      await redis.connect();
      logger.info('Redis connected');
    } else if (redis.status === 'connecting' || redis.status === 'connect') {
      // Wait for it to become ready
      await new Promise<void>((resolve, reject) => {
        redis.once('ready', resolve);
        redis.once('error', reject);
      });
      logger.info('Redis connected (waited)');
    } else {
      logger.info('Redis already connected');
    }

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.io
    initializeSocket(httpServer);

    // Clean up expired refresh tokens on startup
    try {
      const cleaned = await authService.cleanupExpiredTokens();
      if (cleaned > 0) logger.info({ count: cleaned }, 'Cleaned up expired refresh tokens');
    } catch (err) {
      logger.warn({ err }, 'Failed to clean expired tokens on startup');
    }

    // Periodic cleanup — every 6 hours
    setInterval(async () => {
      try {
        const cleaned = await authService.cleanupExpiredTokens();
        if (cleaned > 0) logger.info({ count: cleaned }, 'Periodic: cleaned expired refresh tokens');
      } catch (err) {
        logger.warn({ err }, 'Periodic token cleanup failed');
      }
    }, 6 * 60 * 60 * 1000);

    // Periodic session expiry cleanup — every 5 minutes
    setInterval(async () => {
      try {
        await sessionService.expireStaleSessions();
      } catch (err) {
        logger.warn({ err }, 'Periodic session cleanup failed');
      }
    }, 5 * 60 * 1000);

    // Start server
    httpServer.listen(config.port, () => {
      logger.info(
        { env: config.env, port: config.port },
        `Server running — HTTP :${config.port} | WS :${config.port}`
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');
      
      httpServer.close(async () => {
        logger.info('HTTP server closed');
        
        await prisma.$disconnect();
        logger.info('Database disconnected');
        
        await redis.quit();
        logger.info('Redis disconnected');
        
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();
