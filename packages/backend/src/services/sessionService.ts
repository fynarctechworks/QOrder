import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { prisma, AppError, cache } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import type { PaymentMethod, SessionStatus } from '@prisma/client';

/** Session auto-expires after 90 minutes of total time */
const SESSION_MAX_DURATION_MS = 90 * 60 * 1000;
/** Session auto-expires after 15 minutes of inactivity */
const SESSION_INACTIVITY_MS = 15 * 60 * 1000;

interface BillItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: Array<{ name: string; price: number }>;
  notes?: string;
}

/** Group identical items (same name + same modifiers) to reduce bill clutter */
function groupBillItems(items: BillItem[]): BillItem[] {
  const map = new Map<string, BillItem>();
  for (const item of items) {
    const modKey = item.modifiers
      .map((m) => `${m.name}:${m.price}`)
      .sort()
      .join('|');
    const key = `${item.name}::${modKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalPrice += item.totalPrice;
    } else {
      map.set(key, { ...item, modifiers: [...item.modifiers] });
    }
  }
  return Array.from(map.values());
}

export const sessionService = {
  /**
   * Get or create an ACTIVE session for a table
   */
  async getOrCreateSession(tableId: string, restaurantId: string) {
    // Check if table exists and belongs to restaurant
    const table = await prisma.table.findFirst({
      where: { id: tableId, restaurantId },
      select: { id: true, branchId: true, status: true, sessionToken: true },
    });

    if (!table) {
      throw AppError.notFound('Table');
    }

    // Try to find existing ACTIVE session
    let session = await prisma.tableSession.findFirst({
      where: {
        tableId,
        status: 'ACTIVE',
      },
      include: {
        table: true,
        orders: {
          include: {
            items: {
              include: {
                menuItem: { select: { id: true, name: true, price: true, image: true } },
                modifiers: true,
              },
            },
          },
        },
        payments: true,
      },
    });

    // Create new session if none exists
    if (!session) {
      try {
        const now = new Date();
        session = await prisma.tableSession.create({
          data: {
            tableId,
            restaurantId,
            branchId: table.branchId ?? undefined,
            status: 'ACTIVE',
            expiresAt: new Date(now.getTime() + SESSION_MAX_DURATION_MS),
            lastActivityAt: now,
          },
          include: {
            table: true,
            orders: {
              include: {
                items: {
                  include: {
                    menuItem: { select: { id: true, name: true, price: true, image: true } },
                    modifiers: true,
                  },
                },
              },
            },
            payments: true,
          },
        });

        // Update table status to OCCUPIED
        await prisma.table.update({
          where: { id: tableId },
          data: { status: 'OCCUPIED' },
        });

        // Invalidate tables cache so new session is visible immediately
        await cache.del(cache.keys.tables(restaurantId)).catch(() => {});
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2002') {
          // Race condition: another request already created the session
          session = await prisma.tableSession.findFirst({
            where: { tableId, status: 'ACTIVE' },
            include: {
              table: true,
              orders: {
                include: {
                  items: {
                    include: {
                      menuItem: { select: { id: true, name: true, price: true, image: true } },
                      modifiers: true,
                    },
                  },
                },
              },
              payments: true,
            },
          });
          if (!session) throw AppError.internal('Failed to create or find session');
        } else {
          throw err;
        }
      }
    }

    // Adopt orphaned orders: orders linked to this table but not in this session.
    // Include COMPLETED orders so that orders from a previously-closed session
    // (closed when the last order was completed) are picked up for settlement.
    // Use OR to also catch orders with sessionId = null (SQL NULL != value is UNKNOWN, not TRUE)
    const orphanSessionFilter: Array<Record<string, unknown>> = [
      { sessionId: null },
    ];
    // Also adopt orders from the most recently closed session (if any) —
    // this handles the case where the session was auto-closed when all orders completed,
    // and the admin then opens the Settle Payment dialog.
    const lastClosedSession = await prisma.tableSession.findFirst({
      where: { tableId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      select: { id: true },
    });
    if (lastClosedSession) {
      orphanSessionFilter.push({ sessionId: lastClosedSession.id });
    }

    const orphanedOrders = await prisma.order.findMany({
      where: {
        tableId,
        OR: orphanSessionFilter,
        status: { notIn: ['CANCELLED'] },
      },
      select: { id: true },
    });

    if (orphanedOrders.length > 0) {
      await prisma.order.updateMany({
        where: { id: { in: orphanedOrders.map((o) => o.id) } },
        data: { sessionId: session.id },
      });
    }

    // Recalculate session totals and re-fetch with correct data
    await this.recalculateSessionTotals(session.id);

    const updated = await prisma.tableSession.findUnique({
      where: { id: session.id },
      include: {
        table: true,
        orders: {
          where: { status: { notIn: ['CANCELLED'] } },
          include: {
            items: {
              include: {
                menuItem: { select: { id: true, name: true, price: true, image: true } },
                modifiers: true,
              },
            },
          },
        },
        payments: true,
      },
    });
    if (updated) session = updated;

    return session;
  },

  /**
   * Touch a session to extend its activity timestamp and expiry.
   * Called after successful order creation or significant user activity.
   */
  async touchSession(sessionId: string) {
    const now = new Date();
    try {
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: {
          lastActivityAt: now,
          expiresAt: new Date(now.getTime() + SESSION_MAX_DURATION_MS),
        },
      });
    } catch (err) {
      logger.error({ sessionId, error: err }, 'Failed to touch session');
    }
  },

  /**
   * Check whether a session is expired (hard expiry or inactivity).
   * Returns true if session should be considered expired.
   */
  isSessionExpired(session: {
    status: string;
    expiresAt: Date | null;
    lastActivityAt: Date | null;
    createdAt: Date;
  }): boolean {
    if (session.status !== 'ACTIVE') return true;

    const now = Date.now();

    // Hard expiry check
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= now) {
      return true;
    }

    // Inactivity check
    const lastActivity = session.lastActivityAt
      ? new Date(session.lastActivityAt).getTime()
      : new Date(session.createdAt).getTime();
    if (now - lastActivity >= SESSION_INACTIVITY_MS) {
      return true;
    }

    return false;
  },

  /**
   * Expire (close) a single session — sets status CLOSED and table AVAILABLE.
   */
  async expireSession(sessionId: string) {
    try {
      const session = await prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED' },
        select: { tableId: true },
      });
      if (session.tableId) {
        await prisma.table.update({
          where: { id: session.tableId },
          data: { status: 'AVAILABLE' },
        });
      }
      logger.info({ sessionId }, 'Session expired');
    } catch (err) {
      logger.error({ sessionId, error: err }, 'Failed to expire session');
    }
  },

  /**
   * Bulk-expire all stale ACTIVE sessions (hard expiry or inactivity).
   * Designed to be called periodically (e.g. every 5 minutes).
   */
  async expireStaleSessions() {
    const now = new Date();
    const inactivityCutoff = new Date(now.getTime() - SESSION_INACTIVITY_MS);

    try {
      const staleSessions = await prisma.tableSession.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { expiresAt: { lte: now } },
            { lastActivityAt: { lte: inactivityCutoff } },
          ],
        },
        select: { id: true, tableId: true },
      });

      if (staleSessions.length === 0) return;

      logger.info(`Expiring ${staleSessions.length} stale sessions`);

      // Close sessions and free tables in a transaction
      await prisma.$transaction([
        prisma.tableSession.updateMany({
          where: { id: { in: staleSessions.map((s) => s.id) } },
          data: { status: 'CLOSED' },
        }),
        ...staleSessions
          .filter((s) => s.tableId !== null)
          .map((s) =>
            prisma.table.update({
              where: { id: s.tableId! },
              data: { status: 'AVAILABLE' },
            })
          ),
      ]);
    } catch (err) {
      logger.error({ error: err }, 'Failed to expire stale sessions');
    }
  },

  /**
   * Get session by ID with full details
   */
  async getSessionById(sessionId: string, restaurantId: string) {
    const session = await prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId },
      include: {
        table: true,
        orders: {
          include: {
            items: {
              include: {
                menuItem: true,
                modifiers: true,
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!session) {
      throw AppError.notFound('Session');
    }

    return session;
  },

  /**
   * Recalculate session totals from orders
   */
  async recalculateSessionTotals(sessionId: string) {
    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        orders: {
          where: {
            status: { notIn: ['CANCELLED'] },
          },
        },
      },
    });

    if (!session) {
      throw AppError.notFound('Session');
    }

    const subtotal = session.orders.reduce(
      (sum, order) => sum.add(new Decimal(order.subtotal.toString())),
      new Decimal(0)
    );

    const tax = session.orders.reduce(
      (sum, order) => sum.add(new Decimal(order.tax.toString())),
      new Decimal(0)
    );

    const totalAmount = session.orders.reduce(
      (sum, order) => sum.add(new Decimal(order.total.toString())),
      new Decimal(0)
    );

    await prisma.tableSession.update({
      where: { id: sessionId },
      data: {
        subtotal,
        tax,
        totalAmount,
      },
    });

    return { subtotal, tax, totalAmount };
  },

  /**
   * Add split payment to session
   */
  async addPayment({
    sessionId,
    amount,
    method,
    restaurantId,
    reference,
    notes,
  }: {
    sessionId: string;
    amount: number;
    method: PaymentMethod;
    restaurantId: string;
    reference?: string;
    notes?: string;
  }) {
    return await prisma.$transaction(async (tx) => {
      // Get session with payments
      const session = await tx.tableSession.findFirst({
        where: { id: sessionId, restaurantId },
        include: { payments: true },
      });

      if (!session) {
        throw AppError.notFound('Session');
      }

      if (session.status !== 'ACTIVE') {
        throw AppError.badRequest('Session is not active');
      }

      // Calculate remaining balance
      const totalPaid = session.payments
        .filter((p) => p.status === 'COMPLETED')
        .reduce((sum, p) => sum.add(new Decimal(p.amount.toString())), new Decimal(0));

      const remaining = new Decimal(session.totalAmount.toString()).sub(totalPaid);

      // Validate payment amount
      if (amount <= 0) {
        throw AppError.badRequest('Payment amount must be greater than 0');
      }

      if (new Decimal(amount).gt(remaining)) {
        throw AppError.badRequest(
          `Payment amount (${amount}) exceeds remaining balance (${remaining.toString()})`
        );
      }

      // Create payment
      const payment = await tx.payment.create({
        data: {
          sessionId,
          restaurantId,
          branchId: session.branchId ?? undefined,
          amount: new Decimal(amount),
          method,
          status: 'COMPLETED',
          reference,
          notes,
        },
      });

      // Check if fully paid
      const newTotalPaid = totalPaid.add(new Decimal(amount));
      const isFullyPaid = newTotalPaid.gte(new Decimal(session.totalAmount.toString()));

      let newSessionToken: string | null = null;
      if (isFullyPaid) {
        // Close session
        await tx.tableSession.update({
          where: { id: sessionId },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
          },
        });

        // Mark all active orders as COMPLETED
        await tx.order.updateMany({
          where: {
            sessionId,
            status: { in: ['PENDING', 'PREPARING', 'READY', 'PAYMENT_PENDING'] },
          },
          data: { status: 'COMPLETED' },
        });

        // Update table status to AVAILABLE
        if (session.tableId) {
          newSessionToken = uuidv4();
          await tx.table.update({
            where: { id: session.tableId },
            data: { status: 'AVAILABLE', sessionToken: newSessionToken },
          });
        }
      }

      return { payment, isFullyPaid, remaining: remaining.sub(new Decimal(amount)), session: { tableId: session.tableId }, newSessionToken };
    });
  },

  /**
   * Transfer session to another table
   */
  async transferSession({
    sessionId,
    targetTableId,
    restaurantId,
  }: {
    sessionId: string;
    targetTableId: string;
    restaurantId: string;
  }) {
    return await prisma.$transaction(async (tx) => {
      // Get source session
      const session = await tx.tableSession.findFirst({
        where: { id: sessionId, restaurantId },
      });

      if (!session) {
        throw AppError.notFound('Session');
      }

      if (session.status !== 'ACTIVE') {
        throw AppError.badRequest('Session is not active');
      }

      // Validate target table
      const targetTable = await tx.table.findFirst({
        where: { id: targetTableId, restaurantId },
      });

      if (!targetTable) {
        throw AppError.notFound('Target table');
      }

      // Check if target table already has an active session
      const existingSession = await tx.tableSession.findFirst({
        where: {
          tableId: targetTableId,
          status: 'ACTIVE',
        },
      });

      if (existingSession) {
        throw AppError.badRequest('Target table already has an active session');
      }

      // Transfer session
      const updatedSession = await tx.tableSession.update({
        where: { id: sessionId },
        data: {
          tableId: targetTableId,
          status: 'TRANSFERRED',
        },
      });

      // Create new session at target table
      const newSession = await tx.tableSession.create({
        data: {
          tableId: targetTableId,
          restaurantId,
          branchId: targetTable.branchId ?? undefined,
          status: 'ACTIVE',
          totalAmount: session.totalAmount,
          subtotal: session.subtotal,
          tax: session.tax,
        },
      });

      // Move all orders to new session
      await tx.order.updateMany({
        where: { sessionId },
        data: { sessionId: newSession.id, tableId: targetTableId },
      });

      // Move all payments to new session
      await tx.payment.updateMany({
        where: { sessionId },
        data: { sessionId: newSession.id },
      });

      // Update table statuses
      let newSessionToken: string | null = null;
      if (session.tableId) {
        newSessionToken = uuidv4();
        await tx.table.update({
          where: { id: session.tableId },
          data: { status: 'AVAILABLE', sessionToken: newSessionToken },
        });
      }

      await tx.table.update({
        where: { id: targetTableId },
        data: { status: 'OCCUPIED' },
      });

      return { oldSession: updatedSession, newSession, oldTableId: session.tableId, newSessionToken };
    });
  },

  /**
   * Merge two sessions
   */
  async mergeSessions({
    sourceSessionId,
    targetSessionId,
    restaurantId,
  }: {
    sourceSessionId: string;
    targetSessionId: string;
    restaurantId: string;
  }) {
    return await prisma.$transaction(async (tx) => {
      // Get both sessions
      const [sourceSession, targetSession] = await Promise.all([
        tx.tableSession.findFirst({
          where: { id: sourceSessionId, restaurantId },
          include: { orders: true, payments: true },
        }),
        tx.tableSession.findFirst({
          where: { id: targetSessionId, restaurantId },
          include: { orders: true, payments: true },
        }),
      ]);

      if (!sourceSession || !targetSession) {
        throw AppError.notFound('Session');
      }

      if (sourceSession.status !== 'ACTIVE' || targetSession.status !== 'ACTIVE') {
        throw AppError.badRequest('Both sessions must be active');
      }

      // Move all orders from source to target
      await tx.order.updateMany({
        where: { sessionId: sourceSessionId },
        data: { sessionId: targetSessionId, tableId: targetSession.tableId },
      });

      // Move all payments from source to target
      await tx.payment.updateMany({
        where: { sessionId: sourceSessionId },
        data: { sessionId: targetSessionId },
      });

      // Calculate new totals
      const newSubtotal = new Decimal(sourceSession.subtotal.toString()).add(
        new Decimal(targetSession.subtotal.toString())
      );
      const newTax = new Decimal(sourceSession.tax.toString()).add(
        new Decimal(targetSession.tax.toString())
      );
      const newTotal = new Decimal(sourceSession.totalAmount.toString()).add(
        new Decimal(targetSession.totalAmount.toString())
      );

      // Update target session with new totals
      const updatedTargetSession = await tx.tableSession.update({
        where: { id: targetSessionId },
        data: {
          subtotal: newSubtotal,
          tax: newTax,
          totalAmount: newTotal,
        },
      });

      // Mark source session as merged
      await tx.tableSession.update({
        where: { id: sourceSessionId },
        data: {
          status: 'MERGED',
          mergedIntoId: targetSessionId,
          closedAt: new Date(),
        },
      });

      // Update source table status
      let newSessionToken: string | null = null;
      if (sourceSession.tableId) {
        newSessionToken = uuidv4();
        await tx.table.update({
          where: { id: sourceSession.tableId },
          data: { status: 'AVAILABLE', sessionToken: newSessionToken },
        });
      }

      return {
        mergedSession: updatedTargetSession,
        sourceTableId: sourceSession.tableId,
        targetTableId: targetSession.tableId,
        newSessionToken,
      };
    });
  },

  /**
   * Get print-ready invoice data
   */
  async getPrintInvoice(sessionId: string, restaurantId: string) {
    const session = await this.getSessionById(sessionId, restaurantId);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw AppError.notFound('Restaurant');
    }

    // Calculate totals
    const totalPaid = session.payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const remaining = Number(session.totalAmount) - totalPaid;

    return {
      invoiceNumber: session.invoiceId || session.id.slice(0, 8).toUpperCase(),
      restaurant: {
        name: restaurant.name,
        address: restaurant.address,
        phone: restaurant.phone,
        email: restaurant.email,
      },
      table: session.table
        ? { number: session.table.number, name: session.table.name }
        : { number: 'N/A', name: 'Unknown' },
      date: session.startedAt,
      items: groupBillItems(session.orders.flatMap((order) =>
        order.items.map((item) => ({
          name: item.menuItem?.name ?? 'Deleted Item',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          modifiers: item.modifiers.map((mod) => ({
            name: mod.name,
            price: Number(mod.price),
          })),
          notes: item.notes ?? undefined,
        }))
      )),
      subtotal: Number(session.subtotal),
      tax: Number(session.tax),
      total: Number(session.totalAmount),
      payments: session.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        status: p.status,
        createdAt: p.createdAt,
      })),
      totalPaid,
      remaining,
    };
  },
};
