import { apiClient } from './apiClient';

/* ═══════════════════ Types ═══════════════════ */

export interface BiometricDevice {
  id: string;
  name: string;
  type: string;
  ip: string | null;
  port: number;
  serialNumber: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  _count?: { userMaps: number; logs: number };
}

export interface DeviceUser {
  uid: number;
  userId: string;
  name: string;
  role: number;
  cardno: string;
  mappedTo: string | null;
  mapId: string | null;
}

export interface BiometricUserMap {
  id: string;
  deviceUserId: number;
  deviceName: string | null;
  userId: string;
  deviceId: string;
  restaurantId: string;
}

export interface SyncResult {
  created: number;
  skipped: number;
  unmapped: number;
  totalLogs: number;
}

export interface FingerprintTemplate {
  id: string;
  fingerIndex: number;
  quality: number | null;
  deviceType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollResult {
  id: string;
  userId: string;
  fingerIndex: number;
  quality: number | null;
}

export interface VerifyResult {
  success: boolean;
  staffName: string;
  action: string;
  matchScore: number;
  timestamp: string;
}

export interface BiometricLog {
  id: string;
  userId: string | null;
  action: string;
  result: string;
  matchScore: number | null;
  deviceId: string | null;
  errorMessage: string | null;
  timestamp: string;
}

export interface EnrollmentStatusItem {
  id: string;
  name: string;
  role: string;
  roleTitle: string | null;
  enrolled: boolean;
  templateCount: number;
  templates: { fingerIndex: number; quality: number | null; enrolledAt: string }[];
}

export interface FailedAttempt {
  id: string;
  userId: string | null;
  staffName: string;
  action: string;
  result: string;
  matchScore: number | null;
  errorMessage: string | null;
  deviceId: string | null;
  timestamp: string;
}

export interface DailyAttendanceReport {
  date: string;
  totalStaff: number;
  present: number;
  absent: number;
  failedAttempts: number;
  staff: {
    id: string;
    name: string;
    role: string;
    roleTitle: string | null;
    attendance: {
      status: string;
      checkIn: string | null;
      checkOut: string | null;
      hoursWorked: number | null;
    } | null;
    verificationLogs: { action: string; result: string; matchScore: number | null; timestamp: string }[];
  }[];
}

/* ═══════════════════ Service ═══════════════════ */

export const biometricService = {
  // ─── Devices ───
  listDevices: () =>
    apiClient.get<BiometricDevice[]>('/biometric/devices'),

  addDevice: (data: { name: string; ip?: string; port?: number; type?: string }) =>
    apiClient.post<BiometricDevice>('/biometric/devices', data),

  updateDevice: (id: string, data: { name?: string; ip?: string; port?: number; isActive?: boolean; type?: string }) =>
    apiClient.patch<BiometricDevice>(`/biometric/devices/${id}`, data),

  deleteDevice: (id: string) =>
    apiClient.delete(`/biometric/devices/${id}`),

  // ─── ZKTeco Connection ───
  testConnection: (ip: string, port?: number) =>
    apiClient.post<{ connected: boolean; serialNumber?: string; error?: string }>('/biometric/devices/test', { ip, port }),

  getDeviceUsers: (id: string) =>
    apiClient.get<DeviceUser[]>(`/biometric/devices/${id}/users`),

  syncAttendance: (id: string) =>
    apiClient.post<SyncResult>(`/biometric/devices/${id}/sync`, {}),

  // ─── User Mappings (ZKTeco) ───
  listUserMaps: (deviceId?: string) => {
    const params = deviceId ? `?deviceId=${deviceId}` : '';
    return apiClient.get<BiometricUserMap[]>(`/biometric/user-maps${params}`);
  },

  mapUser: (data: { deviceUserId: number; userId: string; deviceId: string; deviceName?: string }) =>
    apiClient.post<BiometricUserMap>('/biometric/user-maps', data),

  deleteUserMap: (id: string) =>
    apiClient.delete(`/biometric/user-maps/${id}`),

  // ─── Fingerprint Enrollment ───
  enrollFingerprint: (data: { userId: string; templateData: string; fingerIndex?: number; quality?: number; deviceType?: string; deviceId?: string }) =>
    apiClient.post<EnrollResult>('/biometric/enroll', data),

  getTemplates: (userId: string) =>
    apiClient.get<FingerprintTemplate[]>(`/biometric/templates/${userId}`),

  deleteTemplate: (id: string) =>
    apiClient.delete(`/biometric/templates/${id}`),

  getTemplateForVerification: (userId: string, fingerIndex?: number) => {
    const params = fingerIndex ? `?fingerIndex=${fingerIndex}` : '';
    return apiClient.get<{ id: string; fingerIndex: number; templateData: string }>(`/biometric/templates/${userId}/verify${params}`);
  },

  // ─── Fingerprint Verification ───
  verifyAndMarkAttendance: (data: { userId: string; action: 'CHECKIN' | 'CHECKOUT'; matchScore: number; verified: boolean; deviceId?: string }) =>
    apiClient.post<VerifyResult>('/biometric/verify', data),

  // ─── Logs & Monitoring ───
  getLogs: (opts?: { userId?: string; result?: string; action?: string; startDate?: string; endDate?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.userId) params.set('userId', opts.userId);
    if (opts?.result) params.set('result', opts.result);
    if (opts?.action) params.set('action', opts.action);
    if (opts?.startDate) params.set('startDate', opts.startDate);
    if (opts?.endDate) params.set('endDate', opts.endDate);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiClient.get<BiometricLog[]>(`/biometric/logs${qs ? '?' + qs : ''}`);
  },

  getEnrollmentStatus: () =>
    apiClient.get<EnrollmentStatusItem[]>('/biometric/enrollment-status'),

  getFailedAttempts: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    return apiClient.get<FailedAttempt[]>(`/biometric/failed-attempts${qs ? '?' + qs : ''}`);
  },

  getDailyAttendance: (date: string) =>
    apiClient.get<DailyAttendanceReport>(`/biometric/daily-attendance/${date}`),

  // ─── Self-Service (staff accessing own data) ───
  getSelfEnrollmentStatus: () =>
    apiClient.get<{ enrolled: boolean; templateCount: number; templates: { fingerIndex: number; quality: number | null; enrolledAt: Date }[] }>('/biometric/self/enrollment-status'),

  getSelfTemplate: (fingerIndex?: number) => {
    const params = fingerIndex ? `?fingerIndex=${fingerIndex}` : '';
    return apiClient.get<{ id: string; fingerIndex: number; templateData: string }>(`/biometric/self/template${params}`);
  },

  selfVerifyAttendance: (data: { action: 'CHECKIN' | 'CHECKOUT'; matchScore: number; verified: boolean; deviceId?: string }) =>
    apiClient.post<VerifyResult>('/biometric/self/verify', data),
};
