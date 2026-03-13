import ZKLib from 'node-zklib';
import { prisma, AppError, logger } from '../lib/index.js';
import { staffManagementService } from './staffManagementService.js';
import { alertService } from './alertService.js';
import crypto from 'crypto';

const CONNECTION_TIMEOUT = 10000;
const INACTIVITY_TIMEOUT = 4000;

// AES-256 encryption for template storage — generate a stable key from env or fallback
const ENCRYPTION_KEY = process.env.BIOMETRIC_ENCRYPTION_KEY
  || crypto.createHash('sha256').update('biometric-default-key').digest('hex');

/* ═══════════════════ Encryption helpers ═══════════════════ */

function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(cipherText: string): string {
  const [ivHex, encHex] = cipherText.split(':');
  if (!ivHex || !encHex) throw new Error('Invalid encrypted data');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

/* ═══════════════════ ZKTeco device helpers ═══════════════════ */

async function withDevice<T>(ip: string, port: number, fn: (zk: any) => Promise<T>): Promise<T> {
  const zk = new ZKLib(ip, port, CONNECTION_TIMEOUT, INACTIVITY_TIMEOUT);
  try {
    await zk.createSocket();
    return await fn(zk);
  } finally {
    try { await zk.disconnect(); } catch { /* ignore */ }
  }
}

/* ═══════════════════ Service ═══════════════════ */

export const biometricService = {

  // ─────────────────── Device CRUD ───────────────────

  async addDevice(restaurantId: string, data: { name: string; ip?: string; port?: number; type?: string }) {
    return prisma.biometricDevice.create({
      data: {
        name: data.name.trim(),
        type: data.type ?? 'USB_SCANNER',
        ip: data.ip?.trim() ?? null,
        port: data.port ?? 4370,
        restaurantId,
      },
    });
  },

  async listDevices(restaurantId: string) {
    return prisma.biometricDevice.findMany({
      where: { restaurantId },
      include: { _count: { select: { userMaps: true, logs: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async updateDevice(id: string, restaurantId: string, data: { name?: string; ip?: string; port?: number; isActive?: boolean; type?: string }) {
    const device = await prisma.biometricDevice.findFirst({ where: { id, restaurantId } });
    if (!device) throw AppError.notFound('Biometric device');
    return prisma.biometricDevice.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.ip !== undefined && { ip: data.ip?.trim() ?? null }),
        ...(data.port !== undefined && { port: data.port }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.type !== undefined && { type: data.type }),
      },
    });
  },

  async deleteDevice(id: string, restaurantId: string) {
    const device = await prisma.biometricDevice.findFirst({ where: { id, restaurantId } });
    if (!device) throw AppError.notFound('Biometric device');
    await prisma.biometricDevice.delete({ where: { id } });
    return { success: true };
  },

  // ─────────────────── Device Connection (ZKTeco) ───────────────────

  async testConnection(ip: string, port: number) {
    try {
      const info = await withDevice(ip, port, async (zk) => {
        const serialNumber = await zk.getSerialNumber().catch(() => null);
        return { connected: true, serialNumber };
      });
      return info;
    } catch (err: any) {
      logger.warn({ ip, port, error: err.message }, 'Biometric device connection failed');
      return { connected: false, error: err.message || 'Connection failed' };
    }
  },

  async getDeviceUsers(id: string, restaurantId: string) {
    const device = await prisma.biometricDevice.findFirst({ where: { id, restaurantId } });
    if (!device) throw AppError.notFound('Biometric device');
    if (!device.ip) throw AppError.badRequest('Device has no IP address configured');

    const data = await withDevice(device.ip, device.port, async (zk) => {
      const result = await zk.getUsers();
      return result?.data ?? [];
    });

    const maps = await prisma.biometricUserMap.findMany({ where: { deviceId: id, restaurantId } });
    const mapByDeviceUserId = new Map(maps.map(m => [m.deviceUserId, m]));

    return data.map((u: any) => ({
      uid: u.uid,
      userId: u.userId,
      name: u.name,
      role: u.role,
      cardno: u.cardno,
      mappedTo: mapByDeviceUserId.get(Number(u.userId))?.userId ?? null,
      mapId: mapByDeviceUserId.get(Number(u.userId))?.id ?? null,
    }));
  },

  // ─────────────────── User Mapping (ZKTeco) ───────────────────

  async listUserMaps(restaurantId: string, deviceId?: string) {
    return prisma.biometricUserMap.findMany({
      where: { restaurantId, ...(deviceId && { deviceId }) },
      orderBy: { deviceUserId: 'asc' },
    });
  },

  async mapUser(restaurantId: string, data: { deviceUserId: number; userId: string; deviceId: string; deviceName?: string }) {
    const device = await prisma.biometricDevice.findFirst({ where: { id: data.deviceId, restaurantId } });
    if (!device) throw AppError.notFound('Biometric device');
    const user = await prisma.user.findFirst({ where: { id: data.userId, restaurantId } });
    if (!user) throw AppError.notFound('Staff member');

    return prisma.biometricUserMap.upsert({
      where: { deviceUserId_deviceId: { deviceUserId: data.deviceUserId, deviceId: data.deviceId } },
      create: { deviceUserId: data.deviceUserId, deviceName: data.deviceName ?? null, userId: data.userId, deviceId: data.deviceId, restaurantId },
      update: { userId: data.userId, deviceName: data.deviceName ?? null },
    });
  },

  async deleteUserMap(id: string, restaurantId: string) {
    const map = await prisma.biometricUserMap.findFirst({ where: { id, restaurantId } });
    if (!map) throw AppError.notFound('User mapping');
    await prisma.biometricUserMap.delete({ where: { id } });
    return { success: true };
  },

  // ─────────────────── ZKTeco Attendance Sync ───────────────────

  async syncAttendance(id: string, restaurantId: string) {
    const device = await prisma.biometricDevice.findFirst({ where: { id, restaurantId } });
    if (!device) throw AppError.notFound('Biometric device');
    if (!device.ip) throw AppError.badRequest('Device has no IP address configured');

    const maps = await prisma.biometricUserMap.findMany({ where: { deviceId: id, restaurantId } });
    if (!maps.length) throw AppError.badRequest('No user mappings found. Map device users to staff first.');

    const mapByDeviceUserId = new Map(maps.map(m => [String(m.deviceUserId), m.userId]));

    const rawResult = await withDevice(device.ip, device.port, async (zk) => {
      const result = await zk.getAttendances();
      const serialNumber = await zk.getSerialNumber().catch(() => null);
      return { logs: result?.data ?? [], serialNumber };
    });

    const since = device.lastSyncAt ? device.lastSyncAt.getTime() : 0;
    let created = 0, skipped = 0, unmapped = 0;
    const grouped = new Map<string, { userId: string; date: string; times: Date[] }>();

    for (const log of rawResult.logs) {
      const punchTime = new Date(log.recordTime ?? log.date);
      if (isNaN(punchTime.getTime())) { skipped++; continue; }
      if (punchTime.getTime() <= since) { skipped++; continue; }

      const systemUserId = mapByDeviceUserId.get(String(log.deviceUserId ?? log.userId));
      if (!systemUserId) { unmapped++; continue; }

      const dateStr = punchTime.toISOString().slice(0, 10);
      const key = `${systemUserId}|${dateStr}`;
      const group = grouped.get(key) ?? { userId: systemUserId, date: dateStr, times: [] };
      group.times.push(punchTime);
      grouped.set(key, group);

      // Log each synced punch
      await prisma.biometricLog.create({
        data: { userId: systemUserId, action: 'CHECKIN', result: 'SUCCESS', deviceId: id, restaurantId, timestamp: punchTime },
      });
    }

    for (const { userId, date, times } of grouped.values()) {
      times.sort((a, b) => a.getTime() - b.getTime());
      const checkIn = times[0]!;
      const checkOut = times.length > 1 ? times[times.length - 1]! : undefined;
      try {
        const existing = await prisma.attendance.findFirst({ where: { userId, date: new Date(date) } });
        if (!existing) {
          await staffManagementService.markAttendance(restaurantId, { userId, date: new Date(date), status: 'PRESENT', checkIn });
          if (checkOut && checkOut.getTime() !== checkIn.getTime()) {
            await prisma.attendance.updateMany({
              where: { userId, date: new Date(date) },
              data: { checkOut, hoursWorked: (checkOut.getTime() - checkIn.getTime()) / 3600000 },
            });
          }
          created++;
        } else if (!existing.checkOut && checkOut) {
          const ci = existing.checkIn ?? checkIn;
          await prisma.attendance.update({
            where: { id: existing.id },
            data: { checkOut, hoursWorked: (checkOut.getTime() - ci.getTime()) / 3600000 },
          });
          created++;
        } else { skipped++; }
      } catch { skipped++; }
    }

    await prisma.biometricDevice.update({
      where: { id },
      data: { lastSyncAt: new Date(), lastUsedAt: new Date(), ...(rawResult.serialNumber && { serialNumber: rawResult.serialNumber }) },
    });

    return { created, skipped, unmapped, totalLogs: rawResult.logs.length };
  },

  // ─────────────────── Fingerprint Enrollment ───────────────────

  async enrollFingerprint(restaurantId: string, data: {
    userId: string;
    templateData: string;   // Base64 fingerprint template from device/bridge
    fingerIndex?: number;
    quality?: number;
    deviceType?: string;
    deviceId?: string;
  }) {
    const user = await prisma.user.findFirst({ where: { id: data.userId, restaurantId } });
    if (!user) throw AppError.notFound('Staff member');

    const fingerIndex = data.fingerIndex ?? 1;
    const encryptedTemplate = encrypt(data.templateData);

    const template = await prisma.biometricTemplate.upsert({
      where: { userId_fingerIndex: { userId: data.userId, fingerIndex } },
      create: {
        userId: data.userId,
        fingerIndex,
        templateData: encryptedTemplate,
        quality: data.quality ?? null,
        deviceType: data.deviceType ?? null,
        restaurantId,
      },
      update: {
        templateData: encryptedTemplate,
        quality: data.quality ?? null,
        deviceType: data.deviceType ?? null,
      },
    });

    await prisma.biometricLog.create({
      data: { userId: data.userId, action: 'ENROLL', result: 'SUCCESS', deviceId: data.deviceId ?? null, restaurantId },
    });

    // Update lastUsedAt on the device
    if (data.deviceId) {
      await prisma.biometricDevice.update({ where: { id: data.deviceId }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }

    logger.info({ userId: data.userId, fingerIndex }, 'Fingerprint enrolled');
    return { id: template.id, userId: data.userId, fingerIndex, quality: data.quality };
  },

  async getTemplates(userId: string, restaurantId: string) {
    return prisma.biometricTemplate.findMany({
      where: { userId, restaurantId },
      select: { id: true, fingerIndex: true, quality: true, deviceType: true, createdAt: true, updatedAt: true },
    });
  },

  async deleteTemplate(id: string, restaurantId: string) {
    const template = await prisma.biometricTemplate.findFirst({ where: { id, restaurantId } });
    if (!template) throw AppError.notFound('Fingerprint template');
    await prisma.biometricTemplate.delete({ where: { id } });
    return { success: true };
  },

  // ─────────────────── Fingerprint Verification ───────────────────

  /**
   * Verify a captured fingerprint and mark attendance.
   *
   * The local fingerprint bridge (running on the client machine) captures
   * the fingerprint, retrieves the stored template via getTemplateForVerification,
   * performs SDK-based matching, then calls this endpoint with the result.
   */
  async verifyAndMarkAttendance(restaurantId: string, data: {
    userId: string;
    action: 'CHECKIN' | 'CHECKOUT';
    matchScore: number;
    verified: boolean;
    deviceId?: string;
  }) {
    const user = await prisma.user.findFirst({ where: { id: data.userId, restaurantId } });
    if (!user) throw AppError.notFound('Staff member');

    const templates = await prisma.biometricTemplate.findMany({ where: { userId: data.userId, restaurantId } });
    if (templates.length === 0) {
      await this.logAttempt(restaurantId, {
        userId: data.userId, action: data.action, result: 'FAILED',
        errorMessage: 'No fingerprint enrolled', deviceId: data.deviceId,
      });
      throw AppError.badRequest('No fingerprint enrolled for this staff member. Register fingerprint first.');
    }

    if (!data.verified || data.matchScore < 40) {
      await this.logAttempt(restaurantId, {
        userId: data.userId, action: data.action, result: 'FAILED',
        matchScore: data.matchScore, deviceId: data.deviceId,
        errorMessage: 'Fingerprint verification failed',
      });
      throw AppError.forbidden('Fingerprint verification failed. Please try again.');
    }

    // Mark attendance
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    if (data.action === 'CHECKIN') {
      // Resolve shift: explicit daily assignment first, then default shift
      let shiftId: string | undefined;
      const todayDate = new Date(dateStr);
      const assignment = await prisma.shiftAssignment.findFirst({
        where: { userId: data.userId, restaurantId, date: todayDate },
        select: { shiftId: true },
      });
      if (assignment) {
        shiftId = assignment.shiftId;
      } else if (user.defaultShiftId) {
        shiftId = user.defaultShiftId;
      }

      await staffManagementService.markAttendance(restaurantId, {
        userId: data.userId,
        date: todayDate,
        status: 'PRESENT',
        checkIn: today,
        shiftId,
      });
    } else {
      await staffManagementService.checkOut(data.userId, new Date(dateStr), restaurantId);
      // Fire-and-forget early checkout alert
      alertService.checkAndAlertEarlyCheckout(data.userId, restaurantId).catch(() => {});
    }

    await this.logAttempt(restaurantId, {
      userId: data.userId, action: data.action, result: 'SUCCESS',
      matchScore: data.matchScore, deviceId: data.deviceId,
    });

    // Update lastUsedAt on the device
    if (data.deviceId) {
      await prisma.biometricDevice.update({ where: { id: data.deviceId }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }

    return { success: true, staffName: user.name, action: data.action, matchScore: data.matchScore, timestamp: today.toISOString() };
  },

  /**
   * Retrieve stored template for a user so the local bridge can perform matching.
   * Decrypted before sending.
   */
  async getTemplateForVerification(userId: string, restaurantId: string, fingerIndex?: number) {
    const where: any = { userId, restaurantId };
    if (fingerIndex) where.fingerIndex = fingerIndex;

    const template = await prisma.biometricTemplate.findFirst({ where, orderBy: { quality: 'desc' } });
    if (!template) return null;

    return { id: template.id, fingerIndex: template.fingerIndex, templateData: decrypt(template.templateData) };
  },

  // ─────────────────── Logging ───────────────────

  async logAttempt(restaurantId: string, data: {
    userId?: string;
    action: string;
    result: string;
    matchScore?: number;
    deviceId?: string;
    errorMessage?: string;
  }) {
    return prisma.biometricLog.create({
      data: {
        userId: data.userId ?? null,
        action: data.action,
        result: data.result,
        matchScore: data.matchScore ?? null,
        deviceId: data.deviceId ?? null,
        errorMessage: data.errorMessage ?? null,
        restaurantId,
      },
    });
  },

  // ─────────────────── Admin Monitoring ───────────────────

  async getLogs(restaurantId: string, opts: {
    userId?: string; result?: string; action?: string;
    startDate?: string; endDate?: string; limit?: number;
  }) {
    const where: any = { restaurantId };
    if (opts.userId) where.userId = opts.userId;
    if (opts.result) where.result = opts.result;
    if (opts.action) where.action = opts.action;
    if (opts.startDate || opts.endDate) {
      where.timestamp = {};
      if (opts.startDate) where.timestamp.gte = new Date(opts.startDate);
      if (opts.endDate) where.timestamp.lte = new Date(opts.endDate + 'T23:59:59.999Z');
    }
    return prisma.biometricLog.findMany({ where, orderBy: { timestamp: 'desc' }, take: opts.limit ?? 100 });
  },

  async getEnrollmentStatus(restaurantId: string) {
    const staff = await prisma.user.findMany({
      where: { restaurantId, role: { not: 'OWNER' }, isActive: true },
      select: { id: true, name: true, role: true, roleTitle: true },
    });

    const templates = await prisma.biometricTemplate.findMany({
      where: { restaurantId },
      select: { userId: true, fingerIndex: true, quality: true, createdAt: true },
    });

    const byUser = new Map<string, typeof templates>();
    for (const t of templates) {
      const list = byUser.get(t.userId) ?? [];
      list.push(t);
      byUser.set(t.userId, list);
    }

    return staff.map(s => ({
      id: s.id, name: s.name, role: s.role, roleTitle: s.roleTitle,
      enrolled: byUser.has(s.id),
      templateCount: byUser.get(s.id)?.length ?? 0,
      templates: byUser.get(s.id)?.map(t => ({ fingerIndex: t.fingerIndex, quality: t.quality, enrolledAt: t.createdAt })) ?? [],
    }));
  },

  async getFailedAttempts(restaurantId: string, startDate?: string, endDate?: string) {
    const where: any = { restaurantId, result: { in: ['FAILED', 'REJECTED', 'SPOOF_DETECTED'] } };
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const logs = await prisma.biometricLog.findMany({ where, orderBy: { timestamp: 'desc' }, take: 200 });

    const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))] as string[];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const nameMap = new Map(users.map(u => [u.id, u.name]));

    return logs.map(l => ({
      id: l.id, userId: l.userId,
      staffName: l.userId ? nameMap.get(l.userId) ?? 'Unknown' : 'Unidentified',
      action: l.action, result: l.result, matchScore: l.matchScore,
      errorMessage: l.errorMessage, deviceId: l.deviceId, timestamp: l.timestamp,
    }));
  },

  async getDailyAttendance(restaurantId: string, date: string) {
    const dayDate = new Date(date + 'T00:00:00.000Z');
    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay = new Date(date + 'T23:59:59.999Z');

    const [attendance, logs, staff] = await Promise.all([
      prisma.attendance.findMany({ where: { restaurantId, date: dayDate } }),
      prisma.biometricLog.findMany({ where: { restaurantId, timestamp: { gte: startOfDay, lte: endOfDay } } }),
      prisma.user.findMany({ where: { restaurantId, role: { not: 'OWNER' }, isActive: true }, select: { id: true, name: true, role: true, roleTitle: true } }),
    ]);

    const attByUser = new Map(attendance.map(a => [a.userId, a]));
    const logsByUser = new Map<string, typeof logs>();
    for (const l of logs) {
      if (!l.userId) continue;
      const list = logsByUser.get(l.userId) ?? [];
      list.push(l);
      logsByUser.set(l.userId, list);
    }

    return {
      date,
      totalStaff: staff.length,
      present: attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length,
      absent: staff.length - attendance.length,
      failedAttempts: logs.filter(l => l.result === 'FAILED').length,
      staff: staff.map(s => ({
        id: s.id, name: s.name, role: s.role, roleTitle: s.roleTitle,
        attendance: attByUser.has(s.id) ? {
          status: attByUser.get(s.id)!.status,
          checkIn: attByUser.get(s.id)!.checkIn,
          checkOut: attByUser.get(s.id)!.checkOut,
          hoursWorked: attByUser.get(s.id)!.hoursWorked ? Number(attByUser.get(s.id)!.hoursWorked) : null,
        } : null,
        verificationLogs: logsByUser.get(s.id)?.map(l => ({
          action: l.action, result: l.result, matchScore: l.matchScore, timestamp: l.timestamp,
        })) ?? [],
      })),
    };
  },
};
