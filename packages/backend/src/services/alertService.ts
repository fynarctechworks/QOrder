import { prisma } from '../lib/index.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { whatsappService } from './whatsappService.js';
import { getIO } from '../socket/index.js';

// Redis dedup TTL: 24 hours per-ingredient for stock alerts, 24 hours for staff late/early checkout alerts
const STOCK_ALERT_TTL = 86400; // 24h — one alert per ingredient per day
const STAFF_LATE_TTL = 86400;
const STAFF_EARLY_CHECKOUT_TTL = 86400;

/**
 * Get alert settings from restaurant JSON settings
 */
function getAlertSettings(settings: unknown): {
  whatsappAlertLowStock: boolean;
  whatsappAlertStaffLate: boolean;
  whatsappAlertEarlyCheckout: boolean;
  whatsappAlertAutoInvoice: boolean;
  adminWhatsAppPhone: string;
  staffLateThresholdMinutes: number;
  earlyCheckoutThresholdMinutes: number;
} {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    whatsappAlertLowStock: (s.whatsappAlertLowStock as boolean) ?? false,
    whatsappAlertStaffLate: (s.whatsappAlertStaffLate as boolean) ?? false,
    whatsappAlertEarlyCheckout: (s.whatsappAlertEarlyCheckout as boolean) ?? false,
    whatsappAlertAutoInvoice: (s.whatsappAlertAutoInvoice as boolean) ?? false,
    adminWhatsAppPhone: (s.adminWhatsAppPhone as string) ?? '',
    staffLateThresholdMinutes: (s.staffLateThresholdMinutes as number) ?? 15,
    earlyCheckoutThresholdMinutes: (s.earlyCheckoutThresholdMinutes as number) ?? 30,
  };
}

export const alertService = {
  /**
   * Check specific ingredients that just had stock reduced.
   * Called immediately from inventoryService after stock deductions.
   * Only sends alerts for items that crossed into low stock NOW (not already low before).
   */
  async checkItemsForLowStock(
    restaurantId: string,
    items: Array<{ ingredientId: string; previousStock: number; newStock: number }>
  ) {
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, name: true, settings: true },
      });
      if (!restaurant) return;

      // Get the ingredients that just crossed the low stock threshold
      const crossedIds = items.map(i => i.ingredientId);
      const ingredients = await prisma.$queryRaw<Array<{
        id: string; name: string; unit: string;
        currentStock: string; minStock: string;
      }>>`
        SELECT id, name, unit, "currentStock"::text, "minStock"::text
        FROM "Ingredient"
        WHERE id = ANY(${crossedIds})
          AND "isActive" = true
          AND "currentStock" <= "minStock"
          AND "minStock" > 0
      `;

      if (ingredients.length === 0) return;

      // Filter to items that JUST crossed the threshold (were above before, now at or below)
      const newlyLow = ingredients.filter(ing => {
        const item = items.find(i => i.ingredientId === ing.id);
        if (!item) return false;
        const minStock = Number(ing.minStock);
        // Only alert if previous stock was above minStock and new stock is at/below
        return item.previousStock > minStock && item.newStock <= minStock;
      });

      if (newlyLow.length === 0) return;

      // Emit socket notification for newly low items
      const io = getIO();
      if (io) {
        io.to(`restaurant:${restaurant.id}`).emit('notification:stockLow' as any, {
          count: newlyLow.length,
          items: newlyLow.map(i => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            currentStock: Number(i.currentStock),
            minStock: Number(i.minStock),
          })),
        });
      }

      // WhatsApp alert — per ingredient dedup
      const alertSettings = getAlertSettings(restaurant.settings);
      if (!alertSettings.whatsappAlertLowStock || !alertSettings.adminWhatsAppPhone) return;

      // Filter out ingredients that already had an alert sent (per-ingredient dedup)
      const toAlert: typeof newlyLow = [];
      for (const ing of newlyLow) {
        const dedupKey = `alert:stock:${restaurant.id}:${ing.id}`;
        const alreadySent = await redis.get(dedupKey).catch(() => null);
        if (!alreadySent) {
          toAlert.push(ing);
        }
      }

      if (toAlert.length === 0) return;

      const sent = await whatsappService.sendLowStockAlert(
        alertSettings.adminWhatsAppPhone,
        restaurant.name,
        toAlert.map(i => ({
          name: i.name,
          unit: i.unit,
          currentStock: Number(i.currentStock),
          minStock: Number(i.minStock),
        }))
      );

      if (sent) {
        // Mark each ingredient as alerted (24h TTL)
        for (const ing of toAlert) {
          const dedupKey = `alert:stock:${restaurant.id}:${ing.id}`;
          await redis.set(dedupKey, '1', 'EX', STOCK_ALERT_TTL).catch(() => {});
        }
        logger.info({ restaurantId: restaurant.id, items: toAlert.map(i => i.name) }, 'Low stock WhatsApp alert sent');
      }
    } catch (err) {
      logger.error({ err, restaurantId }, 'Failed low stock alert check');
    }
  },

  /**
   * Hourly low-stock reminder: emit toast to all connected admin clients for
   * any ingredient currently at or below minStock.
   * Uses a 55-minute Redis dedup key per ingredient so it fires ~once per hour
   * without spamming when multiple interval ticks land close together.
   */
  async checkAndAlertLowStockAll() {
    const HOURLY_TTL = 55 * 60; // 55 minutes
    try {
      const restaurants = await prisma.restaurant.findMany({
        where: { isActive: true },
        select: { id: true, name: true, settings: true },
      });

      const io = getIO();
      if (!io) return;

      for (const restaurant of restaurants) {
        try {
          const lowItems = await prisma.$queryRaw<Array<{
            id: string; name: string; unit: string;
            currentStock: string; minStock: string;
          }>>`
            SELECT id, name, unit, "currentStock"::text, "minStock"::text
            FROM "Ingredient"
            WHERE "restaurantId" = ${restaurant.id}
              AND "isActive" = true
              AND "currentStock" <= "minStock"
              AND "minStock" > 0
          `;

          if (lowItems.length === 0) continue;

          // Dedup per ingredient — only emit if not already sent in last 55 min
          const toEmit: typeof lowItems = [];
          for (const ing of lowItems) {
            const key = `hourly:stockLow:${restaurant.id}:${ing.id}`;
            const sent = await redis.get(key).catch(() => null);
            if (!sent) {
              toEmit.push(ing);
              redis.set(key, '1', 'EX', HOURLY_TTL).catch(() => {});
            }
          }

          if (toEmit.length === 0) continue;

          io.to(`restaurant:${restaurant.id}`).emit('notification:stockLow' as any, {
            count: toEmit.length,
            items: toEmit.map(i => ({
              id: i.id,
              name: i.name,
              unit: i.unit,
              currentStock: Number(i.currentStock),
              minStock: Number(i.minStock),
            })),
          });

          logger.info({ restaurantId: restaurant.id, count: toEmit.length }, 'Hourly low-stock reminder emitted');
        } catch (err) {
          logger.warn({ err, restaurantId: restaurant.id }, 'Hourly low-stock check failed for restaurant');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Hourly low-stock check failed');
    }
  },

  /**
   * Check all restaurants for late staff and send alerts
   * Called periodically from cron job
   */
  async checkAndAlertLateStaff() {
    const restaurants = await prisma.restaurant.findMany({
      where: { isActive: true },
      select: { id: true, name: true, settings: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const restaurant of restaurants) {
      try {
        const alertSettings = getAlertSettings(restaurant.settings);
        const threshold = alertSettings.staffLateThresholdMinutes;

        // Build a map of userId -> shift from explicit daily assignments
        const assignments = await prisma.shiftAssignment.findMany({
          where: { restaurantId: restaurant.id, date: today },
          include: { shift: true },
        });

        const userShiftMap = new Map<string, { shift: { name: string; startTime: string; isActive: boolean }; userName: string }>();

        for (const a of assignments) {
          if (a.shift) userShiftMap.set(a.userId, { shift: a.shift, userName: '' });
        }

        // Also include staff with a defaultShift (who don't have an explicit assignment today)
        const staffWithDefaultShift = await prisma.user.findMany({
          where: {
            restaurantId: restaurant.id,
            isActive: true,
            role: { not: 'OWNER' },
            defaultShiftId: { not: null },
          },
          select: { id: true, name: true, defaultShift: true },
        });

        for (const staff of staffWithDefaultShift) {
          if (!userShiftMap.has(staff.id) && staff.defaultShift) {
            userShiftMap.set(staff.id, { shift: staff.defaultShift, userName: staff.name });
          }
        }

        if (userShiftMap.size === 0) continue;

        // Look up user names in bulk for assignment-based entries
        const assignmentUserIds = assignments.map(a => a.userId).filter(id => !staffWithDefaultShift.find(s => s.id === id));
        if (assignmentUserIds.length > 0) {
          const users = await prisma.user.findMany({
            where: { id: { in: assignmentUserIds } },
            select: { id: true, name: true },
          });
          for (const u of users) {
            const entry = userShiftMap.get(u.id);
            if (entry) entry.userName = u.name;
          }
        }

        const lateStaff: Array<{ userId: string; name: string; shiftName: string; shiftStart: string; minutesLate: number }> = [];

        for (const [userId, { shift, userName }] of userShiftMap) {
          if (!shift.isActive) continue;

          // Parse shift start time (HH:MM format)
          const parts = shift.startTime.split(':').map(Number);
          const shiftHour = parts[0] ?? 0;
          const shiftMin = parts[1] ?? 0;
          const shiftStartDate = new Date(today);
          shiftStartDate.setHours(shiftHour, shiftMin, 0, 0);

          // Only check if shift has started + threshold passed
          const thresholdDate = new Date(shiftStartDate.getTime() + threshold * 60 * 1000);
          if (now < thresholdDate) continue;

          // Check if user has checked in today
          const attendance = await prisma.attendance.findUnique({
            where: { userId_date: { userId, date: today } },
          });

          // If no attendance or no checkIn, they're late
          if (!attendance || !attendance.checkIn) {
            const minutesLate = Math.floor((now.getTime() - shiftStartDate.getTime()) / 60000);
            lateStaff.push({
              userId,
              name: userName || 'Unknown',
              shiftName: shift.name,
              shiftStart: shift.startTime,
              minutesLate,
            });
          }
        }

        if (lateStaff.length === 0) continue;

        // Emit socket notification
        const io = getIO();
        if (io) {
          io.to(`restaurant:${restaurant.id}`).emit('notification:staffLate' as any, {
            count: lateStaff.length,
            staff: lateStaff.map(s => ({
              name: s.name,
              shiftName: s.shiftName,
              shiftStart: s.shiftStart,
              minutesLate: s.minutesLate,
            })),
          });
        }

        // WhatsApp alert with Redis dedup (once per staff per day)
        if (alertSettings.whatsappAlertStaffLate && alertSettings.adminWhatsAppPhone) {
          // Filter staff not yet alerted today
          const newLateStaff: typeof lateStaff = [];
          for (const staff of lateStaff) {
            const dedupKey = `alert:late:${restaurant.id}:${staff.userId}:${today.toISOString().slice(0, 10)}`;
            const alreadySent = await redis.get(dedupKey).catch(() => null);
            if (!alreadySent) {
              newLateStaff.push(staff);
              await redis.set(dedupKey, '1', 'EX', STAFF_LATE_TTL).catch(() => {});
            }
          }

          if (newLateStaff.length > 0) {
            const sent = await whatsappService.sendStaffLateAlert(
              alertSettings.adminWhatsAppPhone,
              restaurant.name,
              newLateStaff
            );
            if (sent) {
              logger.info({ restaurantId: restaurant.id, count: newLateStaff.length }, 'Staff late WhatsApp alert sent');
            }
          }
        }
      } catch (err) {
        logger.error({ err, restaurantId: restaurant.id }, 'Failed staff late alert check');
      }
    }
  },

  /**
   * Check if a staff member checked out early and send alert
   * Called after checkout action
   */
  async checkAndAlertEarlyCheckout(userId: string, restaurantId: string) {
    try {
      const restaurant = await prisma.restaurant.findFirst({
        where: { id: restaurantId, isActive: true },
        select: { id: true, name: true, settings: true },
      });
      if (!restaurant) return;

      const alertSettings = getAlertSettings(restaurant.settings);
      const threshold = alertSettings.earlyCheckoutThresholdMinutes;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();

      // Find today's shift assignment for this user, or fall back to default shift
      const assignment = await prisma.shiftAssignment.findFirst({
        where: { userId, restaurantId, date: today },
        include: { shift: true },
      });

      let shift = assignment?.shift;

      // Fall back to user's default shift if no explicit assignment
      if (!shift) {
        const user = await prisma.user.findFirst({
          where: { id: userId, restaurantId },
          select: { defaultShift: true },
        });
        shift = user?.defaultShift ?? undefined;
      }

      if (!shift || !shift.isActive) return;
      const endParts = shift.endTime.split(':').map(Number);
      const shiftEndHour = endParts[0] ?? 0;
      const shiftEndMin = endParts[1] ?? 0;
      const shiftEndDate = new Date(today);
      shiftEndDate.setHours(shiftEndHour, shiftEndMin, 0, 0);

      // If shift end is before shift start, it's an overnight shift (end is next day)
      const startParts = shift.startTime.split(':').map(Number);
      const shiftStartHour = startParts[0] ?? 0;
      if (shiftEndHour < shiftStartHour) {
        shiftEndDate.setDate(shiftEndDate.getDate() + 1);
      }

      // Check if checkout is more than threshold minutes before shift end
      const minutesEarly = Math.floor((shiftEndDate.getTime() - now.getTime()) / 60000);
      if (minutesEarly < threshold) return; // Not early enough to alert

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const staffName = user?.name || 'Unknown';

      const earlyCheckoutData = {
        name: staffName,
        shiftName: shift.name,
        shiftEnd: shift.endTime,
        minutesEarly,
      };

      // Emit socket notification
      const io = getIO();
      if (io) {
        io.to(`restaurant:${restaurantId}`).emit('notification:staffEarlyCheckout' as any, {
          count: 1,
          staff: [earlyCheckoutData],
        });
      }

      // WhatsApp alert with Redis dedup (once per staff per day)
      if (alertSettings.whatsappAlertEarlyCheckout && alertSettings.adminWhatsAppPhone) {
        const dedupKey = `alert:earlyco:${restaurantId}:${userId}:${today.toISOString().slice(0, 10)}`;
        const alreadySent = await redis.get(dedupKey).catch(() => null);
        if (!alreadySent) {
          const sent = await whatsappService.sendStaffEarlyCheckoutAlert(
            alertSettings.adminWhatsAppPhone,
            restaurant.name,
            [earlyCheckoutData]
          );
          if (sent) {
            await redis.set(dedupKey, '1', 'EX', STAFF_EARLY_CHECKOUT_TTL).catch(() => {});
            logger.info({ restaurantId, userId, minutesEarly }, 'Staff early checkout WhatsApp alert sent');
          }
        }
      }
    } catch (err) {
      logger.error({ err, userId, restaurantId }, 'Failed early checkout alert check');
    }
  },

  /**
   * Send WhatsApp invoice for a completed order (if auto-invoice enabled)
   */
  async sendAutoInvoice(orderId: string, restaurantId: string) {
    try {
      const [restaurant, order] = await Promise.all([
        prisma.restaurant.findFirst({
          where: { id: restaurantId },
          select: { settings: true },
        }),
        prisma.order.findUnique({
          where: { id: orderId },
          select: { orderType: true, customerPhone: true },
        }),
      ]);
      if (!restaurant) {
        logger.warn({ orderId, restaurantId }, 'Auto-invoice: restaurant not found');
        return;
      }

      // Always send for takeaway orders that have a customer phone
      const isTakeawayWithPhone = order?.orderType === 'TAKEAWAY' && !!order.customerPhone;

      if (!isTakeawayWithPhone) {
        const alertSettings = getAlertSettings(restaurant.settings);
        if (!alertSettings.whatsappAlertAutoInvoice) {
          logger.info({ orderId }, 'Auto-invoice: disabled in settings — skipping');
          return;
        }
      }

      logger.info({ orderId, restaurantId, orderType: order?.orderType }, 'Auto-invoice: sending WhatsApp bill...');
      const result = await whatsappService.sendOrderBill([orderId], restaurantId);
      if (result.sent) {
        logger.info({ orderId, phone: result.phone }, 'Auto WhatsApp invoice sent successfully');
      } else {
        logger.warn({ orderId, phone: result.phone }, 'Auto WhatsApp invoice was not sent (no phone or delivery failed)');
      }
    } catch (err) {
      logger.error({ err, orderId }, 'Failed to send auto WhatsApp invoice');
    }
  },

  getAlertSettings,
};
