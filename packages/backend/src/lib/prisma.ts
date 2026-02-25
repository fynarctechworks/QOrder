import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

// Singleton Prisma client instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
    errorFormat: 'pretty',
  });

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
