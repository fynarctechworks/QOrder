import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma, cache, AppError } from '../lib/index.js';
import { clearGeoCache } from '../middlewares/geoValidation.js';
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
        coverImage: true,
        address: true,
        phone: true,
        email: true,
        timezone: true,
        currency: true,
        taxRate: true,
        isActive: true,
        settings: true,
        latitude: true,
        longitude: true,
        geoFenceRadius: true,
      },
    });

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    if (!restaurant.isActive) {
      throw AppError.forbidden('Restaurant is not active');
    }

    const { latitude, longitude, geoFenceRadius, ...publicData } = restaurant;
    const result = {
      ...publicData,
      geoFenceEnabled: latitude != null && longitude != null && (geoFenceRadius ?? 0) > 0,
    };

    await cache.set(cacheKey, result, cache.ttl.long);

    return result;
  },

  async getById(id: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        coverImage: true,
        address: true,
        phone: true,
        email: true,
        timezone: true,
        currency: true,
        taxRate: true,
        isActive: true,
        settings: true,
        latitude: true,
        longitude: true,
        geoFenceRadius: true,
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

    // Clear geo-fence cache if geo fields changed
    if (input.latitude !== undefined || input.longitude !== undefined || input.geoFenceRadius !== undefined) {
      clearGeoCache(id);
    }

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

    // Hash lockPin with bcrypt before saving (if provided as a raw 6-digit PIN)
    if (typeof settings.lockPin === 'string' && /^\d{6}$/.test(settings.lockPin)) {
      settings.lockPin = await bcrypt.hash(settings.lockPin, 10);
    }

    // If razorpayKeySecret is the masked value from GET, don't overwrite the real secret
    if (typeof settings.razorpayKeySecret === 'string' && settings.razorpayKeySecret.startsWith('••••')) {
      delete settings.razorpayKeySecret;
    }

    // Same for WhatsApp Access Token
    if (typeof settings.whatsappAccessToken === 'string' && settings.whatsappAccessToken.startsWith('••••')) {
      delete settings.whatsappAccessToken;
    }

    // Same for Twilio Auth Token
    if (typeof settings.twilioAuthToken === 'string' && settings.twilioAuthToken.startsWith('••••')) {
      delete settings.twilioAuthToken;
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

  async verifyPin(restaurantId: string, pin: string): Promise<boolean> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settings: true },
    });

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    const settings = (restaurant.settings as Record<string, unknown>) || {};
    const storedPin = settings.lockPin as string | undefined;

    if (!storedPin) {
      throw AppError.badRequest('No lock PIN is configured');
    }

    // Detect whether the stored value is a bcrypt hash ($2a$, $2b$, $2y$)
    const isBcryptHash = /^\$2[aby]\$/.test(storedPin);

    if (isBcryptHash) {
      return bcrypt.compare(pin, storedPin);
    }

    // Legacy plaintext PIN — compare directly, then migrate to bcrypt
    if (pin === storedPin) {
      const hashed = await bcrypt.hash(pin, 10);
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: {
          settings: { ...settings, lockPin: hashed },
        },
      });
      return true;
    }

    return false;
  },

  async getDashboardStats(restaurantId: string, branchId?: string | null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const branchFilter = branchId ? { OR: [{ branchId }, { branchId: null }] } : {};

    const [
      todayOrders,
      todayRevenue,
      activeOrders,
      tables,
    ] = await Promise.all([
      prisma.order.count({
        where: {
          restaurantId,
          ...branchFilter,
          createdAt: { gte: today },
        },
      }),
      prisma.order.aggregate({
        where: {
          restaurantId,
          ...branchFilter,
          createdAt: { gte: today },
          status: { in: ['COMPLETED'] },
        },
        _sum: { total: true },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          ...branchFilter,
          status: { in: ['PENDING', 'PREPARING'] },
        },
      }),
      prisma.table.groupBy({
        by: ['status'],
        where: {
          restaurantId,
          ...branchFilter,
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
