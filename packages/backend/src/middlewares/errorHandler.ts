import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';
import type { ApiResponse } from '../types/index.js';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void => {
  // Structured logging — always log errors
  if (err instanceof AppError) {
    logger.warn({ statusCode: err.statusCode, code: err.code, err }, err.message);
  } else {
    logger.error({ err }, 'Unhandled error');
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_ENTRY',
            message: 'A record with this value already exists',
            details: config.isDevelopment ? err.meta : undefined,
          },
        });
        return;
      case 'P2025': // Record not found
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Record not found',
          },
        });
        return;
      case 'P2003': // Foreign key constraint violation
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Referenced record does not exist',
          },
        });
        return;
      default:
        res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Database error occurred',
          },
        });
        return;
    }
  }

  // Handle Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid data provided',
      },
    });
    return;
  }

  // Handle operational errors (AppError)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Handle unknown errors
  logger.error({ err }, 'Unhandled error in error handler');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction
        ? 'An unexpected error occurred'
        : err.message || 'Unknown error',
    },
  });
};

// 404 handler
export const notFoundHandler = (
  req: Request,
  res: Response<ApiResponse>
): void => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};
