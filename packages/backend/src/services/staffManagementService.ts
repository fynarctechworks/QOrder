import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import type { AttendanceStatus, LeaveType, LeaveStatus, ShiftType } from '@prisma/client';

export const staffManagementService = {

  /* ═══════════════════ SHIFTS ═══════════════════ */

  async getShifts(restaurantId: string) {
    return prisma.staffShift.findMany({
      where: { restaurantId },
      orderBy: { startTime: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
  },

  async createShift(restaurantId: string, data: {
    name: string;
    shiftType?: ShiftType;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
  }) {
    return prisma.staffShift.create({
      data: {
        restaurantId,
        name: data.name,
        shiftType: data.shiftType || 'CUSTOM',
        startTime: data.startTime,
        endTime: data.endTime,
        breakMinutes: data.breakMinutes ?? 0,
      },
    });
  },

  async updateShift(shiftId: string, restaurantId: string, data: {
    name?: string;
    shiftType?: ShiftType;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
    isActive?: boolean;
  }) {
    const shift = await prisma.staffShift.findFirst({ where: { id: shiftId, restaurantId } });
    if (!shift) throw new Error('Shift not found');
    return prisma.staffShift.update({
      where: { id: shiftId },
      data,
    });
  },

  async deleteShift(shiftId: string, restaurantId: string) {
    const shift = await prisma.staffShift.findFirst({ where: { id: shiftId, restaurantId } });
    if (!shift) throw new Error('Shift not found');
    return prisma.staffShift.delete({ where: { id: shiftId } });
  },

  /* ═══════════════════ SHIFT ASSIGNMENTS ═══════════════════ */

  async assignShift(restaurantId: string, userId: string, shiftId: string, date: Date) {
    return prisma.shiftAssignment.create({
      data: { restaurantId, userId, shiftId, date },
    });
  },

  async getShiftAssignments(restaurantId: string, startDate: Date, endDate: Date) {
    return prisma.shiftAssignment.findMany({
      where: {
        restaurantId,
        date: { gte: startDate, lte: endDate },
      },
      include: { shift: true },
      orderBy: { date: 'asc' },
    });
  },

  async removeAssignment(assignmentId: string, restaurantId: string) {
    const assignment = await prisma.shiftAssignment.findFirst({ where: { id: assignmentId, restaurantId } });
    if (!assignment) throw new Error('Assignment not found');
    return prisma.shiftAssignment.delete({ where: { id: assignmentId } });
  },

  /* ═══════════════════ ATTENDANCE ═══════════════════ */

  async markAttendance(restaurantId: string, data: {
    userId: string;
    date: Date;
    status: AttendanceStatus;
    checkIn?: Date;
    shiftId?: string;
    notes?: string;
  }) {
    return prisma.attendance.upsert({
      where: { userId_date: { userId: data.userId, date: data.date } },
      create: {
        restaurantId,
        userId: data.userId,
        date: data.date,
        status: data.status,
        checkIn: data.checkIn,
        shiftId: data.shiftId,
        notes: data.notes,
      },
      update: {
        status: data.status,
        checkIn: data.checkIn,
        shiftId: data.shiftId,
        notes: data.notes,
      },
    });
  },

  async checkOut(userId: string, date: Date, restaurantId: string) {
    // Use findFirst with date range for robust matching (avoids timezone issues with @db.Date compound key)
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const att = await prisma.attendance.findFirst({
      where: {
        userId,
        restaurantId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });
    if (!att) return null;

    const checkOut = new Date();
    const hoursWorked = att.checkIn
      ? (checkOut.getTime() - att.checkIn.getTime()) / (1000 * 60 * 60)
      : null;

    return prisma.attendance.update({
      where: { id: att.id },
      data: {
        checkOut,
        hoursWorked: hoursWorked != null ? Math.round(hoursWorked * 100) / 100 : null,
      },
    });
  },

  async getAttendance(restaurantId: string, opts: {
    userId?: string;
    startDate: Date;
    endDate: Date;
    status?: AttendanceStatus;
  }) {
    const where: Prisma.AttendanceWhereInput = {
      restaurantId,
      date: { gte: opts.startDate, lte: opts.endDate },
    };
    if (opts.userId) where.userId = opts.userId;
    if (opts.status) where.status = opts.status;

    return prisma.attendance.findMany({
      where,
      include: { shift: true },
      orderBy: [{ date: 'desc' }, { userId: 'asc' }],
    });
  },

  async getAttendanceSummary(restaurantId: string, userId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const records = await prisma.attendance.findMany({
      where: {
        restaurantId,
        userId,
        date: { gte: startDate, lte: endDate },
      },
    });

    const summary = {
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      onLeave: 0,
      totalHours: 0,
      totalOvertime: 0,
    };

    for (const r of records) {
      switch (r.status) {
        case 'PRESENT': summary.present++; break;
        case 'ABSENT': summary.absent++; break;
        case 'LATE': summary.late++; summary.present++; break;
        case 'HALF_DAY': summary.halfDay++; break;
        case 'ON_LEAVE': summary.onLeave++; break;
      }
      summary.totalHours += Number(r.hoursWorked || 0);
      summary.totalOvertime += Number(r.overtime || 0);
    }

    return summary;
  },

  /* ═══════════════════ LEAVE MANAGEMENT ═══════════════════ */

  async requestLeave(restaurantId: string, userId: string, data: {
    leaveType: LeaveType;
    startDate: Date;
    endDate: Date;
    reason?: string;
  }) {
    return prisma.leaveRequest.create({
      data: {
        restaurantId,
        userId,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
      },
    });
  },

  async getLeaveById(leaveId: string, restaurantId: string) {
    return prisma.leaveRequest.findFirst({ where: { id: leaveId, restaurantId } });
  },

  async updateLeaveStatus(leaveId: string, status: LeaveStatus, approvedBy: string, restaurantId: string) {
    const leave = await prisma.leaveRequest.findFirst({ where: { id: leaveId, restaurantId } });
    if (!leave) throw new Error('Leave request not found');
    return prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status,
        approvedBy,
        respondedAt: new Date(),
      },
    });
  },

  async getLeaveRequests(restaurantId: string, opts: {
    userId?: string;
    status?: LeaveStatus;
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const where: Prisma.LeaveRequestWhereInput = { restaurantId };
    if (opts.userId) where.userId = opts.userId;
    if (opts.status) where.status = opts.status;
    if (opts.startDate || opts.endDate) {
      where.startDate = {};
      if (opts.startDate) where.startDate.gte = opts.startDate;
      if (opts.endDate) where.startDate.lte = opts.endDate;
    }

    return prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  /* ═══════════════════ PAYROLL CONFIG ═══════════════════ */

  async getPayrollConfig(userId: string, restaurantId?: string) {
    const config = await prisma.payrollConfig.findUnique({ where: { userId } });
    if (config && restaurantId && config.restaurantId !== restaurantId) return null;
    return config;
  },

  async upsertPayrollConfig(restaurantId: string, userId: string, data: {
    baseSalary: number;
    overtimeRate?: number;
    deductions?: Record<string, number>;
    allowances?: Record<string, number>;
    payDay?: number;
  }) {
    return prisma.payrollConfig.upsert({
      where: { userId },
      create: {
        restaurantId,
        userId,
        baseSalary: data.baseSalary,
        overtimeRate: data.overtimeRate ?? 1.5,
        deductions: data.deductions ?? {},
        allowances: data.allowances ?? {},
        payDay: data.payDay ?? 1,
      },
      update: {
        baseSalary: data.baseSalary,
        ...(data.overtimeRate !== undefined && { overtimeRate: data.overtimeRate }),
        ...(data.deductions && { deductions: data.deductions }),
        ...(data.allowances && { allowances: data.allowances }),
        ...(data.payDay !== undefined && { payDay: data.payDay }),
      },
    });
  },

  /* ═══════════════════ PAYROLL RUN ═══════════════════ */

  async generatePayroll(restaurantId: string, userId: string, month: number, year: number) {
    let config = await this.getPayrollConfig(userId);
    if (!config) {
      // Auto-create a default config so generation doesn't fail
      config = await this.upsertPayrollConfig(restaurantId, userId, {
        baseSalary: 0,
        overtimeRate: 1.5,
        deductions: {},
        allowances: {},
        payDay: 1,
      });
    }

    const summary = await this.getAttendanceSummary(restaurantId, userId, month, year);

    // Calculate working days in the month
    const daysInMonth = new Date(year, month, 0).getDate();
    const workingDays = daysInMonth - 4; // Approx Sundays off; restaurants can customize

    const dailyRate = Number(config.baseSalary) / workingDays;
    const basePay = dailyRate * summary.present;
    const overtimePay = summary.totalOvertime * dailyRate * Number(config.overtimeRate) / 8;

    const allowancesObj = config.allowances as Record<string, number>;
    const deductionsObj = config.deductions as Record<string, number>;

    const totalAllowances = Object.values(allowancesObj).reduce((s, v) => s + (Number(v) || 0), 0);
    const totalDeductions = Object.values(deductionsObj).reduce((s, v) => s + (Number(v) || 0), 0);
    const netPay = basePay + overtimePay + totalAllowances - totalDeductions;

    return prisma.payrollRun.upsert({
      where: { userId_month_year: { userId, month, year } },
      create: {
        restaurantId,
        userId,
        month,
        year,
        baseSalary: basePay,
        overtime: overtimePay,
        allowances: totalAllowances,
        deductions: totalDeductions,
        netPay: Math.max(netPay, 0),
        daysPresent: summary.present,
        daysAbsent: summary.absent,
        workingDays,
      },
      update: {
        baseSalary: basePay,
        overtime: overtimePay,
        allowances: totalAllowances,
        deductions: totalDeductions,
        netPay: Math.max(netPay, 0),
        daysPresent: summary.present,
        daysAbsent: summary.absent,
        workingDays,
      },
    });
  },

  async getPayrollRuns(restaurantId: string, month: number, year: number) {
    return prisma.payrollRun.findMany({
      where: { restaurantId, month, year },
      orderBy: { netPay: 'desc' },
    });
  },

  async markPayrollPaid(payrollId: string, restaurantId: string) {
    const run = await prisma.payrollRun.findFirst({ where: { id: payrollId, restaurantId } });
    if (!run) throw new Error('Payroll run not found');
    return prisma.payrollRun.update({
      where: { id: payrollId },
      data: { isPaid: true, paidAt: new Date() },
    });
  },
};
