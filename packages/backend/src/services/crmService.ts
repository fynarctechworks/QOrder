import { prisma } from '../lib/prisma.js';
import type { Prisma, InteractionType } from '@prisma/client';

export const crmService = {

  /* ─── Get / Search Customers ─── */

  async getCustomers(
    restaurantId: string,
    opts: {
      page?: number;
      limit?: number;
      search?: string;
      tags?: string[];
      sortBy?: 'totalSpend' | 'totalVisits' | 'lastVisitAt' | 'createdAt';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ) {
    const { page = 1, limit = 25, search, tags, sortBy = 'lastVisitAt', sortOrder = 'desc' } = opts;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = { restaurantId };

    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tags?.length) {
      (where as any).tags = { hasSome: tags };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        include: {
          _count: { select: { interactions: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  /* ─── Get Single Customer with Interactions ─── */

  async getCustomerById(customerId: string, restaurantId: string) {
    return prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
      include: {
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
  },

  /* ─── Get or Create Customer by Phone ─── */

  async getOrCreateByPhone(restaurantId: string, phone: string, name?: string) {
    const existing = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone } },
    });
    if (existing) return existing;

    return prisma.customer.create({
      data: {
        restaurantId,
        phone,
        name: name || undefined,
        tags: ['NEW'],
        firstVisitAt: new Date(),
      },
    });
  },

  /* ─── Update Customer ─── */

  async updateCustomer(
    customerId: string,
    restaurantId: string,
    data: { name?: string; email?: string; tags?: string[]; notes?: string }
  ) {
    // Verify customer belongs to this restaurant before updating
    const customer = await prisma.customer.findFirst({ where: { id: customerId, restaurantId } });
    if (!customer) throw new Error('Customer not found');
    return prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.notes !== undefined && { notes: data.notes }),
      } as any,
    });
  },

  /* ─── Record an Interaction (order, feedback, etc.) ─── */

  async recordInteraction(
    customerId: string,
    type: InteractionType,
    data: { summary?: string; amount?: number; referenceId?: string; metadata?: Record<string, unknown> },
    restaurantId?: string,
  ) {
    // Verify customer belongs to the restaurant if restaurantId is provided
    if (restaurantId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, restaurantId } });
      if (!customer) throw new Error('Customer not found');
    }
    return prisma.customerInteraction.create({
      data: {
        customerId,
        type,
        summary: data.summary,
        amount: data.amount,
        referenceId: data.referenceId,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  },

  /* ─── Update Visit Stats (called when an order is placed) ─── */

  async recordVisit(restaurantId: string, phone: string, orderTotal: number, customerName?: string) {
    const customer = await this.getOrCreateByPhone(restaurantId, phone, customerName);

    const newVisits = customer.totalVisits + 1;
    const newSpend = Number(customer.totalSpend) + orderTotal;
    const newAvg = newSpend / newVisits;

    // Auto-tag based on visits
    const tags = [...customer.tags.filter((t: string) => t !== 'NEW' && t !== 'INACTIVE')];
    if (newVisits >= 10 && !tags.includes('VIP')) tags.push('VIP');
    if (newVisits >= 3 && !tags.includes('REGULAR')) tags.push('REGULAR');

    return prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalVisits: newVisits,
        totalSpend: newSpend,
        avgOrderValue: newAvg,
        lastVisitAt: new Date(),
        name: customerName || customer.name,
        tags,
      },
    });
  },

  /* ─── Customer Insights / Segmentation Stats ─── */

  async getInsights(restaurantId: string) {
    const [totalCustomers, tagCounts, spendBuckets, recentChurn] = await Promise.all([
      prisma.customer.count({ where: { restaurantId } }),

      // Tag distribution
      prisma.$queryRaw<{ tag: string; count: bigint }[]>`
        SELECT unnest(tags) as tag, COUNT(*) as count
        FROM "Customer"
        WHERE "restaurantId" = ${restaurantId}
        GROUP BY tag
        ORDER BY count DESC
      `,

      // Spend distribution
      prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
        SELECT
          CASE
            WHEN "totalSpend" = 0 THEN 'zero'
            WHEN "totalSpend" < 500 THEN 'low'
            WHEN "totalSpend" < 2000 THEN 'medium'
            WHEN "totalSpend" < 5000 THEN 'high'
            ELSE 'premium'
          END as bucket,
          COUNT(*) as count
        FROM "Customer"
        WHERE "restaurantId" = ${restaurantId}
        GROUP BY bucket
        ORDER BY count DESC
      `,

      // Inactive customers (no visit in 30 days)
      prisma.customer.count({
        where: {
          restaurantId,
          lastVisitAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      totalCustomers,
      tagDistribution: tagCounts.map((t: { tag: string; count: bigint }) => ({ tag: t.tag, count: Number(t.count) })),
      spendDistribution: spendBuckets.map((b: { bucket: string; count: bigint }) => ({ bucket: b.bucket, count: Number(b.count) })),
      churnRisk: recentChurn,
    };
  },

  /* ─── Top Customers ─── */

  async getTopCustomers(restaurantId: string, limit = 10, metric: 'totalSpend' | 'totalVisits' = 'totalSpend') {
    return prisma.customer.findMany({
      where: { restaurantId },
      orderBy: { [metric]: 'desc' },
      take: limit,
    });
  },
};
