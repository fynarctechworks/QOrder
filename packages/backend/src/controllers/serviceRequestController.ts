import { Request, Response, NextFunction } from 'express';
import { serviceRequestService } from '../services/serviceRequestService.js';
import { getIO } from '../socket/index.js';
import type { ApiResponse } from '../types/index.js';

export const serviceRequestController = {
  // ─── Customer creates a service request ───
  async create(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const { restaurantId } = req.params;
      const { tableId, type, message } = req.body;

      const request = await serviceRequestService.create(restaurantId!, tableId, type, message);

      // Notify admin via socket
      const io = getIO();
      if (io) {
        const table = (request as any).table;
        io.to(`restaurant:${restaurantId}`).emit('service:request', {
          id: request.id,
          type: request.type,
          tableId: request.tableId,
          tableName: table?.name || table?.number || 'Unknown',
          tableNumber: table?.number,
          sectionName: table?.section?.name,
          message: request.message,
        });
      }

      res.status(201).json({ success: true, data: request });
    } catch (err) { next(err); }
  },

  // ─── Admin acknowledges ───
  async acknowledge(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const result = await serviceRequestService.acknowledge(req.params.id!, req.user!.restaurantId);

      // Notify customer's table
      const io = getIO();
      if (io) {
        io.to(`table:${result.tableId}`).emit('service:acknowledged', { id: result.id, type: result.type });
      }

      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  // ─── Admin resolves ───
  async resolve(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const result = await serviceRequestService.resolve(req.params.id!, req.user!.restaurantId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  // ─── Admin lists pending ───
  async listPending(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const requests = await serviceRequestService.listPending(req.user!.restaurantId);
      res.json({ success: true, data: requests });
    } catch (err) { next(err); }
  },
};
