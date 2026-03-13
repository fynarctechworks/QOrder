import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';
import { biometricService } from '../services/biometricService.js';
import { AppError } from '../lib/errors.js';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types/index.js';

const router = Router();

router.use(authenticate, resolveBranch);
const ownerAdmin = authorize('OWNER', 'ADMIN');

// ── Devices ──

router.get('/devices', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const devices = await biometricService.listDevices(req.user!.restaurantId);
    res.json({ success: true, data: devices });
  } catch (err) { next(err); }
});

router.post('/devices', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { name, ip, port, type } = req.body;
    if (!name?.trim()) throw AppError.badRequest('Device name is required');
    if (type === 'ZKDEVICE' && !ip?.trim()) throw AppError.badRequest('Device IP address is required for ZKTeco devices');
    const device = await biometricService.addDevice(req.user!.restaurantId, { name, ip, port, type });
    res.status(201).json({ success: true, data: device });
  } catch (err) { next(err); }
});

router.patch('/devices/:id', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const device = await biometricService.updateDevice(req.params.id!, req.user!.restaurantId, req.body);
    res.json({ success: true, data: device });
  } catch (err) { next(err); }
});

router.delete('/devices/:id', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await biometricService.deleteDevice(req.params.id!, req.user!.restaurantId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Device Connection ──

router.post('/devices/test', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { ip, port } = req.body;
    if (!ip?.trim()) throw AppError.badRequest('IP address is required');
    const result = await biometricService.testConnection(ip.trim(), port ?? 4370);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/devices/:id/users', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const users = await biometricService.getDeviceUsers(req.params.id!, req.user!.restaurantId);
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// ── Sync ──

router.post('/devices/:id/sync', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await biometricService.syncAttendance(req.params.id!, req.user!.restaurantId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── User Mappings ──

router.get('/user-maps', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const maps = await biometricService.listUserMaps(req.user!.restaurantId, req.query.deviceId as string | undefined);
    res.json({ success: true, data: maps });
  } catch (err) { next(err); }
});

router.post('/user-maps', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { deviceUserId, userId, deviceId, deviceName } = req.body;
    if (deviceUserId == null || !userId || !deviceId) {
      throw AppError.badRequest('deviceUserId, userId, and deviceId are required');
    }
    const map = await biometricService.mapUser(req.user!.restaurantId, {
      deviceUserId: Number(deviceUserId),
      userId,
      deviceId,
      deviceName,
    });
    res.status(201).json({ success: true, data: map });
  } catch (err) { next(err); }
});

router.delete('/user-maps/:id', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await biometricService.deleteUserMap(req.params.id!, req.user!.restaurantId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Fingerprint Enrollment ──

router.post('/enroll', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { userId, templateData, fingerIndex, quality, deviceType, deviceId } = req.body;
    if (!userId || !templateData) throw AppError.badRequest('userId and templateData are required');
    const result = await biometricService.enrollFingerprint(req.user!.restaurantId, {
      userId, templateData, fingerIndex, quality, deviceType, deviceId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/templates/:userId', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const templates = await biometricService.getTemplates(req.params.userId!, req.user!.restaurantId);
    res.json({ success: true, data: templates });
  } catch (err) { next(err); }
});

router.delete('/templates/:id', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await biometricService.deleteTemplate(req.params.id!, req.user!.restaurantId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/templates/:userId/verify', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const fingerIndex = req.query.fingerIndex ? Number(req.query.fingerIndex) : undefined;
    const template = await biometricService.getTemplateForVerification(req.params.userId!, req.user!.restaurantId, fingerIndex);
    if (!template) throw AppError.notFound('No fingerprint template found');
    res.json({ success: true, data: template });
  } catch (err) { next(err); }
});

// ── Fingerprint Verification & Attendance ──

router.post('/verify', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { userId, action, matchScore, verified, deviceId } = req.body;
    if (!userId || !action || matchScore == null || verified == null) {
      throw AppError.badRequest('userId, action, matchScore, and verified are required');
    }
    if (!['CHECKIN', 'CHECKOUT'].includes(action)) {
      throw AppError.badRequest('action must be CHECKIN or CHECKOUT');
    }
    const result = await biometricService.verifyAndMarkAttendance(req.user!.restaurantId, {
      userId, action, matchScore: Number(matchScore), verified: Boolean(verified), deviceId,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Logs & Monitoring ──

router.get('/logs', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { userId, result, action, startDate, endDate, limit } = req.query;
    const logs = await biometricService.getLogs(req.user!.restaurantId, {
      userId: userId as string, result: result as string, action: action as string,
      startDate: startDate as string, endDate: endDate as string,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
});

router.get('/enrollment-status', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const status = await biometricService.getEnrollmentStatus(req.user!.restaurantId);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

router.get('/failed-attempts', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;
    const attempts = await biometricService.getFailedAttempts(req.user!.restaurantId, startDate as string, endDate as string);
    res.json({ success: true, data: attempts });
  } catch (err) { next(err); }
});

router.get('/daily-attendance/:date', ownerAdmin, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date!)) throw AppError.badRequest('Date must be YYYY-MM-DD format');
    const report = await biometricService.getDailyAttendance(req.user!.restaurantId, date!);
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

// ── Self-Service (any authenticated user, own data only) ──

router.get('/self/enrollment-status', async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const restaurantId = req.user!.restaurantId;
    const templates = await biometricService.getTemplates(userId, restaurantId);
    res.json({
      success: true,
      data: {
        enrolled: templates.length > 0,
        templateCount: templates.length,
        templates: templates.map(t => ({ fingerIndex: t.fingerIndex, quality: t.quality, enrolledAt: t.createdAt })),
      },
    });
  } catch (err) { next(err); }
});

router.get('/self/template', async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const fingerIndex = req.query.fingerIndex ? Number(req.query.fingerIndex) : undefined;
    const template = await biometricService.getTemplateForVerification(userId, req.user!.restaurantId, fingerIndex);
    if (!template) throw AppError.notFound('No fingerprint template found');
    res.json({ success: true, data: template });
  } catch (err) { next(err); }
});

router.post('/self/verify', async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { action, matchScore, verified, deviceId } = req.body;
    if (!action || matchScore == null || verified == null) {
      throw AppError.badRequest('action, matchScore, and verified are required');
    }
    if (!['CHECKIN', 'CHECKOUT'].includes(action)) {
      throw AppError.badRequest('action must be CHECKIN or CHECKOUT');
    }
    const result = await biometricService.verifyAndMarkAttendance(req.user!.restaurantId, {
      userId, action, matchScore: Number(matchScore), verified: Boolean(verified), deviceId,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
