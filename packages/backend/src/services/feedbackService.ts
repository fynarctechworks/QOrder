import { prisma, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';

interface FeedbackInput {
  overallRating: number;
  foodRating?: number;
  serviceRating?: number;
  ambienceRating?: number;
  comment?: string;
  customerPhone?: string;
  orderId?: string;
  sessionId?: string;
}

export const feedbackService = {
  async create(restaurantId: string, input: FeedbackInput) {
    // Prevent duplicate feedback for the same order
    if (input.orderId) {
      const existing = await prisma.feedback.findUnique({ where: { orderId: input.orderId } });
      if (existing) throw AppError.badRequest('Feedback already submitted for this order');
    }

    return prisma.feedback.create({
      data: {
        restaurantId,
        orderId: input.orderId,
        sessionId: input.sessionId,
        overallRating: input.overallRating,
        foodRating: input.foodRating,
        serviceRating: input.serviceRating,
        ambienceRating: input.ambienceRating,
        comment: input.comment,
        customerPhone: input.customerPhone,
      },
    });
  },

  async list(restaurantId: string, params: { page?: number; limit?: number; minRating?: number; maxRating?: number; dateFrom?: string; dateTo?: string }) {
    const { page = 1, limit = 20, minRating, maxRating, dateFrom, dateTo } = params;

    const where = {
      restaurantId,
      ...(minRating !== undefined || maxRating !== undefined
        ? {
            overallRating: {
              ...(minRating !== undefined ? { gte: minRating } : {}),
              ...(maxRating !== undefined ? { lte: maxRating } : {}),
            },
          }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          order: { select: { id: true, orderNumber: true, total: true, customerName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    return { feedbacks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async getStats(restaurantId: string) {
    const [aggregates, distribution] = await Promise.all([
      prisma.feedback.aggregate({
        where: { restaurantId },
        _avg: { overallRating: true, foodRating: true, serviceRating: true, ambienceRating: true },
        _count: { id: true },
      }),
      prisma.feedback.groupBy({
        by: ['overallRating'],
        where: { restaurantId },
        _count: { id: true },
        orderBy: { overallRating: 'asc' },
      }),
    ]);

    return {
      averages: {
        overall: aggregates._avg.overallRating ? Number(aggregates._avg.overallRating.toFixed(1)) : null,
        food: aggregates._avg.foodRating ? Number(aggregates._avg.foodRating.toFixed(1)) : null,
        service: aggregates._avg.serviceRating ? Number(aggregates._avg.serviceRating.toFixed(1)) : null,
        ambience: aggregates._avg.ambienceRating ? Number(aggregates._avg.ambienceRating.toFixed(1)) : null,
      },
      totalReviews: aggregates._count.id,
      distribution: distribution.map(d => ({ rating: d.overallRating, count: d._count.id })),
    };
  },
};
