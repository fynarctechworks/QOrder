import { Prisma } from '@prisma/client';
import { prisma, cache, AppError } from '../lib/index.js';
import type { UpdateRestaurantInput } from '../validators/index.js';

/** Generate URL-friendly slug from restaurant name */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

export const restaurantService = {
  async getBySlug(slug: string) {
    // Try cache first
    const cacheKey = cache.keys.restaurant(slug);
    const cached = await cache.get(cacheKey);
    
    if (cached) return cached;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
        coverImage: true,
        address: true,
        phone: true,
        email: true,
        timezone: true,
        currency: true,
        taxRate: true,
        isActive: true,
        settings: true,
      },
    });

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    if (!restaurant.isActive) {
      throw AppError.forbidden('Restaurant is not active');
    }

    await cache.set(cacheKey, restaurant, cache.ttl.long);

    return restaurant;
  },

  async getById(id: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
        coverImage: true,
        address: true,
        phone: true,
        email: true,
        timezone: true,
        currency: true,
        taxRate: true,
        isActive: true,
        settings: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            tables: true,
            menuItems: { where: { isActive: true } },
            orders: true,
          },
        },
      },
    });

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    return restaurant;
  },

  async update(id: string, input: UpdateRestaurantInput) {
    const { settings, ...restInput } = input;

    // If name is changing, regenerate the slug
    let slugData: { slug: string } | undefined;
    if (restInput.name) {
      const oldRestaurant = await prisma.restaurant.findUnique({ where: { id }, select: { slug: true } });
      const newSlug = generateSlug(restInput.name);

      // Only update slug if the name actually produces a different slug
      if (oldRestaurant && newSlug !== oldRestaurant.slug) {
        // Ensure uniqueness — append numeric suffix if needed
        let slug = newSlug;
        let existing = await prisma.restaurant.findUnique({ where: { slug } });
        let suffix = 1;
        while (existing && existing.id !== id) {
          slug = `${newSlug}-${suffix}`;
          existing = await prisma.restaurant.findUnique({ where: { slug } });
          suffix++;
        }
        slugData = { slug };

        // Invalidate old slug cache
        await cache.del(cache.keys.restaurant(oldRestaurant.slug));
      }
    }

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data: {
        ...restInput,
        ...slugData,
        ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
      },
    });

    // Invalidate new slug cache
    await cache.del(cache.keys.restaurant(restaurant.slug));

    return restaurant;
  },

  async updateSettings(id: string, settings: Record<string, unknown>) {
    const existing = await prisma.restaurant.findUnique({
      where: { id },
      select: { settings: true, slug: true },
    });

    if (!existing) {
      throw AppError.notFound('Restaurant');
    }

    const mergedSettings = {
      ...((existing.settings as Record<string, unknown>) || {}),
      ...settings,
    };

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data: { settings: mergedSettings as Prisma.InputJsonValue },
    });

    // Invalidate cache
    await cache.del(cache.keys.restaurant(existing.slug));

    return restaurant;
  },

  async getDashboardStats(restaurantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todayOrders,
      todayRevenue,
      activeOrders,
      tables,
    ] = await Promise.all([
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: today },
        },
      }),
      prisma.order.aggregate({
        where: {
          restaurantId,
          createdAt: { gte: today },
          status: { in: ['COMPLETED'] },
        },
        _sum: { total: true },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          status: { in: ['PENDING', 'PREPARING'] },
        },
      }),
      prisma.table.groupBy({
        by: ['status'],
        where: {
          restaurantId,
        },
        _count: true,
      }),
    ]);

    const tableStats = {
      total: tables.reduce((acc, t) => acc + t._count, 0),
      available: tables.find(t => t.status === 'AVAILABLE')?._count || 0,
      occupied: tables.find(t => t.status === 'OCCUPIED')?._count || 0,
    };

    return {
      todayOrders,
      todayRevenue: Number(todayRevenue._sum.total || 0),
      activeOrders,
      tables: tableStats,
    };
  },

  async getUsers(restaurantId: string) {
    return prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
