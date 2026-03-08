import { prisma, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import type { ServiceRequestType, ServiceRequestStatus } from '@prisma/client';

export const serviceRequestService = {
  async create(restaurantId: string, tableId: string, type: ServiceRequestType, message?: string) {
    // Prevent duplicate pending requests of the same type for the same table
    // CUSTOM requests always create new entries since each has a unique message
    if (type !== 'CUSTOM') {
      const existing = await prisma.serviceRequest.findFirst({
        where: { tableId, restaurantId, type, status: 'PENDING' },
        include: { table: { select: { id: true, number: true, name: true, section: { select: { name: true } } } } },
      });
      if (existing) {
        return existing; // Already pending — don't create duplicate
      }
    }

    return prisma.serviceRequest.create({
      data: { restaurantId, tableId, type, message },
      include: { table: { select: { id: true, number: true, name: true, section: { select: { name: true } } } } },
    });
  },

  async acknowledge(id: string, restaurantId: string) {
    const request = await prisma.serviceRequest.findFirst({
      where: { id, restaurantId },
    });
    if (!request) throw AppError.notFound('Service request');

    return prisma.serviceRequest.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED' },
      include: { table: { select: { id: true, number: true, name: true } } },
    });
  },

  async resolve(id: string, restaurantId: string) {
    const request = await prisma.serviceRequest.findFirst({
      where: { id, restaurantId },
    });
    if (!request) throw AppError.notFound('Service request');

    return prisma.serviceRequest.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  },

  async listPending(restaurantId: string) {
    return prisma.serviceRequest.findMany({
      where: { restaurantId, status: { in: ['PENDING', 'ACKNOWLEDGED'] } },
      include: { table: { select: { id: true, number: true, name: true, section: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async listAll(restaurantId: string, limit = 50) {
    return prisma.serviceRequest.findMany({
      where: { restaurantId },
      include: { table: { select: { id: true, number: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
