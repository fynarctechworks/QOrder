import { Prisma } from '@prisma/client';
import { prisma, cache, AppError } from '../lib/index.js';
import type { 
  CreateCategoryInput, 
  UpdateCategoryInput, 
  CreateMenuItemInput, 
  UpdateMenuItemInput,
  CreateModifierGroupInput,
  MenuItemQueryInput,
} from '../validators/index.js';

export const menuService = {
  // ==================== HELPERS ====================

  /** Invalidate ALL category + menu caches for a restaurant (including all branch variants) */
  async invalidateMenuCache(restaurantId: string) {
    await cache.delPattern(`categories:${restaurantId}*`);
    await cache.delPattern(`menu:${restaurantId}*`);
  },

  // ==================== CATEGORIES ====================

  async getCategories(restaurantId: string, branchId?: string | null) {
    // Try cache first
    const cacheKey = cache.keys.categories(restaurantId, branchId);
    const cached = await cache.get<Awaited<ReturnType<typeof this.fetchCategories>>>(cacheKey);
    
    if (cached) return cached;

    const categories = await this.fetchCategories(restaurantId, branchId);
    await cache.set(cacheKey, categories, cache.ttl.medium);
    
    return categories;
  },

  async fetchCategories(restaurantId: string, branchId?: string | null) {
    return prisma.category.findMany({
      where: { 
        restaurantId, 
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        sortOrder: true,
        translations: true,
        _count: {
          select: { 
            menuItems: { 
              where: { isActive: true } 
            } 
          },
        },
      },
    });
  },

  async getCategoryById(categoryId: string, restaurantId: string) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, restaurantId },
      include: {
        menuItems: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw AppError.notFound('Category');
    }

    return category;
  },

  async createCategory(restaurantId: string, input: CreateCategoryInput, branchId?: string | null) {
    const category = await prisma.category.create({
      data: {
        ...input,
        restaurantId,
        ...(branchId ? { branchId } : {}),
      },
    });

    // Invalidate cache
    await this.invalidateMenuCache(restaurantId);

    return category;
  },

  async updateCategory(categoryId: string, restaurantId: string, input: UpdateCategoryInput) {
    // Verify ownership
    const existing = await prisma.category.findFirst({ where: { id: categoryId, restaurantId } });
    if (!existing) throw AppError.notFound('Category');

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: input,
    });

    // Invalidate cache (use branch from existing record)
    await this.invalidateMenuCache(restaurantId);

    return category;
  },

  async deleteCategory(categoryId: string, restaurantId: string) {
    // Verify ownership
    const existing = await prisma.category.findFirst({ where: { id: categoryId, restaurantId } });
    if (!existing) throw AppError.notFound('Category');

    // Check if category has active items — block deletion if so
    const activeItemCount = await prisma.menuItem.count({
      where: { categoryId, restaurantId, isActive: true },
    });

    if (activeItemCount > 0) {
      throw AppError.badRequest('Cannot delete category with active menu items. Move or delete items first.');
    }

    // Delete any inactive items first, then delete the category
    // OrderItem.menuItemId is nullable (SetNull) so past orders are preserved
    await prisma.menuItem.deleteMany({
      where: { categoryId, restaurantId, isActive: false },
    });

    await prisma.category.delete({
      where: { id: categoryId },
    });

    // Invalidate cache
    await this.invalidateMenuCache(restaurantId);
  },

  // ==================== MENU ITEMS ====================

  async getMenuItems(restaurantId: string, query: MenuItemQueryInput, branchId?: string | null) {
    const { categoryId, page, limit, search } = query;

    const where = {
      restaurantId,
      isActive: true,
      ...(branchId ? { branchId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { name: { contains: search, mode: Prisma.QueryMode.insensitive } } : {}),
    };

    // For the full unpaginated menu with no filters, use cache
    if (!categoryId && !search && page === 1 && limit >= 50) {
      const cacheKey = cache.keys.menu(restaurantId, branchId);
      const cached = await cache.get<Awaited<ReturnType<typeof this.fetchMenuItems>>>(cacheKey);

      if (cached) {
        return { items: cached, pagination: { page: 1, limit: cached.length, total: cached.length, totalPages: 1 } };
      }

      const items = await this.fetchMenuItems(restaurantId, undefined, branchId);
      await cache.set(cacheKey, items, cache.ttl.medium);

      return { items, pagination: { page: 1, limit: items.length, total: items.length, totalPages: 1 } };
    }

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        orderBy: [
          { category: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
        ],
        include: {
          category: {
            select: { id: true, name: true, translations: true },
          },
          modifierGroups: {
            orderBy: { sortOrder: 'asc' },
            include: {
              modifierGroup: {
                include: {
                  modifiers: {
                    where: { isActive: true },
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.menuItem.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async fetchMenuItems(restaurantId: string, categoryId?: string, branchId?: string | null) {
    return prisma.menuItem.findMany({
      where: {
        restaurantId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
      ],
      include: {
        category: {
          select: { id: true, name: true, translations: true },
        },
        modifierGroups: {
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroup: {
              include: {
                modifiers: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  },

  async getMenuItemById(itemId: string, restaurantId: string) {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
      include: {
        category: true,
        modifierGroups: {
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroup: {
              include: {
                modifiers: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!item) {
      throw AppError.notFound('Menu item');
    }

    return item;
  },

  /**
   * Upsert inline customization groups and their options, returning the
   * resolved ModifierGroup IDs that should be linked to the menu item.
   */
  async _syncCustomizationGroups(
    restaurantId: string,
    customizationGroups: NonNullable<CreateMenuItemInput['customizationGroups']>,
    branchId?: string | null,
  ): Promise<string[]> {
    return prisma.$transaction(async (tx) => {
      const groupIds: string[] = [];

      for (let i = 0; i < customizationGroups.length; i++) {
        const group = customizationGroups[i]!;

        let modifierGroup;

        if (group.id) {
          // Existing group – update it by ID
          modifierGroup = await tx.modifierGroup.update({
            where: { id: group.id },
            data: {
              name: group.name,
              isRequired: group.required,
              minSelect: group.minSelections,
              maxSelect: group.maxSelections,
            },
          });
        } else {
          // New group – upsert by (restaurantId, branchId, name)
          modifierGroup = await tx.modifierGroup.upsert({
            where: {
              restaurantId_branchId_name: { restaurantId, branchId: branchId ?? '', name: group.name },
            },
            update: {
              isRequired: group.required,
              minSelect: group.minSelections,
              maxSelect: group.maxSelections,
            },
            create: {
              name: group.name,
              isRequired: group.required,
              minSelect: group.minSelections,
              maxSelect: group.maxSelections,
              restaurantId,
              ...(branchId ? { branchId } : {}),
            },
          });
        }

        // Sync modifiers: delete all existing, then recreate
        await tx.modifier.deleteMany({
          where: { modifierGroupId: modifierGroup.id },
        });

        if (group.options && group.options.length > 0) {
          await tx.modifier.createMany({
            data: group.options.map((opt, idx) => ({
              name: opt.name,
              price: opt.priceModifier,
              isDefault: opt.isDefault,
              isActive: opt.isAvailable,
              sortOrder: idx,
              modifierGroupId: modifierGroup.id,
            })),
          });
        }

        groupIds.push(modifierGroup.id);
      }

      return groupIds;
    });
  },

  async createMenuItem(restaurantId: string, input: CreateMenuItemInput, branchId?: string | null) {
    const { modifierGroupIds, customizationGroups, ...itemData } = input;

    // Verify category exists
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, restaurantId },
    });

    if (!category) {
      throw AppError.notFound('Category');
    }

    // Resolve modifier group IDs – inline groups take precedence
    let resolvedGroupIds: string[] = modifierGroupIds || [];
    if (customizationGroups && customizationGroups.length > 0) {
      resolvedGroupIds = await this._syncCustomizationGroups(restaurantId, customizationGroups, branchId);
    }

    const item = await prisma.menuItem.create({
      data: {
        ...itemData,
        restaurantId,
        ...(branchId ? { branchId } : {}),
        modifierGroups: resolvedGroupIds.length > 0 ? {
          create: resolvedGroupIds.map((groupId, index) => ({
            modifierGroupId: groupId,
            sortOrder: index,
          })),
        } : undefined,
      },
      include: {
        category: true,
        modifierGroups: {
          include: {
            modifierGroup: {
              include: {
                modifiers: true,
              },
            },
          },
        },
      },
    });

    // Invalidate cache
    await this.invalidateMenuCache(restaurantId);

    return item;
  },

  async updateMenuItem(itemId: string, restaurantId: string, input: UpdateMenuItemInput) {
    // Verify ownership first, before any modifications
    const existingItem = await prisma.menuItem.findFirst({ where: { id: itemId, restaurantId } });
    if (!existingItem) throw AppError.notFound('Menu item');

    const { modifierGroupIds, customizationGroups, ...itemData } = input;

    const updateData: Parameters<typeof prisma.menuItem.update>[0]['data'] = {
      ...itemData,
    };

    // Determine which group IDs to link
    let resolvedGroupIds: string[] | undefined;

    if (customizationGroups !== undefined) {
      // Inline groups take precedence
      if (customizationGroups.length > 0) {
        resolvedGroupIds = await this._syncCustomizationGroups(restaurantId, customizationGroups, existingItem.branchId);
      } else {
        resolvedGroupIds = [];
      }
    } else if (modifierGroupIds !== undefined) {
      resolvedGroupIds = modifierGroupIds;
    }

    if (resolvedGroupIds !== undefined) {
      // Remove existing modifier group associations
      await prisma.menuItemModifierGroup.deleteMany({
        where: { menuItemId: itemId },
      });

      if (resolvedGroupIds.length > 0) {
        updateData.modifierGroups = {
          create: resolvedGroupIds.map((groupId, index) => ({
            modifierGroupId: groupId,
            sortOrder: index,
          })),
        };
      }
    }

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        category: true,
        modifierGroups: {
          include: {
            modifierGroup: {
              include: {
                modifiers: true,
              },
            },
          },
        },
      },
    });

    // Invalidate cache
    await this.invalidateMenuCache(restaurantId);

    return item;
  },

  async deleteMenuItem(itemId: string, restaurantId: string, branchId?: string | null) {
    // Verify ownership
    const existing = await prisma.menuItem.findFirst({ where: { id: itemId, restaurantId } });
    if (!existing) throw AppError.notFound('Menu item');

    await prisma.menuItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });

    // Invalidate cache
    await this.invalidateMenuCache(restaurantId);
  },

  async updateAvailability(restaurantId: string, itemIds: string[], isAvailable: boolean, branchId?: string | null) {
    await prisma.menuItem.updateMany({
      where: {
        id: { in: itemIds },
        restaurantId,
        ...(branchId ? { branchId } : {}),
      },
      data: { isAvailable },
    });

    // Invalidate cache
    await this.invalidateMenuCache(restaurantId);

    return { updated: itemIds.length };
  },

  // ==================== MODIFIER GROUPS ====================

  async getModifierGroups(restaurantId: string, branchId?: string | null) {
    return prisma.modifierGroup.findMany({
      where: { restaurantId, ...(branchId ? { branchId } : {}) },
      orderBy: { name: 'asc' },
      include: {
        modifiers: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { menuItems: true },
        },
      },
    });
  },

  async createModifierGroup(restaurantId: string, input: CreateModifierGroupInput, branchId?: string | null) {
    const { modifiers, ...groupData } = input;

    const group = await prisma.modifierGroup.create({
      data: {
        ...groupData,
        restaurantId,
        ...(branchId ? { branchId } : {}),
        modifiers: {
          create: modifiers,
        },
      },
      include: {
        modifiers: true,
      },
    });

    return group;
  },

  async deleteModifierGroup(groupId: string, restaurantId: string) {
    // Check if group is in use
    const usageCount = await prisma.menuItemModifierGroup.count({
      where: { modifierGroupId: groupId },
    });

    if (usageCount > 0) {
      throw AppError.badRequest('Cannot delete modifier group that is in use by menu items');
    }

    // Verify ownership
    const existing = await prisma.modifierGroup.findFirst({ where: { id: groupId, restaurantId } });
    if (!existing) throw AppError.notFound('Modifier group');

    await prisma.modifierGroup.delete({
      where: { id: groupId },
    });

    // Invalidate cache
    await this.invalidateMenuCache(restaurantId);
  },

  // ==================== PUBLIC MENU (for customer app) ====================

  async getPublicMenu(restaurantSlug: string, branchId?: string | null) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { id: true, isActive: true },
    });

    if (!restaurant || !restaurant.isActive) {
      throw AppError.notFound('Restaurant');
    }

    // Try cache first
    const cacheKey = cache.keys.menu(restaurant.id, branchId);
    const cached = await cache.get(cacheKey);
    
    if (cached) return cached;

    const menu = await prisma.category.findMany({
      where: { 
        restaurantId: restaurant.id, 
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        translations: true,
        menuItems: {
          where: { 
            isActive: true, 
            isAvailable: true,
            ...(branchId ? { branchId } : {}),
          },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            image: true,
            prepTime: true,
            calories: true,
            tags: true,
            ingredients: true,
            dietType: true,
            translations: true,
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              select: {
                modifierGroup: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    minSelect: true,
                    maxSelect: true,
                    isRequired: true,
                    translations: true,
                    modifiers: {
                      where: { isActive: true },
                      orderBy: { sortOrder: 'asc' },
                      select: {
                        id: true,
                        name: true,
                        price: true,
                        isDefault: true,
                        translations: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    await cache.set(cacheKey, menu, cache.ttl.medium);

    return menu;
  },
};
