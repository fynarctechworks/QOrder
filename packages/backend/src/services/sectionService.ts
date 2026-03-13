import { prisma, cache, AppError } from '../lib/index.js';

export const sectionService = {
  async getSections(restaurantId: string, branchId?: string | null) {
    if (branchId) {
      return this.fetchSections(restaurantId, branchId);
    }

    const cacheKey = `sections:${restaurantId}`;
    const cached = await cache.get<Awaited<ReturnType<typeof this.fetchSections>>>(cacheKey);
    if (cached) return cached;

    const sections = await this.fetchSections(restaurantId);
    await cache.set(cacheKey, sections, cache.ttl.short);
    return sections;
  },

  async fetchSections(restaurantId: string, branchId?: string | null) {
    return prisma.section.findMany({
      where: {
        restaurantId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { tables: true },
        },
      },
    });
  },

  async getSectionById(sectionId: string, restaurantId: string) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId, restaurantId },
      include: {
        tables: {
          orderBy: { number: 'asc' },
        },
        _count: {
          select: { tables: true },
        },
      },
    });

    if (!section) {
      throw new AppError('Section not found', 404);
    }

    return section;
  },

  async createSection(restaurantId: string, data: { name: string; floor?: number; sortOrder?: number; branchId?: string | null }) {
    // Check for duplicate name within the same branch
    const existing = await prisma.section.findFirst({
      where: { restaurantId, branchId: data.branchId ?? null, name: data.name },
    });

    if (existing) {
      throw new AppError('A section with this name already exists', 409);
    }

    const section = await prisma.section.create({
      data: {
        name: data.name,
        floor: data.floor ?? null,
        sortOrder: data.sortOrder ?? 0,
        branchId: data.branchId ?? null,
        restaurantId,
      },
      include: {
        _count: {
          select: { tables: true },
        },
      },
    });

    await this.invalidateCache(restaurantId);
    return section;
  },

  async updateSection(sectionId: string, restaurantId: string, data: { name?: string; floor?: number | null; sortOrder?: number; isActive?: boolean }) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId, restaurantId },
    });

    if (!section) {
      throw new AppError('Section not found', 404);
    }

    // Check for duplicate name if name is being changed (within same branch)
    if (data.name && data.name !== section.name) {
      const existing = await prisma.section.findFirst({
        where: { restaurantId, branchId: section.branchId ?? null, name: data.name, id: { not: sectionId } },
      });
      if (existing) {
        throw new AppError('A section with this name already exists', 409);
      }
    }

    const updated = await prisma.section.update({
      where: { id: sectionId },
      data,
      include: {
        _count: {
          select: { tables: true },
        },
      },
    });

    await this.invalidateCache(restaurantId);
    return updated;
  },

  async deleteSection(sectionId: string, restaurantId: string) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId, restaurantId },
      include: { _count: { select: { tables: true } } },
    });

    if (!section) {
      throw new AppError('Section not found', 404);
    }

    // Unassign tables from this section before deleting
    await prisma.table.updateMany({
      where: { sectionId },
      data: { sectionId: null },
    });

    await prisma.section.delete({
      where: { id: sectionId },
    });

    await this.invalidateCache(restaurantId);
    // Also invalidate tables cache since tables were unassigned
    await cache.del(cache.keys.tables(restaurantId));
  },

  async invalidateCache(restaurantId: string) {
    await cache.del(`sections:${restaurantId}`);
  },
};
