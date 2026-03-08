/**
 * Geo-fence validation middleware.
 *
 * Validates that the customer's device is within the restaurant's
 * configured radius before allowing order placement.
 *
 * Uses the Haversine formula — pure math, zero dependencies.
 */
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/index.js';
import { logger } from '../lib/logger.js';

// ─── Haversine distance (meters) ────────────────────────────
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Cache restaurant geo data for 5 minutes (in-memory) ───
const geoCache = new Map<string, { lat: number; lng: number; radius: number; ts: number } | null>();
const GEO_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getRestaurantGeo(restaurantId: string) {
  const cached = geoCache.get(restaurantId);
  if (cached !== undefined && Date.now() - (cached?.ts ?? 0) < GEO_CACHE_TTL) {
    return cached;
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { latitude: true, longitude: true, geoFenceRadius: true },
  });

  if (!restaurant || restaurant.latitude == null || restaurant.longitude == null) {
    geoCache.set(restaurantId, null);
    return null;
  }

  const entry = {
    lat: restaurant.latitude,
    lng: restaurant.longitude,
    radius: restaurant.geoFenceRadius,
    ts: Date.now(),
  };
  geoCache.set(restaurantId, entry);
  return entry;
}

/**
 * Express middleware — validates customer coordinates against restaurant geo-fence.
 *
 * Expects:
 *   - `req.restaurantId` (set by `resolveRestaurant` middleware)
 *   - `req.body.latitude` / `req.body.longitude` (sent by customer app)
 *
 * If the restaurant has no geo-fence configured (lat/lng null), the check is skipped.
 * If the customer doesn't send coordinates but the restaurant has geo-fence → 403.
 */
export function validateGeoFence(req: Request, res: Response, next: NextFunction) {
  const restaurantId = (req as any).restaurantId as string | undefined;

  if (!restaurantId) {
    // No restaurant resolved yet — skip (shouldn't happen if middleware order is correct)
    return next();
  }

  getRestaurantGeo(restaurantId)
    .then((geo) => {
      // Restaurant has no geo-fence configured — skip validation entirely
      if (!geo) {
        return next();
      }

      const { latitude, longitude } = req.body as { latitude?: number; longitude?: number };

      // Customer didn't send coordinates
      if (latitude == null || longitude == null) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'GEO_REQUIRED',
            message: 'Location access is required to place a dine-in order. Please enable location permissions.',
          },
        });
      }

      // Validate coordinates are sane
      if (
        typeof latitude !== 'number' || typeof longitude !== 'number' ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'GEO_INVALID',
            message: 'Invalid location coordinates.',
          },
        });
      }

      const distance = haversineDistance(geo.lat, geo.lng, latitude, longitude);

      if (distance > geo.radius) {
        logger.warn(
          { restaurantId, distance: Math.round(distance), radius: geo.radius, lat: latitude, lng: longitude },
          'Geo-fence rejection: customer outside restaurant radius',
        );
        return res.status(403).json({
          success: false,
          error: {
            code: 'GEO_OUTSIDE',
            message: 'You must be inside the restaurant to place an order. Please visit us to order.',
          },
        });
      }

      // ✅ Within radius — proceed
      next();
    })
    .catch((err) => {
      // On error, log and allow request (geo issues shouldn't block orders entirely)
      // but warn admins via logging
      logger.error({ err, restaurantId }, 'Geo-fence check failed — allowing request (service degradation)');
      next();
    });
}

/** Clear cached geo data (call when restaurant settings are updated) */
export function clearGeoCache(restaurantId: string) {
  geoCache.delete(restaurantId);
}
