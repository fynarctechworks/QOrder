import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middlewares/upload.js';
import { authenticate } from '../middlewares/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Upload single image
router.post(
  '/image',
  authenticate,
  upload.single('image'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Rename file to include restaurant prefix for ownership tracking
      const restaurantId = req.user!.restaurantId;
      const originalPath = req.file.path;
      const prefixedFilename = `${restaurantId}_${req.file.filename}`;
      const newPath = path.join(path.dirname(originalPath), prefixedFilename);
      fs.renameSync(originalPath, newPath);

      // Return the URL path to access the image
      const imageUrl = `/uploads/${prefixedFilename}`;
      
      logger.info({ filename: prefixedFilename, restaurantId }, 'Image uploaded successfully');

      res.json({
        imageUrl,
        filename: prefixedFilename,
      });
    } catch (error) {
      logger.error({ error }, 'Image upload error');
      next(error);
    }
  }
);

// Delete image
router.delete('/image/:filename', authenticate, (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    if (!filename) {
      res.status(400).json({ message: 'Filename is required' });
      return;
    }
    // Sanitize filename to prevent path traversal attacks
    const safeFilename = path.basename(filename);

    // Ownership check: file must be prefixed with the user's restaurantId
    const restaurantId = req.user!.restaurantId;
    if (!safeFilename.startsWith(`${restaurantId}_`)) {
      logger.warn({ filename: safeFilename, restaurantId, userId: req.user?.id }, 'Unauthorized image delete attempt');
      res.status(403).json({ message: 'Not authorized to delete this file' });
      return;
    }

    // Verify file is within the uploads directory (prevent traversal)
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    const resolvedPath = path.resolve(uploadsDir, safeFilename);
    if (!resolvedPath.startsWith(uploadsDir)) {
      logger.warn({ filename: safeFilename, restaurantId: req.restaurantId, userId: req.user?.id }, 'Path traversal attempt in image delete');
      res.status(400).json({ message: 'Invalid filename' });
      return;
    }

    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
      logger.info({ filename: safeFilename, restaurantId: req.restaurantId, userId: req.user?.id }, 'Image deleted successfully');
      res.json({ message: 'Image deleted successfully' });
    } else {
      res.status(404).json({ message: 'Image not found' });
    }
  } catch (error) {
    logger.error({ error, restaurantId: req.restaurantId, userId: req.user?.id }, 'Image deletion error');
    res.status(500).json({ message: 'Failed to delete image' });
  }
});

export default router;
