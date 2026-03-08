import { apiClient } from './apiClient';

export interface StaffShift {
  id: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isActive: boolean;
  _count?: { assignments: number };
}

export interface ShiftAssignment {
  id: string;
  userId: string;
  shiftId: string;
  date: string;
  shift: StaffShift;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number | null;
  overtime: number | null;
  notes: string | null;
  shift: StaffShift | null;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  onLeave: number;
  totalHours: number;
  totalOvertime: number;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  approvedBy: string | null;
  respondedAt: string | null;
}

export interface PayrollConfig {
  id: string;
  userId: string;
  baseSalary: number;
  overtimeRate: number;
  deductions: Record<string, number>;
  allowances: Record<string, number>;
  payDay: number;
}

export interface PayrollRun {
  id: string;
  userId: string;
  month: number;
  year: number;
  baseSalary: number;
  overtime: number;
  allowances: number;
  deductions: number;
  netPay: number;
  daysPresent: number;
  daysAbsent: number;
  workingDays: number;
  isPaid: boolean;
  paidAt: string | null;
}

export const staffManagementService = {
  // Shifts
  getShifts: () => apiClient.get<StaffShift[]>('/staff-management/shifts'),
  createShift: (data: Partial<StaffShift>) => apiClient.post<StaffShift>('/staff-management/shifts', data),
  updateShift: (id: string, data: Partial<StaffShift>) => apiClient.patch<StaffShift>(`/staff-management/shifts/${id}`, data),
  deleteShift: (id: string) => apiClient.delete(`/staff-management/shifts/${id}`),

  // Assignments
  getAssignments: (startDate: string, endDate: string) =>
    apiClient.get<ShiftAssignment[]>(`/staff-management/assignments?startDate=${startDate}&endDate=${endDate}`),
  assignShift: (data: { userId: string; shiftId: string; date: string }) =>
    apiClient.post<ShiftAssignment>('/staff-management/assignments', data),
  removeAssignment: (id: string) => apiClient.delete(`/staff-management/assignments/${id}`),

  // Attendance
  getAttendance: (query: { startDate: string; endDate: string; userId?: string; status?: string }) => {
    const params = new URLSearchParams(query as Record<string, string>);
    return apiClient.get<AttendanceRecord[]>(`/staff-management/attendance?${params}`);
  },
  getAttendanceSummary: (userId: string, month: number, year: number) =>
    apiClient.get<AttendanceSummary>(`/staff-management/attendance/summary?userId=${userId}&month=${month}&year=${year}`),
  markAttendance: (data: { userId: string; date: string; status: string; checkIn?: string; shiftId?: string; notes?: string }) =>
    apiClient.post<AttendanceRecord>('/staff-management/attendance', data),
  checkOut: (data: { userId: string; date: string }) =>
    apiClient.post<AttendanceRecord>('/staff-management/attendance/checkout', data),

  // Leave
  getLeaves: (query: { userId?: string; status?: string; startDate?: string; endDate?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => { if (v) params.set(k, v); });
    return apiClient.get<LeaveRequest[]>(`/staff-management/leaves?${params}`);
  },
  requestLeave: (data: { userId: string; leaveType: string; startDate: string; endDate: string; reason?: string }) =>
    apiClient.post<LeaveRequest>('/staff-management/leaves', data),
  updateLeaveStatus: (id: string, status: string) =>
    apiClient.patch<LeaveRequest>(`/staff-management/leaves/${id}`, { status }),

  // Payroll
  getPayrollConfig: (userId: string) =>
    apiClient.get<PayrollConfig | null>(`/staff-management/payroll/config/${userId}`),
  upsertPayrollConfig: (userId: string, data: Partial<PayrollConfig>) =>
    apiClient.put<PayrollConfig>(`/staff-management/payroll/config/${userId}`, data),
  getPayrollRuns: (month: number, year: number) =>
    apiClient.get<PayrollRun[]>(`/staff-management/payroll/runs?month=${month}&year=${year}`),
  generatePayroll: (data: { userId: string; month: number; year: number }) =>
    apiClient.post<PayrollRun>('/staff-management/payroll/generate', data),
  markPaid: (id: string) =>
    apiClient.patch<PayrollRun>(`/staff-management/payroll/${id}/paid`, {}),
};
