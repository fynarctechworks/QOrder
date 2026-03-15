import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { upload } from '../middlewares/upload.js';
import { prisma, AppError } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/tv-slides — list slides for the restaurant (branch-aware)
router.get('/', resolveBranch, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurantId = req.restaurantId!;
    const branchId = req.branchId ?? null;

    const where: Record<string, unknown> = { restaurantId };
    if (branchId) {
      where.OR = [{ branchId }, { branchId: null }];
    }

    const slides = await prisma.tVMenuSlide.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    res.json({ success: true, data: slides });
  } catch (error) {
    next(error);
  }
});

// POST /api/tv-slides — upload a new slide image
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  upload.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw AppError.badRequest('No image file uploaded');
      }

      const restaurantId = req.restaurantId!;
      const branchId = (req.body.branchId as string) || null;

      // Rename file with restaurant prefix for ownership tracking
      const originalPath = req.file.path;
      const prefixedFilename = `${restaurantId}_${req.file.filename}`;
      const newPath = path.join(path.dirname(originalPath), prefixedFilename);
      fs.renameSync(originalPath, newPath);

      const imageUrl = `/uploads/${prefixedFilename}`;

      // Get next sort order
      const maxSort = await prisma.tVMenuSlide.aggregate({
        where: { restaurantId },
        _max: { sortOrder: true },
      });
      const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

      const slide = await prisma.tVMenuSlide.create({
        data: {
          imageUrl,
          sortOrder,
          restaurantId,
          branchId,
        },
      });

      logger.info({ slideId: slide.id, restaurantId }, 'TV menu slide uploaded');

      res.status(201).json({ success: true, data: slide });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/tv-slides/reorder — reorder slides
router.patch(
  '/reorder',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.restaurantId!;
      const { slideIds } = req.body as { slideIds: string[] };

      if (!Array.isArray(slideIds) || slideIds.length === 0) {
        throw AppError.badRequest('slideIds array is required');
      }

      await prisma.$transaction(
        slideIds.map((id, index) =>
          prisma.tVMenuSlide.updateMany({
            where: { id, restaurantId },
            data: { sortOrder: index },
          })
        )
      );

      res.json({ success: true, data: { reordered: slideIds.length } });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/tv-slides/:id — toggle active state
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.restaurantId!;
      const { id } = req.params;
      const { isActive } = req.body as { isActive?: boolean };

      const slide = await prisma.tVMenuSlide.findFirst({
        where: { id, restaurantId },
      });

      if (!slide) {
        throw AppError.notFound('Slide not found');
      }

      const updated = await prisma.tVMenuSlide.update({
        where: { id },
        data: { isActive: isActive ?? !slide.isActive },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/tv-slides/:id — delete a slide and its file
router.delete(
  '/:id',
  authorize('OWNER', 'ADMIN', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.restaurantId!;
      const { id } = req.params;

      const slide = await prisma.tVMenuSlide.findFirst({
        where: { id, restaurantId },
      });

      if (!slide) {
        throw AppError.notFound('Slide not found');
      }

      // Delete from DB
      await prisma.tVMenuSlide.delete({ where: { id } });

      // Delete file from disk
      const filename = path.basename(slide.imageUrl);
      const uploadsDir = path.resolve(__dirname, '../../uploads');
      const filePath = path.resolve(uploadsDir, filename);
      if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      logger.info({ slideId: id, restaurantId }, 'TV menu slide deleted');

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
