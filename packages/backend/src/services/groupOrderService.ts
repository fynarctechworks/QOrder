import { Decimal } from '@prisma/client/runtime/library';
import { randomInt } from 'node:crypto';
import { prisma, AppError, cache } from '../lib/index.js';
import { orderService } from './orderService.js';
import { sessionService } from './sessionService.js';
import { socketEmitters } from '../socket/index.js';
import { logger } from '../lib/logger.js';

// ─── Helpers ────────────────────────────────────────────────

/** Generate a 6-char uppercase alphanumeric code */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid ambiguity
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

/** 2 hour TTL for group orders */
const GROUP_TTL_MS = 2 * 60 * 60 * 1000;

// ─── Service ────────────────────────────────────────────────

export const groupOrderService = {
  /**
   * Create a new group order (host action).
   */
  async create(data: {
    restaurantId: string;
    tableId?: string;
    sessionToken?: string;
    hostName: string;
    hostPhone?: string;
  }) {
    // Validate restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: data.restaurantId },
      select: { id: true, isActive: true },
    });
    if (!restaurant || !restaurant.isActive) {
      throw AppError.notFound('Restaurant');
    }

    // Validate table if provided
    if (data.tableId) {
      const table = await prisma.table.findFirst({
        where: { id: data.tableId, restaurantId: data.restaurantId },
        select: { id: true, sessionToken: true },
      });
      if (!table) throw AppError.notFound('Table');

      // Prevent creating a new group order when table already has an active one
      const existingGroup = await prisma.groupOrder.findFirst({
        where: {
          tableId: data.tableId,
          status: { in: ['OPEN', 'LOCKED'] },
        },
        select: { id: true, code: true },
      });
      if (existingGroup) {
        throw AppError.badRequest('This table already has an active group order. Please join the existing group or wait for it to complete.');
      }

      // Prevent creating a group order when table has pending/preparing orders
      const pendingOrders = await prisma.order.count({
        where: {
          tableId: data.tableId,
          status: { in: ['PENDING', 'PREPARING'] },
        },
      });
      if (pendingOrders > 0) {
        throw AppError.badRequest('This table already has an active order being processed. Please wait for it to complete before starting a new group order.');
      }
    }

    // Generate a unique code (retry up to 5 times on collision)
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateCode();
      const existing = await prisma.groupOrder.findUnique({ where: { code } });
      if (!existing) break;
      if (attempt === 4) throw AppError.internal('Failed to generate unique group code');
    }

    const expiresAt = new Date(Date.now() + GROUP_TTL_MS);

    const groupOrder = await prisma.groupOrder.create({
      data: {
        code,
        hostName: data.hostName,
        hostPhone: data.hostPhone,
        restaurantId: data.restaurantId,
        tableId: data.tableId ?? null,
        sessionToken: data.sessionToken ?? null,
        expiresAt,
        participants: {
          create: {
            name: data.hostName,
            phone: data.hostPhone,
            isHost: true,
          },
        },
      },
      include: {
        participants: {
          include: { cartItems: { include: { menuItem: { select: { id: true, name: true, price: true, image: true } } } } },
        },
      },
    });

    return groupOrder;
  },

  /**
   * Get group order by code (full details for dashboard).
   */
  async getByCode(code: string) {
    const group = await prisma.groupOrder.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        restaurant: { select: { id: true, name: true, slug: true, currency: true, taxRate: true, latitude: true, longitude: true, geoFenceRadius: true } },
        table: { select: { id: true, number: true, name: true } },
        participants: {
          orderBy: { joinedAt: 'asc' },
          include: {
            cartItems: {
              include: {
                menuItem: {
                  select: { id: true, name: true, price: true, discountPrice: true, image: true, dietType: true },
                },
              },
            },
          },
        },
      },
    });

    if (!group) throw AppError.notFound('Group order');

    // Auto-expire check
    if (group.status === 'OPEN' && group.expiresAt < new Date()) {
      await prisma.groupOrder.update({
        where: { id: group.id },
        data: { status: 'EXPIRED' },
      });
      throw AppError.badRequest('This group order has expired');
    }

    // Compute geoFenceEnabled and strip raw coordinates
    const { latitude, longitude, geoFenceRadius, ...restRestaurant } = group.restaurant;
    return {
      ...group,
      restaurant: {
        ...restRestaurant,
        geoFenceEnabled: latitude != null && longitude != null && (geoFenceRadius ?? 0) > 0,
      },
    };
  },

  /**
   * Join a group order as a participant.
   */
  async join(code: string, data: { name: string; phone?: string }) {
    const group = await prisma.groupOrder.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true, status: true, expiresAt: true },
    });

    if (!group) throw AppError.notFound('Group order');
    if (group.status !== 'OPEN') throw AppError.badRequest('This group order is no longer accepting participants');
    if (group.expiresAt < new Date()) {
      await prisma.groupOrder.update({ where: { id: group.id }, data: { status: 'EXPIRED' } });
      throw AppError.badRequest('This group order has expired');
    }

    // Check for duplicate name
    const existing = await prisma.groupParticipant.findFirst({
      where: { groupOrderId: group.id, name: data.name },
    });
    if (existing) throw AppError.conflict('A participant with this name already exists');

    const participant = await prisma.groupParticipant.create({
      data: {
        name: data.name,
        phone: data.phone,
        groupOrderId: group.id,
      },
    });

    // Emit socket event
    socketEmitters.emitGroupJoined(code.toUpperCase(), {
      code: code.toUpperCase(),
      participantId: participant.id,
      name: participant.name,
      isHost: false,
    });

    return participant;
  },

  /**
   * Add an item to a participant's cart.
   */
  async addCartItem(code: string, participantId: string, data: {
    menuItemId: string;
    quantity: number;
    notes?: string;
    modifiers?: { modifierId: string }[];
  }) {
    const group = await this._validateOpenGroup(code);

    // Validate participant belongs to group
    const participant = await prisma.groupParticipant.findFirst({
      where: { id: participantId, groupOrderId: group.id },
    });
    if (!participant) throw AppError.notFound('Participant');

    // Validate menu item
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: data.menuItemId, restaurantId: group.restaurantId, isActive: true, isAvailable: true },
      select: { id: true, price: true, discountPrice: true },
    });
    if (!menuItem) throw AppError.notFound('Menu item');

    // Look up modifier details from DB (don't trust client prices)
    let resolvedModifiers: { modifierId: string; name: string; price: number }[] = [];
    if (data.modifiers && data.modifiers.length > 0) {
      const modifierIds = data.modifiers.map((m) => m.modifierId);
      const dbModifiers = await prisma.modifier.findMany({
        where: { id: { in: modifierIds }, isActive: true },
        select: { id: true, name: true, price: true },
      });
      resolvedModifiers = dbModifiers.map((m) => ({
        modifierId: m.id,
        name: m.name,
        price: Number(m.price),
      }));
    }

    const basePrice = menuItem.discountPrice
      ? new Decimal(menuItem.discountPrice)
      : new Decimal(menuItem.price);
    const modifierTotal = resolvedModifiers.reduce((sum, m) => sum + m.price, 0);
    const unitPrice = basePrice.plus(modifierTotal);
    const totalPrice = unitPrice.times(data.quantity);

    const cartItem = await prisma.groupCartItem.create({
      data: {
        menuItemId: data.menuItemId,
        participantId,
        quantity: data.quantity,
        unitPrice,
        totalPrice,
        notes: data.notes,
        modifiers: resolvedModifiers,
      },
      include: {
        menuItem: {
          select: { id: true, name: true, price: true, discountPrice: true, image: true, dietType: true },
        },
      },
    });

    // Emit socket event
    socketEmitters.emitGroupCartUpdated(code.toUpperCase(), {
      code: code.toUpperCase(),
      participantId,
      participantName: participant.name,
      action: 'added',
      item: {
        id: cartItem.id,
        menuItemId: cartItem.menuItemId,
        quantity: cartItem.quantity,
        unitPrice: Number(cartItem.unitPrice),
        totalPrice: Number(cartItem.totalPrice),
        notes: cartItem.notes ?? undefined,
      },
    });

    return cartItem;
  },

  /**
   * Remove a cart item.
   */
  async removeCartItem(code: string, participantId: string, itemId: string) {
    const group = await this._validateOpenGroup(code);

    const item = await prisma.groupCartItem.findFirst({
      where: { id: itemId, participantId, participant: { groupOrderId: group.id } },
    });
    if (!item) throw AppError.notFound('Cart item');

    await prisma.groupCartItem.delete({ where: { id: itemId } });

    // Emit socket event
    const participant = await prisma.groupParticipant.findUnique({ where: { id: participantId }, select: { name: true } });
    socketEmitters.emitGroupCartUpdated(code.toUpperCase(), {
      code: code.toUpperCase(),
      participantId,
      participantName: participant?.name ?? '',
      action: 'removed',
      item: { id: itemId, menuItemId: item.menuItemId, quantity: 0, unitPrice: Number(item.unitPrice), totalPrice: 0 },
    });
  },

  /**
   * Update cart item quantity.
   */
  async updateCartItem(code: string, participantId: string, itemId: string, data: { quantity: number }) {
    const group = await this._validateOpenGroup(code);

    const item = await prisma.groupCartItem.findFirst({
      where: { id: itemId, participantId, participant: { groupOrderId: group.id } },
    });
    if (!item) throw AppError.notFound('Cart item');

    const unitPrice = new Decimal(item.unitPrice);
    const totalPrice = unitPrice.times(data.quantity);

    const updated = await prisma.groupCartItem.update({
      where: { id: itemId },
      data: { quantity: data.quantity, totalPrice },
      include: {
        menuItem: {
          select: { id: true, name: true, price: true, discountPrice: true, image: true },
        },
      },
    });

    // Emit socket event
    const participant = await prisma.groupParticipant.findUnique({ where: { id: participantId }, select: { name: true } });
    socketEmitters.emitGroupCartUpdated(code.toUpperCase(), {
      code: code.toUpperCase(),
      participantId,
      participantName: participant?.name ?? '',
      action: 'updated',
      item: {
        id: updated.id,
        menuItemId: updated.menuItemId,
        quantity: updated.quantity,
        unitPrice: Number(updated.unitPrice),
        totalPrice: Number(updated.totalPrice),
        notes: undefined,
      },
    });

    return updated;
  },

  /**
   * Mark a participant as ready.
   */
  async markReady(code: string, participantId: string) {
    const group = await this._validateOpenGroup(code);

    const participant = await prisma.groupParticipant.findFirst({
      where: { id: participantId, groupOrderId: group.id },
    });
    if (!participant) throw AppError.notFound('Participant');

    const updated = await prisma.groupParticipant.update({
      where: { id: participantId },
      data: { isReady: true },
    });

    // Emit socket event
    socketEmitters.emitGroupReady(code.toUpperCase(), {
      participantId,
      name: participant.name,
    });

    return updated;
  },

  /**
   * Host submits the combined order.
   * Collects all cart items from all participants, creates one Order via existing orderService.
   */
  async submit(code: string, participantId: string) {
    const group = await prisma.groupOrder.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        restaurant: { select: { id: true, taxRate: true, settings: true, slug: true } },
        table: { select: { id: true, sessionToken: true, branchId: true } },
        participants: {
          include: {
            cartItems: {
              include: {
                menuItem: {
                  select: { id: true, name: true, price: true },
                  },
              },
            },
          },
        },
      },
    });

    if (!group) throw AppError.notFound('Group order');
    if (group.status !== 'OPEN' && group.status !== 'LOCKED') {
      throw AppError.badRequest(`Cannot submit a group order with status: ${group.status}`);
    }

    // Verify caller is the host
    const host = group.participants.find((p: { id: string; isHost: boolean }) => p.id === participantId);
    if (!host || !host.isHost) {
      throw AppError.forbidden('Only the host can submit the group order');
    }

    // Check table session expiry before doing work
    if (group.tableId) {
      const activeSession = await prisma.tableSession.findFirst({
        where: { tableId: group.tableId, status: 'ACTIVE' },
        select: { id: true, status: true, expiresAt: true, lastActivityAt: true, createdAt: true },
      });
      if (activeSession && sessionService.isSessionExpired(activeSession)) {
        await sessionService.expireSession(activeSession.id);
        throw AppError.unauthorized('Session expired. Please scan the QR code at your table.');
      }
    }

    // Collect all cart items from all participants
    const allItems: { menuItemId: string; quantity: number; notes?: string; modifiers?: { modifierId: string }[] }[] = [];
    const participantNames: string[] = [];

    for (const p of group.participants) {
      if (p.cartItems.length > 0) {
        participantNames.push(p.name);
      }
      for (const ci of p.cartItems) {
        const mods = (ci.modifiers as any[]) || [];
        allItems.push({
          menuItemId: ci.menuItemId,
          quantity: ci.quantity,
          notes: ci.notes ? `[${p.name}] ${ci.notes}` : `[${p.name}]`,
          modifiers: mods.map((m: any) => ({ modifierId: m.modifierId })),
        });
      }
    }

    if (allItems.length === 0) {
      throw AppError.badRequest('No items in the group order');
    }

    // Lock the group before submitting
    await prisma.groupOrder.update({
      where: { id: group.id },
      data: { status: 'LOCKED' },
    });

    try {
      // Build the order input
      const customerName = `Group Order (${participantNames.join(', ')})`;
      const order = await orderService.createOrder(
        group.restaurantId,
        {
          tableId: group.tableId ?? undefined,
          // Use the current table session token (not the stale one from group creation)
          sessionToken: group.table?.sessionToken ?? group.sessionToken ?? undefined,
          items: allItems,
          customerName,
          customerPhone: group.hostPhone ?? undefined,
          notes: `Group order: ${group.participants.length} participants`,
        },
        { taxRate: group.restaurant.taxRate, settings: group.restaurant.settings },
      );

      // Mark group as submitted and link to the placed order
      await prisma.groupOrder.update({
        where: { id: group.id },
        data: { status: 'SUBMITTED', orderId: order.id },
      });

      // Rotate session token so old token can't be reused for another group order
      let newSessionToken: string | null = null;
      if (group.tableId) {
        try {
          const { tableService } = await import('./tableService.js');
          newSessionToken = await tableService.rotateSessionToken(group.tableId, group.restaurantId);
          logger.info({ tableId: group.tableId, groupCode: code }, 'Rotated session token after group order submit');
        } catch (err) {
          logger.error({ err, tableId: group.tableId }, 'Failed to rotate session token after group submit');
        }
      }

      // Emit socket event
      socketEmitters.emitGroupSubmitted(code.toUpperCase(), order.id);

      return { groupOrder: group, order, newSessionToken };
    } catch (err) {
      // Revert to OPEN on failure so host can retry
      await prisma.groupOrder.update({
        where: { id: group.id },
        data: { status: 'OPEN' },
      });
      throw err;
    }
  },

  /**
   * Cancel a group order (host only).
   */
  async cancel(code: string, participantId: string) {
    const group = await prisma.groupOrder.findUnique({
      where: { code: code.toUpperCase() },
      include: { participants: { where: { isHost: true }, select: { id: true } } },
    });

    if (!group) throw AppError.notFound('Group order');
    if (group.status === 'SUBMITTED') throw AppError.badRequest('Cannot cancel a submitted group order');

    const host = group.participants[0];
    if (!host || host.id !== participantId) {
      throw AppError.forbidden('Only the host can cancel the group order');
    }

    await prisma.groupOrder.update({
      where: { id: group.id },
      data: { status: 'CANCELLED' },
    });

    // Emit socket event
    socketEmitters.emitGroupCancelled(code.toUpperCase());
  },

  /**
   * Expire stale group orders (called on access or via cron).
   */
  async expireStale() {
    const result = await prisma.groupOrder.updateMany({
      where: {
        status: 'OPEN',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  },

  /**
   * Expire group orders for a specific table (called on session reset).
   */
  async expireByTable(tableId: string) {
    const result = await prisma.groupOrder.updateMany({
      where: {
        tableId,
        status: { in: ['OPEN', 'LOCKED'] },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  },

  // ─── Internal helpers ─────────────────────────────────────

  async _validateOpenGroup(code: string) {
    const group = await prisma.groupOrder.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true, status: true, expiresAt: true, restaurantId: true },
    });

    if (!group) throw AppError.notFound('Group order');
    if (group.status !== 'OPEN') {
      throw AppError.badRequest('This group order is no longer accepting changes');
    }
    if (group.expiresAt < new Date()) {
      await prisma.groupOrder.update({ where: { id: group.id }, data: { status: 'EXPIRED' } });
      throw AppError.badRequest('This group order has expired');
    }
    return group;
  },
};
