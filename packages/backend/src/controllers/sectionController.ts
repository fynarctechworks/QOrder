import { Request, Response, NextFunction } from 'express';
import { sectionService } from '../services/index.js';
import type { ApiResponse } from '../types/index.js';

export const sectionController = {
  async getSections(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const sections = await sectionService.getSections(req.restaurantId!, req.branchId);
      res.json({ success: true, data: sections });
    } catch (error) {
      next(error);
    }
  },

  async getSectionById(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const section = await sectionService.getSectionById(req.params.id, req.restaurantId!);
      res.json({ success: true, data: section });
    } catch (error) {
      next(error);
    }
  },

  async createSection(req: Request, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const section = await sectionService.createSection(req.restaurantId!, { ...req.body, branchId: req.branchId });
      res.status(201).json({ success: true, data: section });
    } catch (error) {
      next(error);
    }
  },

  async updateSection(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      const section = await sectionService.updateSection(req.params.id, req.restaurantId!, req.body);
      res.json({ success: true, data: section });
    } catch (error) {
      next(error);
    }
  },

  async deleteSection(req: Request<{ id: string }>, res: Response<ApiResponse>, next: NextFunction) {
    try {
      await sectionService.deleteSection(req.params.id, req.restaurantId!);
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  },
};
