import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

/**
 * Origin-based CSRF protection for cookie-authenticated endpoints.
 *
 * Validates that the `Origin` (or `Referer`) header matches one of the
 * configured CORS origins.  This prevents cross-site form POSTs that
 * would automatically include HttpOnly cookies (e.g. refresh tokens).
 *
 * Safe methods (GET, HEAD, OPTIONS) are allowed through unconditionally.
 */
const allowedOrigins = new Set(
  config.cors.origin.map((o: string) => o.replace(/\/+$/, '')),
);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methods don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  // Determine the requesting origin
  let requestOrigin: string | undefined;
  if (origin) {
    requestOrigin = origin.replace(/\/+$/, '');
  } else if (referer) {
    try {
      const url = new URL(referer);
      requestOrigin = url.origin;
    } catch {
      // Malformed referer — reject
    }
  }

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    res.status(403).json({
      success: false,
      error: { code: 'CSRF_ERROR', message: 'Cross-site request blocked' },
    });
    return;
  }

  next();
}
