import { Request, Response, NextFunction } from 'express';
import { tableService } from '../services/index.js';
import type { ApiResponse } from '../types/index.js';
import type { CreateTableInput, UpdateTableInput } from '../validators/index.js';
import type { TableStatus } from '@prisma/client';

export const tableController = {
  async getTables(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const tables = await tableService.getTables(restaurantId);

      res.json({
        success: true,
        data: tables,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTableById(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const table = await tableService.getTableById(req.params.id, restaurantId);

      res.json({
        success: true,
        data: table,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTableByQRCode(
    req: Request<{ qrCode: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const table = await tableService.getTableByQRCode(req.params.qrCode);

      res.json({
        success: true,
        data: table,
      });
    } catch (error) {
      next(error);
    }
  },

  async createTable(
    req: Request<unknown, unknown, CreateTableInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const table = await tableService.createTable(restaurantId, req.body);

      res.status(201).json({
        success: true,
        data: table,
      });
    } catch (error) {
      next(error);
    }
  },

  async createBulkTables(
    req: Request<unknown, unknown, { count: number; startNumber?: number; capacity?: number }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const { count, startNumber = 1, capacity = 4 } = req.body;
      
      const result = await tableService.createBulkTables(
        restaurantId, 
        count, 
        startNumber, 
        capacity
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateTable(
    req: Request<{ id: string }, unknown, UpdateTableInput>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const table = await tableService.updateTable(
        req.params.id, 
        restaurantId, 
        req.body
      );

      res.json({
        success: true,
        data: table,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateTableStatus(
    req: Request<{ id: string }, unknown, { status: TableStatus }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const table = await tableService.updateTableStatus(
        req.params.id, 
        restaurantId, 
        req.body.status
      );

      res.json({
        success: true,
        data: table,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteTable(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      await tableService.deleteTable(req.params.id, restaurantId);

      res.json({
        success: true,
        data: { message: 'Table deleted' },
      });
    } catch (error) {
      next(error);
    }
  },

  async regenerateQRCode(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const table = await tableService.regenerateQRCode(req.params.id, restaurantId);

      res.json({
        success: true,
        data: table,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTableStats(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const stats = await tableService.getTableStats(restaurantId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getRunningTables(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const runningTables = await tableService.getRunningTables(restaurantId);

      res.json({
        success: true,
        data: runningTables,
      });
    } catch (error) {
      next(error);
    }
  },

  async getPublicTable(
    req: Request<{ id: string; tableId: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const table = await tableService.getTableById(req.params.tableId, req.params.id);

      res.json({
        success: true,
        data: table,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTableOrders(
    req: Request<{ id: string }>,
    res: Response<ApiResponse>,
    next: NextFunction
  ) {
    try {
      const restaurantId = req.restaurantId!;
      const data = await tableService.getTableOrders(req.params.id, restaurantId);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },
};
