import type { Request, Response, NextFunction } from 'express';
import { staffManagementService } from '../services/staffManagementService.js';
import { AppError } from '../lib/errors.js';
import { getIO } from '../socket/index.js';
import { alertService } from '../services/alertService.js';
import type { AttendanceStatus, LeaveType, LeaveStatus, ShiftType } from '@prisma/client';

export const staffManagementController = {

  /* ═══ Shifts ═══ */

  async getShifts(req: Request, res: Response, next: NextFunction) {
    try {
      const shifts = await staffManagementService.getShifts(req.user!.restaurantId);
      res.json({ success: true, data: shifts });
    } catch (err) { next(err); }
  },

  async createShift(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, shiftType, startTime, endTime, breakMinutes } = req.body;
      const shift = await staffManagementService.createShift(req.user!.restaurantId, {
        name, shiftType: shiftType as ShiftType, startTime, endTime, breakMinutes,
      });
      res.status(201).json({ success: true, data: shift });
    } catch (err) { next(err); }
  },

  async updateShift(req: Request, res: Response, next: NextFunction) {
    try {
      const shift = await staffManagementService.updateShift(req.params.id!, req.user!.restaurantId, req.body);
      res.json({ success: true, data: shift });
    } catch (err) { next(err); }
  },

  async deleteShift(req: Request, res: Response, next: NextFunction) {
    try {
      await staffManagementService.deleteShift(req.params.id!, req.user!.restaurantId);
      res.json({ success: true, message: 'Shift deleted' });
    } catch (err) { next(err); }
  },

  /* ═══ Shift Assignments ═══ */

  async assignShift(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, shiftId, date } = req.body;
      const assignment = await staffManagementService.assignShift(
        req.user!.restaurantId, userId, shiftId, new Date(date),
      );
      res.status(201).json({ success: true, data: assignment });
    } catch (err) { next(err); }
  },

  async getAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const assignments = await staffManagementService.getShiftAssignments(
        req.user!.restaurantId,
        new Date(startDate as string),
        new Date(endDate as string),
      );
      res.json({ success: true, data: assignments });
    } catch (err) { next(err); }
  },

  async removeAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      await staffManagementService.removeAssignment(req.params.id!, req.user!.restaurantId);
      res.json({ success: true, message: 'Assignment removed' });
    } catch (err) { next(err); }
  },

  /* ═══ Attendance ═══ */

  async markAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, date, status, checkIn, shiftId, notes } = req.body;
      // Non-admin staff can only mark their own attendance
      const isAdmin = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user!.role);
      const effectiveUserId = isAdmin ? userId : req.user!.id;
      const dateObj = new Date(date);
      // Combine date + time string (HH:MM) into a full DateTime
      let checkInDate: Date | undefined;
      if (checkIn) {
        const [h, m] = checkIn.split(':').map(Number);
        checkInDate = new Date(dateObj);
        checkInDate.setHours(h, m, 0, 0);
      }
      const attendance = await staffManagementService.markAttendance(req.user!.restaurantId, {
        userId: effectiveUserId,
        date: dateObj,
        status: status as AttendanceStatus,
        checkIn: checkInDate,
        shiftId,
        notes,
      });
      res.json({ success: true, data: attendance });
    } catch (err) { next(err); }
  },

  async checkOut(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, date } = req.body;
      // Non-admin staff can only check out themselves
      const isAdmin = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user!.role);
      const effectiveUserId = isAdmin ? userId : req.user!.id;
      const attendance = await staffManagementService.checkOut(effectiveUserId, new Date(date), req.user!.restaurantId);
      if (!attendance) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No check-in record found' } });
      // Fire-and-forget early checkout alert
      alertService.checkAndAlertEarlyCheckout(effectiveUserId, req.user!.restaurantId).catch(() => {});
      res.json({ success: true, data: attendance });
    } catch (err) { next(err); }
  },

  async getAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, startDate, endDate, status } = req.query;
      // Non-admin staff can only view their own attendance
      const isAdmin = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user!.role);
      const effectiveUserId = isAdmin ? (userId as string | undefined) : req.user!.id;
      const records = await staffManagementService.getAttendance(req.user!.restaurantId, {
        userId: effectiveUserId,
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        status: status as AttendanceStatus | undefined,
      });
      res.json({ success: true, data: records });
    } catch (err) { next(err); }
  },

  async getAttendanceSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, month, year } = req.query;
      // Non-admin staff can only view their own summary
      const isAdmin = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user!.role);
      const effectiveUserId = isAdmin ? (userId as string) : req.user!.id;
      const summary = await staffManagementService.getAttendanceSummary(
        req.user!.restaurantId,
        effectiveUserId,
        Number(month),
        Number(year),
      );
      res.json({ success: true, data: summary });
    } catch (err) { next(err); }
  },

  /* ═══ Leave Management ═══ */

  async requestLeave(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, leaveType, startDate, endDate, reason } = req.body;
      // Staff can only request leave for themselves
      const isAdmin = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user!.role);
      const effectiveUserId = isAdmin ? userId : req.user!.id;

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw AppError.badRequest('Invalid date format');
      }
      if (end < start) {
        throw AppError.badRequest('End date must be after start date');
      }
      const leave = await staffManagementService.requestLeave(req.user!.restaurantId, effectiveUserId, {
        leaveType: leaveType as LeaveType,
        startDate: start,
        endDate: end,
        reason,
      });

      // Emit socket event so admin panel gets a notification
      const io = getIO();
      if (io) {
        const userName = req.user!.name || 'Staff';
        io.to(`restaurant:${req.user!.restaurantId}`).emit('staff:leaveRequest', {
          id: leave.id,
          userName,
          leaveType: leave.leaveType,
          startDate: leave.startDate.toISOString(),
          endDate: leave.endDate.toISOString(),
          reason: leave.reason || undefined,
        });
      }

      res.status(201).json({ success: true, data: leave });
    } catch (err) { next(err); }
  },

  async updateLeaveStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      const isAdmin = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user!.role);

      // Staff can only cancel their own pending leaves
      if (!isAdmin) {
        if (status !== 'CANCELLED') {
          throw AppError.forbidden('Only admins can approve or reject leaves');
        }
        // Verify ownership
        const existing = await staffManagementService.getLeaveById(req.params.id!, req.user!.restaurantId);
        if (!existing || existing.userId !== req.user!.id) {
          throw AppError.forbidden('You can only cancel your own leaves');
        }
      }

      const leave = await staffManagementService.updateLeaveStatus(
        req.params.id!, status as LeaveStatus, req.user!.id, req.user!.restaurantId,
      );
      res.json({ success: true, data: leave });
    } catch (err) { next(err); }
  },

  async getLeaves(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, status, startDate, endDate } = req.query;
      // Staff can only see their own leaves
      const isAdmin = ['OWNER', 'ADMIN', 'MANAGER'].includes(req.user!.role);
      const effectiveUserId = isAdmin ? (userId as string | undefined) : req.user!.id;

      const leaves = await staffManagementService.getLeaveRequests(req.user!.restaurantId, {
        userId: effectiveUserId,
        status: status as LeaveStatus | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });
      res.json({ success: true, data: leaves });
    } catch (err) { next(err); }
  },

  /* ═══ Payroll ═══ */

  async getPayrollConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await staffManagementService.getPayrollConfig(req.params.userId!, req.user!.restaurantId);
      res.json({ success: true, data: config });
    } catch (err) { next(err); }
  },

  async upsertPayrollConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await staffManagementService.upsertPayrollConfig(
        req.user!.restaurantId, req.params.userId!, req.body,
      );
      res.json({ success: true, data: config });
    } catch (err) { next(err); }
  },

  async generatePayroll(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, month, year } = req.body;
      const payroll = await staffManagementService.generatePayroll(
        req.user!.restaurantId, userId, Number(month), Number(year),
      );
      res.json({ success: true, data: payroll });
    } catch (err) { next(err); }
  },

  async getPayrollRuns(req: Request, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;
      const runs = await staffManagementService.getPayrollRuns(
        req.user!.restaurantId, Number(month), Number(year),
      );
      res.json({ success: true, data: runs });
    } catch (err) { next(err); }
  },

  async markPayrollPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const payroll = await staffManagementService.markPayrollPaid(req.params.id!, req.user!.restaurantId);
      res.json({ success: true, data: payroll });
    } catch (err) { next(err); }
  },
};
