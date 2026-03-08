import { prisma, AppError } from '../lib/index.js';
import type { Branch, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

export interface CreateBranchInput {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
}

export const branchService = {
  /**
   * List all branches for a restaurant.
   */
  async getBranches(restaurantId: string): Promise<Branch[]> {
    return prisma.branch.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: {
            tables: true,
            sections: true,
            users: true,
            orders: true,
          },
        },
      },
    });
  },

  /**
   * Get a single branch by ID.
   */
  async getById(id: string, restaurantId: string): Promise<Branch> {
    const branch = await prisma.branch.findFirst({
      where: { id, restaurantId },
      include: {
        _count: {
          select: {
            tables: true,
            sections: true,
            users: true,
            orders: true,
          },
        },
        users: {
          include: {
            user: {
              select: { id: true, name: true, email: true, username: true, role: true, roleTitle: true, isActive: true },
            },
          },
        },
      },
    });

    if (!branch) {
      throw AppError.notFound('Branch');
    }

    return branch;
  },

  /**
   * Create a new branch.
   */
  async create(restaurantId: string, data: CreateBranchInput): Promise<Branch> {
    // Check for duplicate code
    const existing = await prisma.branch.findFirst({
      where: {
        restaurantId,
        OR: [
          { code: data.code },
          { name: data.name },
        ],
      },
    });

    if (existing) {
      if (existing.code === data.code) {
        throw AppError.conflict('A branch with this code already exists');
      }
      throw AppError.conflict('A branch with this name already exists');
    }

    return prisma.branch.create({
      data: {
        ...data,
        restaurantId,
      },
    });
  },

  /**
   * Update an existing branch.
   */
  async update(id: string, restaurantId: string, data: UpdateBranchInput): Promise<Branch> {
    const branch = await prisma.branch.findFirst({
      where: { id, restaurantId },
    });

    if (!branch) {
      throw AppError.notFound('Branch');
    }

    // Check for duplicate name/code if changing
    if (data.code || data.name) {
      const conditions: Prisma.BranchWhereInput[] = [];
      if (data.code) conditions.push({ code: data.code });
      if (data.name) conditions.push({ name: data.name });

      const duplicate = await prisma.branch.findFirst({
        where: {
          restaurantId,
          id: { not: id },
          OR: conditions,
        },
      });

      if (duplicate) {
        if (data.code && duplicate.code === data.code) {
          throw AppError.conflict('A branch with this code already exists');
        }
        throw AppError.conflict('A branch with this name already exists');
      }
    }

    return prisma.branch.update({
      where: { id },
      data,
    });
  },

  /**
   * Delete a branch. Only if it has no active orders.
   */
  async delete(id: string, restaurantId: string): Promise<void> {
    const branch = await prisma.branch.findFirst({
      where: { id, restaurantId },
      include: {
        _count: {
          select: {
            orders: {
              where: {
                status: { in: ['PENDING', 'PREPARING'] },
              },
            },
          },
        },
      },
    });

    if (!branch) {
      throw AppError.notFound('Branch');
    }

    if ((branch._count as { orders: number }).orders > 0) {
      throw AppError.badRequest('Cannot delete branch with active orders. Cancel or complete them first.');
    }

    await prisma.branch.delete({ where: { id } });
  },

  /**
   * Assign users to a branch.
   */
  async assignUsers(branchId: string, restaurantId: string, userIds: string[]): Promise<void> {
    // Verify branch belongs to restaurant
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
    });
    if (!branch) throw AppError.notFound('Branch');

    // Verify all users belong to the restaurant
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, restaurantId },
      select: { id: true },
    });

    if (users.length !== userIds.length) {
      throw AppError.badRequest('One or more users not found in this restaurant');
    }

    // Upsert assignments (skip duplicates)
    await prisma.$transaction(
      userIds.map((userId) =>
        prisma.userBranch.upsert({
          where: { userId_branchId: { userId, branchId } },
          create: { userId, branchId },
          update: {},
        })
      )
    );
  },

  /**
   * Remove users from a branch.
   */
  async removeUsers(branchId: string, restaurantId: string, userIds: string[]): Promise<void> {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
    });
    if (!branch) throw AppError.notFound('Branch');

    await prisma.userBranch.deleteMany({
      where: {
        branchId,
        userId: { in: userIds },
      },
    });
  },

  /**
   * Get branches assigned to a specific user.
   */
  async getUserBranches(userId: string, restaurantId: string): Promise<Branch[]> {
    const assignments = await prisma.userBranch.findMany({
      where: { userId, branch: { restaurantId } },
      include: { branch: true },
    });

    return assignments.map((a) => a.branch);
  },

  /**
   * Ensure a default branch exists for a restaurant.
   * Used during migration/seed.
   */
  async ensureDefaultBranch(restaurantId: string): Promise<Branch> {
    const existing = await prisma.branch.findFirst({
      where: { restaurantId, code: 'MAIN' },
    });

    if (existing) return existing;

    return prisma.branch.create({
      data: {
        name: 'Main Branch',
        code: 'MAIN',
        restaurantId,
      },
    });
  },

  /**
   * Get branch settings (merged with restaurant-level defaults).
   */
  async getSettings(branchId: string, restaurantId: string) {
    const [branch, restaurant] = await Promise.all([
      prisma.branch.findFirst({
        where: { id: branchId, restaurantId },
        select: { id: true, name: true, settings: true },
      }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { settings: true },
      }),
    ]);

    if (!branch) throw AppError.notFound('Branch');

    // Branch settings override restaurant defaults
    const restaurantSettings = (restaurant?.settings as Record<string, unknown>) || {};
    const branchSettings = (branch.settings as Record<string, unknown>) || {};

    return {
      branchId: branch.id,
      branchName: branch.name,
      settings: { ...restaurantSettings, ...branchSettings },
    };
  },

  /**
   * Update branch-level settings (merged server-side).
   */
  async updateSettings(branchId: string, restaurantId: string, settings: Record<string, unknown>) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
      select: { id: true, settings: true },
    });

    if (!branch) throw AppError.notFound('Branch');

    // Hash lockPin with bcrypt before saving
    if (typeof settings.lockPin === 'string' && /^\d{6}$/.test(settings.lockPin)) {
      settings.lockPin = await bcrypt.hash(settings.lockPin, 10);
    }

    const mergedSettings = {
      ...((branch.settings as Record<string, unknown>) || {}),
      ...settings,
    };

    return prisma.branch.update({
      where: { id: branchId },
      data: { settings: mergedSettings as Prisma.InputJsonValue },
    });
  },
};
