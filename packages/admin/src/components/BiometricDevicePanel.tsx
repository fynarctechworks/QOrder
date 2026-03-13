import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  biometricService,
  type BiometricDevice,
} from '../services/biometricService';
import { biometricBridge, type BridgeStatus } from '../lib/biometricBridge';
import type { StaffMember } from '../services/staffService';

const SUB_TABS = ['devices', 'enrollment', 'attendance', 'logs'] as const;
type SubTab = typeof SUB_TABS[number];

const TAB_LABELS: Record<SubTab, string> = {
  devices: 'Devices',
  enrollment: 'Enrollment',
  attendance: 'Daily Attendance',
  logs: 'Verification Logs',
};

export default function BiometricDevicePanel({ staff }: { staff: StaffMember[] }) {
  const [subTab, setSubTab] = useState<SubTab>('devices');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Biometric Management</h2>
        <p className="text-xs text-text-muted mt-0.5">Fingerprint enrollment, attendance verification, and device management</p>
      </div>

      {/* Sub-tab bar */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              subTab === t ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {subTab === 'devices' && <DevicesTab staff={staff} />}
      {subTab === 'enrollment' && <EnrollmentTab staff={staff} />}
      {subTab === 'attendance' && <DailyAttendanceTab />}
      {subTab === 'logs' && <LogsTab />}
    </div>
  );
}

/* ═══════════════════ Devices Tab ═══════════════════ */

function DevicesTab({ staff }: { staff: StaffMember[] }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editDevice, setEditDevice] = useState<BiometricDevice | null>(null);
  const [form, setForm] = useState({ name: '', ip: '', port: 4370, type: 'USB_SCANNER' });
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['biometric-devices'],
    queryFn: biometricService.listDevices,
  });

  const addMut = useMutation({
    mutationFn: biometricService.addDevice,
    onSuccess: () => { toast.success('Device added'); qc.invalidateQueries({ queryKey: ['biometric-devices'] }); resetForm(); },
    onError: (err: Error) => toast.error(err.message || 'Failed to add device'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof biometricService.updateDevice>[1] }) =>
      biometricService.updateDevice(id, data),
    onSuccess: () => { toast.success('Device updated'); qc.invalidateQueries({ queryKey: ['biometric-devices'] }); resetForm(); },
    onError: (err: Error) => toast.error(err.message || 'Failed to update'),
  });

  const deleteMut = useMutation({
    mutationFn: biometricService.deleteDevice,
    onSuccess: () => { toast.success('Device deleted'); qc.invalidateQueries({ queryKey: ['biometric-devices'] }); },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete'),
  });

  const testMut = useMutation({
    mutationFn: ({ ip, port }: { ip: string; port: number }) => biometricService.testConnection(ip, port),
    onSuccess: (data) => {
      data.connected ? toast.success(`Connected! ${data.serialNumber ? `S/N: ${data.serialNumber}` : ''}`) : toast.error(`Connection failed: ${data.error}`);
    },
    onError: (err: Error) => toast.error(err.message || 'Connection test failed'),
  });

  const syncMut = useMutation({
    mutationFn: biometricService.syncAttendance,
    onSuccess: (data) => {
      toast.success(`Synced: ${data.created} created, ${data.skipped} skipped, ${data.unmapped} unmapped`);
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['biometric-devices'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Sync failed'),
  });

  const resetForm = () => { setShowForm(false); setEditDevice(null); setForm({ name: '', ip: '', port: 4370, type: 'USB_SCANNER' }); };
  const openEdit = (d: BiometricDevice) => { setEditDevice(d); setForm({ name: d.name, ip: d.ip || '', port: d.port, type: d.type || 'USB_SCANNER' }); setShowForm(true); };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (form.type === 'ZKDEVICE' && !form.ip.trim()) return toast.error('IP is required for ZKTeco devices');
    editDevice
      ? updateMut.mutate({ id: editDevice.id, data: form })
      : addMut.mutate({ name: form.name, ip: form.ip || undefined, port: form.port, type: form.type });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{devices.length} device{devices.length !== 1 ? 's' : ''} configured</p>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">
          + Add Device
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">{editDevice ? 'Edit Device' : 'Add New Device'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Device Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Main Entrance" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20">
                <option value="USB_SCANNER">USB Scanner (Bridge)</option>
                <option value="ZKDEVICE">ZKTeco (Network)</option>
              </select>
            </div>
            {form.type === 'ZKDEVICE' && (
              <>
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1">IP Address</label>
                  <input value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                    placeholder="192.168.1.201" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1">Port</label>
                  <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            {form.type === 'ZKDEVICE' && (
              <button onClick={() => testMut.mutate({ ip: form.ip, port: form.port })} disabled={testMut.isPending || !form.ip.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50">
                {testMut.isPending ? 'Testing...' : 'Test Connection'}
              </button>
            )}
            <button onClick={resetForm} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={addMut.isPending || updateMut.isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
              {editDevice ? 'Update' : 'Add Device'}
            </button>
          </div>
        </div>
      )}

      {/* Device list */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-40" />
              <div className="h-4 bg-gray-100 rounded w-32 mt-2" />
            </div>
          ))
        ) : devices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <p className="text-sm text-text-muted">No biometric devices added yet</p>
          </div>
        ) : devices.map(device => (
          <div key={device.id} className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${device.isActive ? 'bg-green-50' : 'bg-gray-100'}`}>
                    <svg className={`w-5 h-5 ${device.isActive ? 'text-green-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">{device.name}</h4>
                    <p className="text-xs text-text-muted">
                      {device.type === 'ZKDEVICE' ? `${device.ip}:${device.port}` : 'USB Scanner (Local Bridge)'}
                    </p>
                    {device.serialNumber && <p className="text-xs text-text-muted">S/N: {device.serialNumber}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${device.type === 'ZKDEVICE' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {device.type === 'ZKDEVICE' ? 'ZKTeco' : 'USB'}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${device.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {device.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-text-muted">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>Last used: {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleString() : 'Never'}</span>
                  {device.type === 'ZKDEVICE' && <span>Last sync: {device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString() : 'Never'}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {device.type === 'ZKDEVICE' && (
                    <>
                      <button onClick={() => syncMut.mutate(device.id)} disabled={syncMut.isPending}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50">
                        {syncMut.isPending ? 'Syncing...' : 'Sync'}
                      </button>
                      <button onClick={() => setSelectedDeviceId(selectedDeviceId === device.id ? null : device.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">
                        {selectedDeviceId === device.id ? 'Hide Users' : 'Map Users'}
                      </button>
                    </>
                  )}
                  <button onClick={() => openEdit(device)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => { if (confirm('Delete this device?')) deleteMut.mutate(device.id); }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {selectedDeviceId === device.id && device.type === 'ZKDEVICE' && (
              <DeviceUserMapping deviceId={device.id} staff={staff} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Device User Mapping (ZKTeco) ─── */
function DeviceUserMapping({ deviceId, staff }: { deviceId: string; staff: StaffMember[] }) {
  const qc = useQueryClient();

  const { data: deviceUsers = [], isLoading, error } = useQuery({
    queryKey: ['biometric-device-users', deviceId],
    queryFn: () => biometricService.getDeviceUsers(deviceId),
  });

  const mapMut = useMutation({
    mutationFn: biometricService.mapUser,
    onSuccess: () => { toast.success('User mapped'); qc.invalidateQueries({ queryKey: ['biometric-device-users', deviceId] }); qc.invalidateQueries({ queryKey: ['biometric-devices'] }); },
    onError: (err: Error) => toast.error(err.message || 'Failed to map user'),
  });

  const unmapMut = useMutation({
    mutationFn: biometricService.deleteUserMap,
    onSuccess: () => { toast.success('Mapping removed'); qc.invalidateQueries({ queryKey: ['biometric-device-users', deviceId] }); qc.invalidateQueries({ queryKey: ['biometric-devices'] }); },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove mapping'),
  });

  return (
    <div className="border-t border-gray-100 p-5 bg-gray-50/50">
      <h4 className="text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">Device Users → Staff Mapping</h4>
      {isLoading ? (
        <div className="animate-pulse space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded w-full" />)}</div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">Failed to connect. Check IP and ensure device is powered on.</div>
      ) : deviceUsers.length === 0 ? (
        <p className="text-sm text-text-muted">No users registered on this device</p>
      ) : (
        <div className="space-y-2">
          {deviceUsers.map(du => (
            <div key={du.uid} className="flex items-center gap-3 bg-white rounded-lg border border-gray-100 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary">{du.name || `User #${du.userId}`}</span>
                <span className="text-xs text-text-muted ml-2">ID: {du.userId}</span>
              </div>
              {du.mappedTo ? (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">
                    → {staff.find(s => s.id === du.mappedTo)?.name || 'Unknown'}
                  </span>
                  <button onClick={() => du.mapId && unmapMut.mutate(du.mapId)} className="text-xs text-red-500 hover:underline">Unmap</button>
                </div>
              ) : (
                <select defaultValue="" onChange={e => {
                  if (!e.target.value) return;
                  mapMut.mutate({ deviceUserId: Number(du.userId), userId: e.target.value, deviceId, deviceName: du.name });
                  e.target.value = '';
                }} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="">Map to staff...</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ Enrollment Tab ═══════════════════ */

function EnrollmentTab({ staff: _staff }: { staff: StaffMember[] }) {
  const qc = useQueryClient();
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('disconnected');
  const [enrollingUserId, setEnrollingUserId] = useState<string | null>(null);
  const [, setVerifyingUser] = useState<{ id: string; action: 'CHECKIN' | 'CHECKOUT' } | null>(null);

  const { data: enrollment = [], isLoading } = useQuery({
    queryKey: ['biometric-enrollment-status'],
    queryFn: biometricService.getEnrollmentStatus,
  });

  useEffect(() => {
    const unsub = biometricBridge.onStatus(setBridgeStatus);
    setBridgeStatus(biometricBridge.getStatus());
    return unsub;
  }, []);

  const connectBridge = useCallback(() => { biometricBridge.connect(); }, []);
  const disconnectBridge = useCallback(() => { biometricBridge.disconnect(); }, []);

  const enrollMut = useMutation({
    mutationFn: async (userId: string) => {
      toast('Place finger on the scanner...', { icon: '👆' });
      const capture = await biometricBridge.capture();
      return biometricService.enrollFingerprint({
        userId,
        templateData: capture.templateData,
        quality: capture.quality,
        deviceType: capture.deviceType,
      });
    },
    onSuccess: (data) => {
      toast.success(`Fingerprint enrolled! Quality: ${data.quality ?? 'N/A'}`);
      qc.invalidateQueries({ queryKey: ['biometric-enrollment-status'] });
      setEnrollingUserId(null);
    },
    onError: (err: Error) => { toast.error(err.message || 'Enrollment failed'); setEnrollingUserId(null); },
  });

  const verifyMut = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: 'CHECKIN' | 'CHECKOUT' }) => {
      toast('Place finger on the scanner...', { icon: '👆' });
      const storedTpl = await biometricService.getTemplateForVerification(userId);
      const capture = await biometricBridge.capture();
      const matchResult = await biometricBridge.match(capture.templateData, storedTpl.templateData);
      return biometricService.verifyAndMarkAttendance({
        userId, action,
        matchScore: matchResult.matchScore,
        verified: matchResult.verified,
      });
    },
    onSuccess: (data) => {
      toast.success(`${data.action === 'CHECKIN' ? 'Check-in' : 'Check-out'} successful for ${data.staffName} (Score: ${data.matchScore})`);
      qc.invalidateQueries({ queryKey: ['attendance'] });
      setVerifyingUser(null);
    },
    onError: (err: Error) => { toast.error(err.message || 'Verification failed'); setVerifyingUser(null); },
  });

  const bridgeConnected = bridgeStatus === 'connected';

  return (
    <div className="space-y-4">
      {/* Bridge Connection */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${bridgeConnected ? 'bg-green-500' : bridgeStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-gray-300'}`} />
          <div>
            <p className="text-sm font-medium text-text-primary">Fingerprint Scanner Bridge</p>
            <p className="text-xs text-text-muted">
              {bridgeConnected ? 'Connected — Ready to capture' : bridgeStatus === 'connecting' ? 'Connecting...' : 'Not connected — Start the bridge app on this computer'}
            </p>
          </div>
        </div>
        <button onClick={bridgeConnected ? disconnectBridge : connectBridge}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            bridgeConnected ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 'bg-primary text-white hover:bg-primary-hover'
          }`}>
          {bridgeConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* Enrollment status */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-text-primary">Staff Enrollment Status</h3>
          <p className="text-xs text-text-muted mt-0.5">
            {enrollment.filter(e => e.enrolled).length}/{enrollment.length} staff enrolled
          </p>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : enrollment.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No active staff found</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {enrollment.map(item => (
              <div key={item.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${item.enrolled ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <span className={`text-sm font-bold ${item.enrolled ? 'text-green-700' : 'text-gray-500'}`}>
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{item.name}</p>
                  <p className="text-xs text-text-muted">
                    {item.roleTitle || item.role}
                    {item.enrolled && ` · ${item.templateCount} fingerprint${item.templateCount > 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.enrolled ? (
                    <>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">Enrolled</span>
                      {/* Verify buttons */}
                      <button
                        onClick={() => { setVerifyingUser({ id: item.id, action: 'CHECKIN' }); verifyMut.mutate({ userId: item.id, action: 'CHECKIN' }); }}
                        disabled={!bridgeConnected || verifyMut.isPending}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50">
                        Check In
                      </button>
                      <button
                        onClick={() => { setVerifyingUser({ id: item.id, action: 'CHECKOUT' }); verifyMut.mutate({ userId: item.id, action: 'CHECKOUT' }); }}
                        disabled={!bridgeConnected || verifyMut.isPending}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50">
                        Check Out
                      </button>
                      {/* Re-enroll */}
                      <button
                        onClick={() => { setEnrollingUserId(item.id); enrollMut.mutate(item.id); }}
                        disabled={!bridgeConnected || enrollMut.isPending}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50"
                        title="Re-enroll fingerprint">
                        Re-enroll
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600 font-medium">Not Enrolled</span>
                      <button
                        onClick={() => { setEnrollingUserId(item.id); enrollMut.mutate(item.id); }}
                        disabled={!bridgeConnected || enrollMut.isPending}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
                        {enrollMut.isPending && enrollingUserId === item.id ? 'Capturing...' : 'Enroll Fingerprint'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ Daily Attendance Tab ═══════════════════ */

function DailyAttendanceTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: report, isLoading } = useQuery({
    queryKey: ['biometric-daily-attendance', date],
    queryFn: () => biometricService.getDailyAttendance(date),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        {report && (
          <div className="flex gap-4 text-sm">
            <span className="text-green-600 font-medium">{report.present} Present</span>
            <span className="text-red-600 font-medium">{report.absent} Absent</span>
            {report.failedAttempts > 0 && (
              <span className="text-amber-600 font-medium">{report.failedAttempts} Failed Attempts</span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : !report || report.staff.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No data for this date</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-text-muted">Staff</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Status</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Check In</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Check Out</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Hours</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Verifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {report.staff.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-text-primary">{s.name}</p>
                    <p className="text-xs text-text-muted">{s.roleTitle || s.role}</p>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {s.attendance ? (
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        s.attendance.status === 'PRESENT' ? 'bg-green-100 text-green-700'
                        : s.attendance.status === 'LATE' ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{s.attendance.status}</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600 font-medium">ABSENT</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center text-xs">{s.attendance?.checkIn ? new Date(s.attendance.checkIn).toLocaleTimeString() : '-'}</td>
                  <td className="px-5 py-3 text-center text-xs">{s.attendance?.checkOut ? new Date(s.attendance.checkOut).toLocaleTimeString() : '-'}</td>
                  <td className="px-5 py-3 text-center text-xs font-mono">{s.attendance?.hoursWorked != null ? Number(s.attendance.hoursWorked).toFixed(1) : '-'}</td>
                  <td className="px-5 py-3 text-center">
                    {s.verificationLogs.length > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs text-green-600">{s.verificationLogs.filter(l => l.result === 'SUCCESS').length} ok</span>
                        {s.verificationLogs.filter(l => l.result !== 'SUCCESS').length > 0 && (
                          <span className="text-xs text-red-500">{s.verificationLogs.filter(l => l.result !== 'SUCCESS').length} fail</span>
                        )}
                      </div>
                    ) : <span className="text-xs text-text-muted">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ Logs Tab ═══════════════════ */

function LogsTab() {
  const [filter, setFilter] = useState<'all' | 'failed'>('all');
  const [dateRange, setDateRange] = useState({ start: new Date().toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['biometric-logs', filter, dateRange],
    queryFn: () => filter === 'failed'
      ? biometricService.getFailedAttempts(dateRange.start, dateRange.end)
      : biometricService.getLogs({ startDate: dateRange.start, endDate: dateRange.end, limit: 200 }),
  });

  const resultColors: Record<string, string> = {
    SUCCESS: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-600',
    REJECTED: 'bg-orange-100 text-orange-700',
    SPOOF_DETECTED: 'bg-purple-100 text-purple-700',
  };

  const actionLabels: Record<string, string> = {
    ENROLL: 'Enrollment',
    CHECKIN: 'Check-in',
    CHECKOUT: 'Check-out',
    VERIFY: 'Verification',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === 'all' ? 'bg-white shadow-sm text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
            All Logs
          </button>
          <button onClick={() => setFilter('failed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === 'failed' ? 'bg-white shadow-sm text-red-600' : 'text-text-secondary hover:text-text-primary'}`}>
            Failed Only
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateRange.start} onChange={e => setDateRange(d => ({ ...d, start: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20" />
          <span className="text-xs text-text-muted">to</span>
          <input type="date" value={dateRange.end} onChange={e => setDateRange(d => ({ ...d, end: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {logsLoading ? (
          <div className="p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No logs found for this period</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-text-muted">Time</th>
                <th className="text-left px-5 py-3 font-medium text-text-muted">Staff</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Action</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Result</th>
                <th className="text-center px-5 py-3 font-medium text-text-muted">Score</th>
                <th className="text-left px-5 py-3 font-medium text-text-muted">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 text-xs text-text-secondary whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-sm">{log.staffName || log.userId || 'Unknown'}</td>
                  <td className="px-5 py-2.5 text-center">
                    <span className="text-xs font-medium">{actionLabels[log.action] || log.action}</span>
                  </td>
                  <td className="px-5 py-2.5 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${resultColors[log.result] || 'bg-gray-100 text-gray-600'}`}>
                      {log.result}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-center text-xs font-mono">{log.matchScore != null ? log.matchScore : '-'}</td>
                  <td className="px-5 py-2.5 text-xs text-text-muted truncate max-w-[200px]">{log.errorMessage || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
