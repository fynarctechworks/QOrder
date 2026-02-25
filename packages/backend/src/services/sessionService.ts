import { Decimal } from '@prisma/client/runtime/library';
import { prisma, AppError, cache } from '../lib/index.js';
import type { PaymentMethod, SessionStatus } from '@prisma/client';

export const sessionService = {
  /**
   * Get or create an ACTIVE session for a table
   */
  async getOrCreateSession(tableId: string, restaurantId: string) {
    // Check if table exists and belongs to restaurant
    const table = await prisma.table.findFirst({
      where: { id: tableId, restaurantId },
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
        session = await prisma.tableSession.create({
          data: {
            tableId,
            restaurantId,
            status: 'ACTIVE',
          },
          include: {
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

    return session;
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

      if (isFullyPaid) {
        // Close session
        await tx.tableSession.update({
          where: { id: sessionId },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
          },
        });

        // Update table status to AVAILABLE
        if (session.tableId) {
          await tx.table.update({
            where: { id: session.tableId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      return { payment, isFullyPaid, remaining: remaining.sub(new Decimal(amount)) };
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
      if (session.tableId) {
        await tx.table.update({
          where: { id: session.tableId },
          data: { status: 'AVAILABLE' },
        });
      }

      await tx.table.update({
        where: { id: targetTableId },
        data: { status: 'OCCUPIED' },
      });

      return { oldSession: updatedSession, newSession, oldTableId: session.tableId };
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
      if (sourceSession.tableId) {
        await tx.table.update({
          where: { id: sourceSession.tableId },
          data: { status: 'AVAILABLE' },
        });
      }

      return {
        mergedSession: updatedTargetSession,
        sourceTableId: sourceSession.tableId,
        targetTableId: targetSession.tableId,
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
      items: session.orders.flatMap((order) =>
        order.items.map((item) => ({
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          modifiers: item.modifiers.map((mod) => ({
            name: mod.name,
            price: Number(mod.price),
          })),
          notes: item.notes,
        }))
      ),
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
