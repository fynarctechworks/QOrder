import bcrypt from 'bcryptjs';
import { prisma, AppError, logger } from '../lib/index.js';
import { cache } from '../lib/redis.js';
import type { CreateUserInput, UpdateUserInput } from '../validators/index.js';

const SALT_ROUNDS = 12;

export const staffService = {
  /** List all staff for a restaurant, optionally filtered by branch */
  async list(restaurantId: string, branchId?: string | null) {
    if (branchId) {
      // Return only users assigned to this branch
      const userBranches = await prisma.userBranch.findMany({
        where: { branchId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              name: true,
              role: true,
              roleTitle: true,
              isActive: true,
              isVerified: true,
              lastLoginAt: true,
              createdAt: true,
              restaurantId: true,
              defaultShiftId: true,
              defaultShift: { select: { id: true, name: true, startTime: true, endTime: true } },
              branches: {
                select: {
                  branch: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      });
      return userBranches
        .map(ub => ub.user)
        .filter(u => u.restaurantId === restaurantId)
        .sort((a, b) => a.role.localeCompare(b.role) || b.createdAt.getTime() - a.createdAt.getTime());
    }

    return prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        roleTitle: true,
        isActive: true,
        isVerified: true,
        lastLoginAt: true,
        createdAt: true,
        defaultShiftId: true,
        defaultShift: { select: { id: true, name: true, startTime: true, endTime: true } },
        branches: {
          select: {
            branch: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    });
  },

  /** Create a staff member (ADMIN/MANAGER/STAFF) under a restaurant */
  async create(restaurantId: string, input: CreateUserInput & { username: string; branchIds?: string[] }, branchId?: string | null) {
    const { email, username, password, name, role, roleTitle, branchIds } = input;

    // Check email uniqueness (only if email provided)
    if (email) {
      const existingEmail = await prisma.user.findFirst({ where: { email } });
      if (existingEmail) {
        throw AppError.conflict('A user with this email already exists');
      }
    }

    // Check username uniqueness
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw AppError.conflict('This username is already taken');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: email || null,
        username,
        passwordHash,
        name,
        role: role || 'STAFF',
        roleTitle: roleTitle?.trim() || null,
        defaultShiftId: input.defaultShiftId || null,
        restaurantId,
        isVerified: true, // Staff created by owner are pre-verified
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        roleTitle: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        defaultShiftId: true,
      },
    });

    // Assign staff to branches
    const assignIds = branchIds?.length ? branchIds : branchId ? [branchId] : [];
    if (assignIds.length) {
      await prisma.userBranch.createMany({
        data: assignIds.map((bid) => ({ userId: user.id, branchId: bid })),
        skipDuplicates: true,
      });
    }

    logger.info({ userId: user.id, role: user.role, branchIds: assignIds }, 'Staff member created');
    return user;
  },

  /** Update a staff member's name, role, or active status */
  async update(staffId: string, restaurantId: string, requesterId: string, input: UpdateUserInput) {
    const staff = await prisma.user.findFirst({
      where: { id: staffId, restaurantId },
    });

    if (!staff) {
      throw AppError.notFound('Staff member');
    }

    // Cannot modify the OWNER account
    if (staff.role === 'OWNER') {
      throw AppError.forbidden('Cannot modify the owner account');
    }

    // Cannot modify yourself via staff management
    if (staff.id === requesterId) {
      throw AppError.badRequest('Use the profile page to update your own account');
    }

    // Prevent escalation to OWNER role — defence-in-depth (Zod also rejects this)
    if ((input.role as string) === 'OWNER') {
      throw AppError.forbidden('Cannot assign the OWNER role');
    }

    // Check username uniqueness if changing
    if (input.username && input.username !== staff.username) {
      const existing = await prisma.user.findFirst({
        where: { username: input.username, restaurantId, NOT: { id: staffId } },
      });
      if (existing) {
        throw AppError.conflict('Username is already taken');
      }
    }

    // Hash password if provided
    let passwordHash: string | undefined;
    if (input.password) {
      passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    }

    const user = await prisma.user.update({
      where: { id: staffId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email?.trim() || null }),
        ...(input.username !== undefined && { username: input.username }),
        ...(passwordHash && { passwordHash }),
        ...(input.role !== undefined && { role: input.role }),
        ...(input.roleTitle !== undefined && { roleTitle: input.roleTitle?.trim() || null }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.defaultShiftId !== undefined && { defaultShiftId: input.defaultShiftId || null }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        roleTitle: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        defaultShiftId: true,
      },
    });

    // Invalidate user auth cache so role changes take effect immediately
    await cache.del(`auth:user:${staffId}`);

    logger.info({ staffId, changes: input }, 'Staff member updated');
    return user;
  },

  /** Reset a staff member's password */
  async resetPassword(staffId: string, restaurantId: string, newPassword: string) {
    const staff = await prisma.user.findFirst({
      where: { id: staffId, restaurantId },
    });

    if (!staff) {
      throw AppError.notFound('Staff member');
    }

    if (staff.role === 'OWNER') {
      throw AppError.forbidden('Cannot reset owner password from staff management');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: staffId },
      data: { passwordHash },
    });

    // Revoke all refresh tokens for this user (force re-login)
    await prisma.refreshToken.deleteMany({ where: { userId: staffId } });
    await cache.del(`auth:user:${staffId}`);

    logger.info({ staffId }, 'Staff password reset');
    return { success: true };
  },

  /** Delete a staff member (permanently) */
  async remove(staffId: string, restaurantId: string, requesterId: string) {
    const staff = await prisma.user.findFirst({
      where: { id: staffId, restaurantId },
    });

    if (!staff) {
      throw AppError.notFound('Staff member');
    }

    if (staff.role === 'OWNER') {
      throw AppError.forbidden('Cannot delete the owner account');
    }

    if (staff.id === requesterId) {
      throw AppError.badRequest('Cannot delete your own account');
    }

    // Delete refresh tokens first, then user
    await prisma.refreshToken.deleteMany({ where: { userId: staffId } });
    await prisma.user.delete({ where: { id: staffId } });
    await cache.del(`auth:user:${staffId}`);

    logger.info({ staffId }, 'Staff member deleted');
    return { success: true };
  },

  /** Update branch assignments for a staff member */
  async updateBranches(staffId: string, restaurantId: string, branchIds: string[]) {
    const staff = await prisma.user.findFirst({
      where: { id: staffId, restaurantId },
    });

    if (!staff) {
      throw AppError.notFound('Staff member');
    }

    if (staff.role === 'OWNER') {
      throw AppError.forbidden('Cannot modify branch assignments for the owner');
    }

    // Verify all branches belong to this restaurant
    if (branchIds.length) {
      const validBranches = await prisma.branch.findMany({
        where: { id: { in: branchIds }, restaurantId, isActive: true },
        select: { id: true },
      });
      const validIds = new Set(validBranches.map((b) => b.id));
      const invalid = branchIds.filter((id) => !validIds.has(id));
      if (invalid.length) {
        throw AppError.badRequest(`Invalid branch IDs: ${invalid.join(', ')}`);
      }
    }

    // Replace all branch assignments
    await prisma.$transaction([
      prisma.userBranch.deleteMany({ where: { userId: staffId } }),
      ...(branchIds.length
        ? [
            prisma.userBranch.createMany({
              data: branchIds.map((bid) => ({ userId: staffId, branchId: bid })),
            }),
          ]
        : []),
    ]);

    logger.info({ staffId, branchIds }, 'Staff branch assignments updated');
    return { success: true };
  },
};
