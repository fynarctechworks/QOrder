import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { staffManagementService } from '../services/staffManagementService';
import { staffService } from '../services/staffService';
import type { StaffMember } from '../services/staffService';
import type { StaffShift, AttendanceRecord, LeaveRequest, PayrollRun, PayrollConfig } from '../services/staffManagementService';
import { useCurrency } from '../hooks/useCurrency';
import { useAuth } from '../context/AuthContext';

const ALL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'payroll', label: 'Payroll' },
] as const;

const ADMIN_ROLES = ['OWNER', 'ADMIN'] as const;

type TabKey = typeof ALL_TABS[number]['key'];

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Cashier',
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  MANAGER: 'bg-amber-100 text-amber-700',
  STAFF: 'bg-gray-100 text-gray-700',
};

export default function StaffManagementPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role as any);
  const STAFF_TABS: TabKey[] = ['attendance', 'leave'];
  const TABS = isAdmin ? ALL_TABS : ALL_TABS.filter(t => STAFF_TABS.includes(t.key));
  const defaultTab: TabKey = isAdmin ? 'overview' : 'attendance';
  const [tab, setTab] = useState<TabKey>(defaultTab);

  const { data: staffList = [], isLoading: staffLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => staffService.list(),
    enabled: isAdmin,
  });

  // Only non-owner active staff
  const activeStaff = staffList.filter(s => s.role !== 'OWNER' && s.isActive);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          {isAdmin ? 'Staff Management' : 'Leave Management'}
        </h1>
        <p className="text-sm text-text-muted mt-0.5">
          {isAdmin ? 'Manage shifts, attendance, leave, and payroll' : 'View your attendance and manage leave requests'}
        </p>
      </div>

      {/* Tab Bar — only show if more than 1 tab */}
      {TABS.length > 1 && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.key ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}>
              {tab === t.key && (
                <motion.div layoutId="staffTab" className="absolute inset-0 bg-white rounded-lg shadow-sm" />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && isAdmin && <OverviewTab staff={staffList.filter(s => s.role !== 'OWNER')} loading={staffLoading} onNavigate={setTab} />}
      {tab === 'shifts' && isAdmin && <ShiftsTab />}
      {tab === 'attendance' && isAdmin && <AttendanceTab staff={activeStaff} />}
      {tab === 'attendance' && !isAdmin && <MyAttendanceTab />}
      {tab === 'leave' && <LeaveTab staff={activeStaff} isAdmin={isAdmin} currentUserId={user?.id ?? ''} />}
      {tab === 'payroll' && isAdmin && <PayrollTab staff={activeStaff} />}
    </div>
  );
}

/* ─── Overview Tab ──────────────────────────────────── */
function OverviewTab({ staff, loading, onNavigate }: { staff: StaffMember[]; loading: boolean; onNavigate: (tab: TabKey) => void }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const { data: attendanceRes } = useQuery({
    queryKey: ['attendance', todayStr],
    queryFn: () => staffManagementService.getAttendance({ startDate: todayStr, endDate: todayStr }),
  });

  const { data: leavesRes } = useQuery({
    queryKey: ['leaves-pending'],
    queryFn: () => staffManagementService.getLeaves({ status: 'PENDING' }),
  });

  const { data: payrollRes } = useQuery({
    queryKey: ['payroll', now.getMonth() + 1, now.getFullYear()],
    queryFn: () => staffManagementService.getPayrollRuns(now.getMonth() + 1, now.getFullYear()),
  });

  const todayAttendance: AttendanceRecord[] = (attendanceRes as AttendanceRecord[] | undefined) ?? [];
  const pendingLeaves: LeaveRequest[] = (leavesRes as LeaveRequest[] | undefined) ?? [];
  const payrollRuns: PayrollRun[] = (payrollRes as PayrollRun[] | undefined) ?? [];

  const activeCount = staff.filter(s => s.isActive).length;
  const presentToday = todayAttendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
  const pendingPayroll = payrollRuns.filter(r => !r.isPaid).length;

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Staff', value: String(activeCount), color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Present Today', value: `${presentToday}/${activeCount}`, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Pending Leave', value: String(pendingLeaves.length), color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Unpaid Payroll', value: String(pendingPayroll), color: 'text-red-600', bg: 'bg-red-50' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-text-muted font-medium uppercase tracking-wider">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Staff Directory */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Staff Directory</h3>
          <span className="text-xs text-text-muted">{staff.length} members</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-text-muted">Name</th>
              <th className="text-left px-5 py-3 font-medium text-text-muted">Role</th>
              <th className="text-left px-5 py-3 font-medium text-text-muted">Username</th>
              <th className="text-center px-5 py-3 font-medium text-text-muted">Status</th>
              <th className="text-left px-5 py-3 font-medium text-text-muted">Today</th>
              <th className="text-right px-5 py-3 font-medium text-text-muted">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-5 py-3.5"><div className="h-4 bg-gray-100 rounded w-20" /></td>)}
                </tr>
              ))
            ) : staff.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-text-muted">
                No staff members yet. Add staff from Settings → Staff tab.
              </td></tr>
            ) : staff.map(member => {
              const attendance = todayAttendance.find(a => a.userId === member.id);
              const attendanceStatus = attendance?.status;
              const attendanceBadge: Record<string, string> = {
                PRESENT: 'bg-green-100 text-green-700',
                ABSENT: 'bg-red-100 text-red-700',
                LATE: 'bg-amber-100 text-amber-700',
                HALF_DAY: 'bg-orange-100 text-orange-700',
                ON_LEAVE: 'bg-purple-100 text-purple-700',
              };
              return (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-semibold text-primary">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{member.name}</p>
                        {member.email && <p className="text-xs text-text-muted">{member.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-600'}`}>
                      {member.roleTitle || ROLE_LABELS[member.role] || member.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-text-secondary">{member.username}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${member.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${member.isActive ? 'bg-green-500' : 'bg-red-400'}`} />
                      {member.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {attendanceStatus ? (
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${attendanceBadge[attendanceStatus] || ''}`}>
                        {attendanceStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">Not marked</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-text-muted text-xs">{timeAgo(member.lastLoginAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => onNavigate('attendance')}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:border-primary/30 hover:shadow-md transition-all group">
          <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">Mark Attendance</p>
          <p className="text-xs text-text-muted mt-1">Record today's attendance for your staff</p>
        </button>
        <button onClick={() => onNavigate('leave')}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:border-primary/30 hover:shadow-md transition-all group">
          <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">Manage Leave</p>
          <p className="text-xs text-text-muted mt-1">{pendingLeaves.length > 0 ? `${pendingLeaves.length} pending request${pendingLeaves.length > 1 ? 's' : ''}` : 'No pending requests'}</p>
        </button>
        <button onClick={() => onNavigate('payroll')}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:border-primary/30 hover:shadow-md transition-all group">
          <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">Run Payroll</p>
          <p className="text-xs text-text-muted mt-1">Generate and manage monthly payroll</p>
        </button>
      </div>
    </div>
  );
}

/* ─── Staff Picker ──────────────────────────────────── */
function StaffPicker({ staff, value, onChange, label = 'Staff Member' }: {
  staff: StaffMember[]; value: string; onChange: (id: string) => void; label?: string;
}) {
  return (
    <div className="flex-1 min-w-[180px]">
      <label className="text-xs font-medium text-text-muted block mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20">
        <option value="">Select staff...</option>
        {staff.map(s => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.roleTitle || s.role})
          </option>
        ))}
      </select>
    </div>
  );
}

function staffName(staff: StaffMember[], userId: string): string {
  const s = staff.find(m => m.id === userId);
  return s ? s.name : userId.slice(0, 12) + '…';
}

/* ─── Shifts ────────────────────────────────────────── */
function ShiftsTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editShift, setEditShift] = useState<StaffShift | null>(null);
  const [form, setForm] = useState({ name: '', shiftType: 'MORNING', startTime: '09:00', endTime: '17:00', breakMinutes: 30 });

  const { data: res, isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => staffManagementService.getShifts(),
  });

  const createMut = useMutation({
    mutationFn: (d: typeof form) => staffManagementService.createShift(d),
    onSuccess: () => { toast.success('Shift created'); qc.invalidateQueries({ queryKey: ['shifts'] }); resetForm(); },
    onError: () => toast.error('Failed to create shift'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof form }) => staffManagementService.updateShift(id, data),
    onSuccess: () => { toast.success('Shift updated'); qc.invalidateQueries({ queryKey: ['shifts'] }); resetForm(); },
    onError: () => toast.error('Failed to update shift'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => staffManagementService.deleteShift(id),
    onSuccess: () => { toast.success('Shift deleted'); qc.invalidateQueries({ queryKey: ['shifts'] }); },
    onError: () => toast.error('Failed to delete'),
  });

  const resetForm = () => { setShowForm(false); setEditShift(null); setForm({ name: '', shiftType: 'MORNING', startTime: '09:00', endTime: '17:00', breakMinutes: 30 }); };
  const openEdit = (s: StaffShift) => { setEditShift(s); setForm({ name: s.name, shiftType: s.shiftType, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes }); setShowForm(true); };
  const handleSubmit = () => editShift ? updateMut.mutate({ id: editShift.id, data: form }) : createMut.mutate(form);

  const shifts: StaffShift[] = (res as StaffShift[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Shift Templates</h2>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">
          + Add Shift
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Morning Shift" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Type</label>
              <select value={form.shiftType} onChange={e => setForm(f => ({ ...f, shiftType: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20">
                {['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'SPLIT', 'CUSTOM'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Start</label>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">End</label>
              <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Break (min)</label>
              <input type="number" value={form.breakMinutes} onChange={e => setForm(f => ({ ...f, breakMinutes: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={resetForm}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSubmit}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">
              {editShift ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Name</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Type</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Timing</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Break</th>
              <th className="text-right px-4 py-3 font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-20" /></td>)}
                </tr>
              ))
            ) : shifts.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-text-muted">No shifts defined yet</td></tr>
            ) : shifts.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 font-medium">{s.shiftType}</span></td>
                <td className="px-4 py-3 tabular-nums">{s.startTime} – {s.endTime}</td>
                <td className="px-4 py-3">{s.breakMinutes} min</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(s)} className="text-xs text-primary hover:underline mr-3">Edit</button>
                  <button onClick={() => deleteMut.mutate(s.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Attendance ────────────────────────────────────── */
function AttendanceTab({ staff }: { staff: StaffMember[] }) {
  const qc = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState(todayStr);
  const [markForm, setMarkForm] = useState({ userId: '', date: todayStr, status: 'PRESENT', checkIn: '' });

  const { data: res, isLoading } = useQuery({
    queryKey: ['attendance', filterDate],
    queryFn: () => staffManagementService.getAttendance({ startDate: filterDate, endDate: filterDate }),
  });

  const markMut = useMutation({
    mutationFn: (d: typeof markForm) => staffManagementService.markAttendance(d),
    onSuccess: () => { toast.success('Attendance marked'); qc.invalidateQueries({ queryKey: ['attendance'] }); setMarkForm(f => ({ ...f, userId: '', checkIn: '' })); },
    onError: (err: Error) => toast.error(err.message || 'Failed to mark'),
  });

  const checkOutMut = useMutation({
    mutationFn: (d: { userId: string; date: string; checkOut: string }) => staffManagementService.checkOut(d),
    onSuccess: () => { toast.success('Checked out'); qc.invalidateQueries({ queryKey: ['attendance'] }); },
    onError: (err: Error) => toast.error(err.message || 'Failed to check out'),
  });

  const records: AttendanceRecord[] = (res as AttendanceRecord[] | undefined) ?? [];

  const STATUS_COLORS: Record<string, string> = {
    PRESENT: 'bg-green-100 text-green-700',
    ABSENT: 'bg-red-100 text-red-700',
    LATE: 'bg-amber-100 text-amber-700',
    HALF_DAY: 'bg-orange-100 text-orange-700',
    ON_LEAVE: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">Date</label>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      {/* Quick Mark */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Mark Attendance</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <StaffPicker staff={staff} value={markForm.userId} onChange={id => setMarkForm(f => ({ ...f, userId: id }))} />
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1">Status</label>
            <select value={markForm.status} onChange={e => setMarkForm(f => ({ ...f, status: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20">
              {['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1">Check In</label>
            <input type="time" value={markForm.checkIn} onChange={e => setMarkForm(f => ({ ...f, checkIn: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <button onClick={() => markMut.mutate(markForm)} disabled={!markForm.userId}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
            Mark
          </button>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Staff</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Status</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Check In</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Check Out</th>
              <th className="text-right px-4 py-3 font-medium text-text-muted">Hours</th>
              <th className="text-right px-4 py-3 font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>)}
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-text-muted">No attendance records</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-text-primary">{staffName(staff, r.userId)}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span></td>
                <td className="px-4 py-3 tabular-nums">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}</td>
                <td className="px-4 py-3 tabular-nums">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.hoursWorked != null ? Number(r.hoursWorked).toFixed(1) : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {!r.checkOut && r.status === 'PRESENT' && (
                    <button onClick={() => checkOutMut.mutate({ userId: r.userId, date: filterDate, checkOut: new Date().toTimeString().slice(0, 5) })}
                      className="text-xs text-primary hover:underline">Check Out</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── My Attendance (Staff self-view) ───────────────── */
function MyAttendanceTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState(todayStr);
  const [checkIn, setCheckIn] = useState('');

  const { data: res, isLoading } = useQuery({
    queryKey: ['attendance', 'my', filterDate],
    queryFn: () => staffManagementService.getAttendance({ startDate: filterDate, endDate: filterDate }),
  });

  const markMut = useMutation({
    mutationFn: (d: { userId: string; date: string; status: string; checkIn: string }) => staffManagementService.markAttendance(d),
    onSuccess: () => { toast.success('Attendance marked'); qc.invalidateQueries({ queryKey: ['attendance'] }); setCheckIn(''); },
    onError: (err: Error) => toast.error(err.message || 'Failed to mark attendance'),
  });

  const checkOutMut = useMutation({
    mutationFn: (d: { userId: string; date: string; checkOut: string }) => staffManagementService.checkOut(d),
    onSuccess: () => { toast.success('Checked out'); qc.invalidateQueries({ queryKey: ['attendance'] }); },
    onError: (err: Error) => toast.error(err.message || 'Failed to check out'),
  });

  const records: AttendanceRecord[] = (res as AttendanceRecord[] | undefined) ?? [];
  const hasRecordToday = filterDate === todayStr && records.length > 0;
  const todayRecord = filterDate === todayStr ? records[0] : null;

  const STATUS_COLORS: Record<string, string> = {
    PRESENT: 'bg-green-100 text-green-700',
    ABSENT: 'bg-red-100 text-red-700',
    LATE: 'bg-amber-100 text-amber-700',
    HALF_DAY: 'bg-orange-100 text-orange-700',
    ON_LEAVE: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">Date</label>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      {/* Mark Attendance (only for today, if not already marked) */}
      {filterDate === todayStr && !hasRecordToday && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Mark Attendance</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Check In</label>
              <input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button
              onClick={() => markMut.mutate({ userId: user!.id, date: todayStr, status: 'PRESENT', checkIn })}
              disabled={markMut.isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
              Check In
            </button>
          </div>
        </div>
      )}

      {/* Check Out (if checked in today but not checked out) */}
      {todayRecord && !todayRecord.checkOut && todayRecord.status === 'PRESENT' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">You're checked in</h3>
              <p className="text-xs text-text-muted mt-0.5">Checked in at {todayRecord.checkIn ? new Date(todayRecord.checkIn).toLocaleTimeString() : '—'}</p>
            </div>
            <button
              onClick={() => checkOutMut.mutate({ userId: user!.id, date: todayStr, checkOut: new Date().toTimeString().slice(0, 5) })}
              disabled={checkOutMut.isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50">
              Check Out
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Status</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Check In</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Check Out</th>
              <th className="text-right px-4 py-3 font-medium text-text-muted">Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 4 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>)}
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-text-muted">No attendance records for this date</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span></td>
                <td className="px-4 py-3 tabular-nums">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}</td>
                <td className="px-4 py-3 tabular-nums">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.hoursWorked != null ? Number(r.hoursWorked).toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Leave ─────────────────────────────────────────── */
function LeaveTab({ staff, isAdmin, currentUserId }: { staff: StaffMember[]; isAdmin: boolean; currentUserId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ userId: isAdmin ? '' : currentUserId, leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' });

  const { data: res, isLoading } = useQuery({
    queryKey: ['leaves', isAdmin ? 'all' : currentUserId],
    queryFn: () => staffManagementService.getLeaves(isAdmin ? {} : { userId: currentUserId }),
  });

  const requestMut = useMutation({
    mutationFn: (d: typeof form) => staffManagementService.requestLeave({ ...d, userId: isAdmin ? d.userId : currentUserId }),
    onSuccess: () => { toast.success('Leave requested'); qc.invalidateQueries({ queryKey: ['leaves'] }); setShowForm(false); },
    onError: () => toast.error('Failed to request'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => staffManagementService.updateLeaveStatus(id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['leaves'] }); },
    onError: () => toast.error('Failed to update'),
  });

  const leaves: LeaveRequest[] = (res as LeaveRequest[] | undefined) ?? [];

  const STATUS_BADGES: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Leave Requests</h2>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">
          + Request Leave
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {isAdmin ? (
              <StaffPicker staff={staff} value={form.userId} onChange={id => setForm(f => ({ ...f, userId: id }))} />
            ) : null}
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Type</label>
              <select value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20">
                {['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'COMPENSATORY'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">From</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">To</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-text-muted block mb-1">Reason</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={() => requestMut.mutate(form)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">Submit</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-text-muted">User</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Type</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Period</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-text-muted">Status</th>
              <th className="text-right px-4 py-3 font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>)}
                </tr>
              ))
            ) : leaves.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-text-muted">No leave requests</td></tr>
            ) : leaves.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-text-primary">{staffName(staff, l.userId)}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 font-medium">{l.leaveType}</span></td>
                <td className="px-4 py-3 tabular-nums text-xs">{new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-text-secondary max-w-[200px] truncate">{l.reason || '—'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_BADGES[l.status] || ''}`}>{l.status}</span></td>
                <td className="px-4 py-3 text-right">
                  {l.status === 'PENDING' && isAdmin && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => statusMut.mutate({ id: l.id, status: 'APPROVED' })}
                        className="text-xs text-green-600 hover:underline">Approve</button>
                      <button onClick={() => statusMut.mutate({ id: l.id, status: 'REJECTED' })}
                        className="text-xs text-red-500 hover:underline">Reject</button>
                    </div>
                  )}
                  {l.status === 'PENDING' && !isAdmin && (
                    <button onClick={() => statusMut.mutate({ id: l.id, status: 'CANCELLED' })}
                      className="text-xs text-red-500 hover:underline">Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Payroll Config Modal ──────────────────────────── */
function KVEditor({ label, entries, onChange, placeholder }: {
  label: string; entries: [string, number][]; onChange: (e: [string, number][]) => void; placeholder: { name: string; amount: string };
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-text-muted">{label}</label>
        <button type="button" onClick={() => onChange([...entries, ['', 0]])}
          className="text-xs text-primary hover:text-primary-hover font-medium">+ Add</button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-1">No {label.toLowerCase()} added</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v], i) => (
            <div key={i} className="flex gap-2 items-center">
              <input type="text" value={k} placeholder={placeholder.name}
                onChange={e => { const n = [...entries] as [string, number][]; n[i] = [e.target.value, v]; onChange(n); }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              <input type="number" min={0} value={v} placeholder={placeholder.amount}
                onChange={e => { const n = [...entries] as [string, number][]; n[i] = [k, Number(e.target.value)]; onChange(n); }}
                className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              <button type="button" onClick={() => onChange(entries.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 text-lg leading-none">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PayrollConfigModal({ staff, userId, onClose }: {
  staff: StaffMember[]; userId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [baseSalary, setBaseSalary] = useState(0);
  const [overtimeRate, setOvertimeRate] = useState(1.5);
  const [payDay, setPayDay] = useState(1);
  const [allowances, setAllowances] = useState<[string, number][]>([]);
  const [deductions, setDeductions] = useState<[string, number][]>([]);

  const { data: configData, isLoading } = useQuery({
    queryKey: ['payroll-config', userId],
    queryFn: () => staffManagementService.getPayrollConfig(userId),
    enabled: !!userId,
  });

  useEffect(() => {
    const data = configData as PayrollConfig | null;
    if (data) {
      setBaseSalary(Number(data.baseSalary) || 0);
      setOvertimeRate(Number(data.overtimeRate) || 1.5);
      setPayDay(data.payDay || 1);
      const a = data.allowances ?? {};
      setAllowances(Object.entries(a).map(([k, v]) => [k, Number(v)]));
      const d = data.deductions ?? {};
      setDeductions(Object.entries(d).map(([k, v]) => [k, Number(v)]));
    }
  }, [configData]);

  const saveMut = useMutation({
    mutationFn: () => {
      const allowObj: Record<string, number> = {};
      for (const [k, v] of allowances) { if (k.trim()) allowObj[k.trim()] = v; }
      const deductObj: Record<string, number> = {};
      for (const [k, v] of deductions) { if (k.trim()) deductObj[k.trim()] = v; }
      return staffManagementService.upsertPayrollConfig(userId, {
        baseSalary,
        overtimeRate,
        payDay,
        allowances: allowObj,
        deductions: deductObj,
      } as Partial<PayrollConfig>);
    },
    onSuccess: () => {
      toast.success('Payroll config saved');
      qc.invalidateQueries({ queryKey: ['payroll-config'] });
      onClose();
    },
    onError: () => toast.error('Failed to save config'),
  });

  const name = staff.find(s => s.id === userId)?.name ?? 'Staff';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Configure Payroll — {name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Base Salary (monthly)</label>
              <input type="number" min={0} value={baseSalary}
                onChange={e => setBaseSalary(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Overtime Rate (multiplier)</label>
                <input type="number" step={0.1} min={0} value={overtimeRate}
                  onChange={e => setOvertimeRate(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Pay Day (of month)</label>
                <input type="number" min={1} max={31} value={payDay}
                  onChange={e => setPayDay(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <KVEditor label="Allowances" entries={allowances} onChange={setAllowances}
              placeholder={{ name: 'e.g. HRA', amount: 'Amount' }} />

            <KVEditor label="Deductions" entries={deductions} onChange={setDeductions}
              placeholder={{ name: 'e.g. PF', amount: 'Amount' }} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-text-muted hover:bg-gray-50">Cancel</button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Payroll ───────────────────────────────────────── */
function PayrollTab({ staff }: { staff: StaffMember[] }) {
  const qc = useQueryClient();
  const formatCurrency = useCurrency();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [genForm, setGenForm] = useState({ userId: '', month: now.getMonth() + 1, year: now.getFullYear() });
  const [configUserId, setConfigUserId] = useState<string | null>(null);

  const { data: res, isLoading } = useQuery({
    queryKey: ['payroll', month, year],
    queryFn: () => staffManagementService.getPayrollRuns(month, year),
  });

  const genMut = useMutation({
    mutationFn: (d: typeof genForm) => staffManagementService.generatePayroll(d),
    onSuccess: () => { toast.success('Payroll generated'); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: () => toast.error('Failed to generate'),
  });

  const paidMut = useMutation({
    mutationFn: (id: string) => staffManagementService.markPaid(id),
    onSuccess: () => { toast.success('Marked as paid'); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: () => toast.error('Failed to update'),
  });

  const runs: PayrollRun[] = (res as PayrollRun[] | undefined) ?? [];
  const totalNet = runs.reduce((s, r) => s + Number(r.netPay), 0);
  const totalPaid = runs.filter(r => r.isPaid).reduce((s, r) => s + Number(r.netPay), 0);

  const handleGenerate = () => {
    if (!genForm.userId) { toast.error('Please select a staff member'); return; }
    genMut.mutate({ ...genForm, month, year });
  };

  return (
    <div className="space-y-4">
      {/* Config Modal */}
      {configUserId && (
        <PayrollConfigModal staff={staff} userId={configUserId} onClose={() => setConfigUserId(null)} />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Payroll', value: formatCurrency(totalNet) },
          { label: 'Paid', value: formatCurrency(totalPaid) },
          { label: 'Pending', value: formatCurrency(totalNet - totalPaid) },
          { label: 'Staff Count', value: String(runs.length) },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-text-muted font-medium uppercase tracking-wider">{m.label}</p>
            <p className="text-xl font-bold text-text-primary mt-1 tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Filters & Generate */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{new Date(2024, m - 1).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">Year</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="ml-auto flex gap-3 items-end">
          <StaffPicker staff={staff} value={genForm.userId} onChange={id => setGenForm(f => ({ ...f, userId: id }))} />
          <button onClick={() => { if (!genForm.userId) { toast.error('Select a staff member first'); return; } setConfigUserId(genForm.userId); }}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-text-muted hover:bg-gray-50 transition-colors"
            title="Configure salary">
            ⚙️ Configure
          </button>
          <button onClick={handleGenerate} disabled={genMut.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
            {genMut.isPending ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-text-muted">User</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Base</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Overtime</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Allowances</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Deductions</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Net Pay</th>
                <th className="text-center px-4 py-3 font-medium text-text-muted">Days</th>
                <th className="text-center px-4 py-3 font-medium text-text-muted">Status</th>
                <th className="text-right px-4 py-3 font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>)}
                  </tr>
                ))
              ) : runs.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-text-muted">No payroll runs for this period</td></tr>
              ) : runs.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-text-primary">{staffName(staff, r.userId)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(Number(r.baseSalary))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(Number(r.overtime))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatCurrency(Number(r.allowances))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatCurrency(Number(r.deductions))}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(Number(r.netPay))}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-xs">{r.daysPresent}/{r.workingDays}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${r.isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {r.isPaid ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!r.isPaid && (
                      <button onClick={() => paidMut.mutate(r.id)} className="text-xs text-green-600 hover:underline">Mark Paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
