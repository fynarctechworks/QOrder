import { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/index.js';
import { getIO } from '../socket/index.js';
import type { ApiResponse } from '../types/index.js';
import type { PaymentMethod } from '@prisma/client';

export const sessionController = {
  /**
   * Get or create session for a table
   */
  async getOrCreateSession(
    req: Request<{ tableId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const session = await sessionService.getOrCreateSession(
        req.params.tableId,
        restaurantId
      );

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get session by ID
   */
  async getSession(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const session = await sessionService.getSessionById(req.params.id, restaurantId);

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Add split payment
   */
  async addPayment(
    req: Request<
      { id: string },
      unknown,
      { amount: number; method: PaymentMethod; reference?: string; notes?: string }
    >,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const { amount, method, reference, notes } = req.body;

      const result = await sessionService.addPayment({
        sessionId: req.params.id,
        amount,
        method,
        restaurantId,
        reference,
        notes,
      });

      // Emit socket event
      const io = getIO();
      if (io) {
        io.to(`restaurant:${restaurantId}`).emit('session:updated', {
          sessionId: req.params.id,
          isFullyPaid: result.isFullyPaid,
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Transfer session to another table
   */
  async transferSession(
    req: Request<{ id: string }, unknown, { targetTableId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const { targetTableId } = req.body;

      const result = await sessionService.transferSession({
        sessionId: req.params.id,
        targetTableId,
        restaurantId,
      });

      // Emit socket events for both tables
      const io = getIO();
      if (io) {
        if (result.oldTableId) {
          io.to(`restaurant:${restaurantId}`).emit('table:updated', {
            tableId: result.oldTableId,
          });
        }
        io.to(`restaurant:${restaurantId}`).emit('table:updated', {
          tableId: targetTableId,
        });
        io.to(`restaurant:${restaurantId}`).emit('session:updated', {
          sessionId: result.newSession.id,
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Merge two sessions
   */
  async mergeSessions(
    req: Request<unknown, unknown, { sourceSessionId: string; targetSessionId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const { sourceSessionId, targetSessionId } = req.body;

      const result = await sessionService.mergeSessions({
        sourceSessionId,
        targetSessionId,
        restaurantId,
      });

      // Emit socket events
      const io = getIO();
      if (io) {
        if (result.sourceTableId) {
          io.to(`restaurant:${restaurantId}`).emit('table:updated', {
            tableId: result.sourceTableId,
          });
        }
        if (result.targetTableId) {
          io.to(`restaurant:${restaurantId}`).emit('table:updated', {
            tableId: result.targetTableId,
          });
        }
        io.to(`restaurant:${restaurantId}`).emit('session:updated', {
          sessionId: targetSessionId,
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get print-ready invoice
   */
  async getPrintInvoice(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const invoice = await sessionService.getPrintInvoice(req.params.id, restaurantId);

      res.json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  },
};
