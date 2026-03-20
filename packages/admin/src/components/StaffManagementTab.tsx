import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { staffService, type StaffMember, type CreateStaffInput } from '../services/staffService';
import { branchService } from '../services/branchService';
import { settingsService } from '../services/settingsService';
import { staffManagementService, type StaffShift } from '../services/staffManagementService';
import { biometricService } from '../services/biometricService';
import { biometricBridge, type BridgeStatus } from '../lib/biometricBridge';

/* ═══════════════════════ Helpers ═══════════════════════════ */

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

function RoleBadge({ role, roleTitle }: { role: string; roleTitle?: string | null }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'}`}>
      {roleTitle || ROLE_LABELS[role] || role}
    </span>
  );
}

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

/* ═══════════════════ Create Staff Modal ═══════════════════ */

function CreateStaffModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'details' | 'fingerprint'>('details');
  const [createdStaff, setCreatedStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<CreateStaffInput>({
    email: '',
    username: '',
    password: '',
    name: '',
    role: '' as any,
    roleTitle: '',
    branchIds: [],
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Fingerprint bridge state
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('disconnected');
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enrollQuality, setEnrollQuality] = useState<number | null>(null);

  useEffect(() => {
    const unsub = biometricBridge.onStatus(setBridgeStatus);
    setBridgeStatus(biometricBridge.getStatus());
    return unsub;
  }, []);

  const connectBridge = useCallback(() => { biometricBridge.connect(); }, []);

  const resetAll = () => {
    setForm({ email: '', username: '', password: '', name: '', role: '' as any, roleTitle: '', branchIds: [] });
    setConfirmPassword('');
    setStep('details');
    setCreatedStaff(null);
    setEnrolled(false);
    setEnrollQuality(null);
    setEnrolling(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: branchService.getAll,
    staleTime: 30_000,
  });

  const { data: restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  const { data: shifts = [] } = useQuery<StaffShift[]>({
    queryKey: ['shifts'],
    queryFn: () => staffManagementService.getShifts(),
    staleTime: 30_000,
  });

  const customRoles = (() => {
    const s = (restaurant?.settings ?? {}) as Record<string, unknown>;
    const rp = s.rolePermissions as Record<string, unknown> | undefined;
    if (!rp) return [];
    return Object.keys(rp).filter((k) => !['ADMIN', 'MANAGER', 'STAFF', 'OWNER'].includes(k));
  })();

  const mutation = useMutation({
    mutationFn: async () => {
      const staff = await staffService.create({
        ...form,
        email: form.email?.trim() || undefined,
        roleTitle: form.roleTitle?.trim() || undefined,
      });
      return staff;
    },
    onSuccess: (staff) => {
      toast.success('Staff member created — now register fingerprint');
      onCreated();
      setCreatedStaff(staff);
      setStep('fingerprint');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create staff'),
  });

  const handleEnroll = async () => {
    if (!createdStaff) return;
    setEnrolling(true);
    try {
      toast('Place finger on the scanner...', { icon: '👆' });
      const capture = await biometricBridge.capture();
      const result = await biometricService.enrollFingerprint({
        userId: createdStaff.id,
        templateData: capture.templateData,
        quality: capture.quality,
        deviceType: capture.deviceType,
      });
      setEnrolled(true);
      setEnrollQuality(result.quality);
      toast.success(`Fingerprint enrolled! Quality: ${result.quality ?? 'N/A'}`);
      qc.invalidateQueries({ queryKey: ['biometric-enrollment-status'] });
    } catch (err: any) {
      toast.error(err.message || 'Enrollment failed');
    } finally {
      setEnrolling(false);
    }
  };

  const handleRoleSelect = (role: string) => {
    const baseRoles = ['ADMIN', 'MANAGER', 'STAFF'];
    const isBase = baseRoles.includes(role);
    const isSame = isBase ? (form.role === role && !form.roleTitle) : form.roleTitle === role;

    if (isSame) {
      // Deselect
      setForm({ ...form, role: '' as any, roleTitle: '' });
    } else if (isBase) {
      setForm({ ...form, role: role as any, roleTitle: '' });
    } else {
      // Custom role — use STAFF as base role for backend auth
      setForm({ ...form, role: 'STAFF', roleTitle: role });
    }
  };

  const toggleBranch = (id: string) => {
    setForm((prev) => ({
      ...prev,
      branchIds: prev.branchIds?.includes(id)
        ? prev.branchIds.filter((b) => b !== id)
        : [...(prev.branchIds || []), id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.username.trim()) return toast.error('Username is required');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.password !== confirmPassword) return toast.error('Passwords do not match');
    if (!form.role) return toast.error('Please select a role');
    if (branches.length > 0 && !form.branchIds?.length) return toast.error('Please assign at least one branch');
    mutation.mutate();
  };

  const hasRole = !!form.role;

  if (!isOpen) return null;

  const bridgeConnected = bridgeStatus === 'connected';

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={step === 'details' ? handleClose : undefined}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Step indicator */}
        <div className="px-6 pt-5 pb-2 flex items-center gap-2 shrink-0">
          <div className={`flex items-center gap-1.5 ${step === 'details' ? 'text-primary' : 'text-green-600'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === 'details' ? 'bg-primary text-white' : 'bg-green-100 text-green-700'
            }`}>
              {step === 'details' ? '1' : '\u2713'}
            </div>
            <span className="text-xs font-medium">Details</span>
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className={`flex items-center gap-1.5 ${step === 'fingerprint' ? 'text-primary' : 'text-text-muted'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === 'fingerprint' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'
            }`}>2</div>
            <span className="text-xs font-medium">Fingerprint</span>
          </div>
        </div>

        {/* ─── Step 1: Staff Details ─── */}
        {step === 'details' && (
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-3 pb-4 flex items-center gap-3 border-b border-gray-100 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-text-primary">Add Staff Member</h3>
              <p className="text-xs text-text-muted mt-0.5">Create a new account for your team</p>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-6 py-5 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. John Doe"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Email <span className="text-text-muted font-normal">(optional)</span></label>
              <input
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@example.com"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                placeholder="john_doe"
                autoComplete="new-username"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 pr-11 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showPassword
                      ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    } />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${
                  confirmPassword && confirmPassword !== form.password ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {confirmPassword && confirmPassword !== form.password && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Role <span className="text-red-400">*</span></label>
              <div className="flex flex-wrap gap-2">
                {customRoles.map((cr) => (
                  <button
                    key={cr}
                    type="button"
                    onClick={() => handleRoleSelect(cr)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      form.roleTitle === cr
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 bg-gray-50 text-text-secondary hover:border-gray-300'
                    }`}
                  >
                    {cr}
                  </button>
                ))}
              </div>
              {!hasRole && (
                <p className="text-xs text-amber-600 mt-2">Please select a role for this staff member</p>
              )}
              {form.roleTitle && <p className="text-xs text-text-muted mt-2">Custom role — permissions managed in the Permissions tab</p>}
              {customRoles.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">No roles found. Create roles in Settings &rarr; Permissions first.</p>
              )}
            </div>

            {/* Default Shift */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Default Shift <span className="text-text-muted font-normal">(for attendance tracking)</span>
              </label>
              <select
                value={form.defaultShiftId || ''}
                onChange={(e) => setForm({ ...form, defaultShiftId: e.target.value || null })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="">No shift assigned</option>
                {shifts.filter(s => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.startTime} – {s.endTime})</option>
                ))}
              </select>
              <p className="text-xs text-text-muted mt-1">Used for late check-in and early checkout alerts</p>
            </div>

            {/* Branch assignment */}
            {branches.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Assign to Branches
                </label>
                <div className="flex flex-wrap gap-2">
                  {branches.filter((b) => b.isActive).map((branch) => {
                    const selected = form.branchIds?.includes(branch.id);
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => toggleBranch(branch.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 bg-gray-50 text-text-secondary hover:border-gray-300'
                        }`}
                      >
                        {branch.name}
                      </button>
                    );
                  })}
                </div>
                {!form.branchIds?.length && (
                  <p className="text-xs text-amber-600 mt-1.5">No branch selected &mdash; staff won't appear in branch-filtered views</p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-4 flex items-center gap-2 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !hasRole || (branches.length > 0 && !form.branchIds?.length)}
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Creating...' : 'Create & Next'}
            </button>
          </div>
        </form>
        )}

        {/* ─── Step 2: Fingerprint Enrollment ─── */}
        {step === 'fingerprint' && createdStaff && (
          <div className="flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-3 pb-4 flex items-center gap-3 border-b border-gray-100 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Register Fingerprint</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Enroll fingerprint for <strong>{createdStaff.name}</strong>
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-5">
              {/* Created staff confirmation */}
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-800">Staff account created</p>
                  <p className="text-xs text-green-600">{createdStaff.name} &middot; {createdStaff.roleTitle || createdStaff.role} &middot; @{createdStaff.username}</p>
                </div>
              </div>

              {/* Bridge connection */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${bridgeConnected ? 'bg-green-500' : bridgeStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-gray-300'}`} />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Scanner Bridge</p>
                    <p className="text-xs text-text-muted">
                      {bridgeConnected ? 'Connected \u2014 Ready' : bridgeStatus === 'connecting' ? 'Connecting...' : 'Not connected'}
                    </p>
                  </div>
                </div>
                {!bridgeConnected && (
                  <button onClick={connectBridge}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors">
                    Connect
                  </button>
                )}
              </div>

              {/* Enrollment action */}
              {!enrolled ? (
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gray-100 flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {bridgeConnected
                      ? 'Click below and place the staff member\u2019s finger on the scanner'
                      : 'Connect the scanner bridge first, then enroll the fingerprint'}
                  </p>
                  <button
                    onClick={handleEnroll}
                    disabled={!bridgeConnected || enrolling}
                    className="px-6 py-3 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary-hover transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {enrolling ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Capturing...
                      </span>
                    ) : 'Enroll Fingerprint'}
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-700">Fingerprint Enrolled Successfully</p>
                    {enrollQuality != null && (
                      <p className="text-xs text-text-muted mt-1">Quality score: {enrollQuality}/100</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 flex items-center gap-2 border-t border-gray-100 shrink-0">
              {!enrolled ? (
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
                >
                  Skip for Now
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all active:scale-[0.97]"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
    </>
  );
}

/* ════════════════ Reset Password Modal ════════════════════ */

function ResetPasswordModal({
  staff,
  onClose,
  onDone,
}: {
  staff: StaffMember;
  onClose: () => void;
  onDone: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: () => staffService.resetPassword(staff.id, newPassword),
    onSuccess: () => {
      toast.success(`Password reset for ${staff.name}`);
      onDone();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to reset password'),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4">
          <h3 className="text-[15px] font-semibold text-text-primary">Reset Password</h3>
          <p className="text-xs text-text-muted mt-0.5">Set a new password for <strong>{staff.name}</strong></p>
        </div>
        <div className="px-6 pb-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              autoFocus
              className="w-full px-4 py-2.5 pr-11 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              onKeyDown={(e) => { if (e.key === 'Enter' && newPassword.length >= 8) mutation.mutate(); }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showPassword
                  ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                } />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-6 pb-6 flex items-center gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || newPassword.length < 8}
            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {mutation.isPending ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═════════════════ Edit Staff Modal ═══════════════════════ */

function EditStaffModal({
  staff,
  onClose,
  onUpdated,
}: {
  staff: StaffMember;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(staff.name);
  const [email, setEmail] = useState(staff.email || '');
  const [username, setUsername] = useState(staff.username);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'STAFF'>(staff.role as any);
  const [roleTitle, setRoleTitle] = useState(staff.roleTitle || '');
  const [defaultShiftId, setDefaultShiftId] = useState(staff.defaultShiftId || '');

  const { data: restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  const { data: shifts = [] } = useQuery<StaffShift[]>({
    queryKey: ['shifts'],
    queryFn: () => staffManagementService.getShifts(),
    staleTime: 30_000,
  });

  const customRoles = (() => {
    const s = (restaurant?.settings ?? {}) as Record<string, unknown>;
    const rp = s.rolePermissions as Record<string, unknown> | undefined;
    if (!rp) return [];
    return Object.keys(rp).filter((k) => !['ADMIN', 'MANAGER', 'STAFF', 'OWNER'].includes(k));
  })();

  const handleEditRoleSelect = (roleName: string) => {
    if (roleTitle === roleName) {
      setRole('' as any);
      setRoleTitle('');
    } else {
      setRole('STAFF');
      setRoleTitle(roleName);
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      staffService.update(staff.id, {
        name: name.trim(),
        email: email.trim() || null,
        username: username.trim(),
        ...(password ? { password } : {}),
        role,
        roleTitle: roleTitle.trim() || null,
        defaultShiftId: defaultShiftId || null,
      }),
    onSuccess: () => {
      toast.success('Staff member updated');
      onUpdated();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update staff'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');
    if (!username.trim()) return toast.error('Username is required');
    if (password && password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password && password !== confirmPassword) return toast.error('Passwords do not match');
    mutation.mutate();
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-center gap-3 border-b border-gray-100">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-text-primary">Edit Staff Member</h3>
              <p className="text-xs text-text-muted mt-0.5">Update details for <strong>{staff.name}</strong></p>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Email <span className="text-text-muted font-normal">(optional)</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="john_doe"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Password <span className="text-text-muted font-normal">(leave blank to keep current)</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full px-4 py-2.5 pr-11 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showPassword
                      ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    } />
                  </svg>
                </button>
              </div>
            </div>

            {password && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${
                    confirmPassword && confirmPassword !== password ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Role</label>
              <div className="flex flex-wrap gap-2">
                {customRoles.map((cr) => (
                  <button
                    key={cr}
                    type="button"
                    onClick={() => handleEditRoleSelect(cr)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      roleTitle === cr
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 bg-gray-50 text-text-secondary hover:border-gray-300'
                    }`}
                  >
                    {cr}
                  </button>
                ))}
              </div>
              {roleTitle && <p className="text-xs text-text-muted mt-2">Custom role — permissions managed in the Permissions tab</p>}
              {customRoles.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">No roles found. Create roles in Settings &rarr; Permissions first.</p>
              )}
            </div>

            {/* Default Shift */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Default Shift <span className="text-text-muted font-normal">(for attendance tracking)</span>
              </label>
              <select
                value={defaultShiftId}
                onChange={(e) => setDefaultShiftId(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="">No shift assigned</option>
                {shifts.filter(s => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.startTime} – {s.endTime})</option>
                ))}
              </select>
              <p className="text-xs text-text-muted mt-1">Used for late check-in and early checkout alerts</p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all active:scale-[0.97] disabled:opacity-60"
            >
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
    </>
  );
}

/* ═══════════════════ Branch Editor (inline) ═══════════════ */

function BranchEditor({
  member,
  activeBranches,
  onSave,
  onCancel,
  isPending,
}: {
  member: StaffMember;
  activeBranches: Array<{ id: string; name: string }>;
  onSave: (branchIds: string[]) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const currentIds = (member.branches || []).map((ub) => ub.branch.id);
  const [selected, setSelected] = useState<string[]>(currentIds);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const hasChanged = JSON.stringify([...selected].sort()) !== JSON.stringify([...currentIds].sort());

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-text-secondary mb-2">Assign to branches:</p>
      <div className="flex flex-wrap gap-2">
        {activeBranches.map((branch) => {
          const isSelected = selected.includes(branch.id);
          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => toggle(branch.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-200 bg-gray-50 text-text-secondary hover:border-gray-300'
              }`}
            >
              {branch.name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onSave(selected)}
          disabled={!hasChanged || isPending}
          className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-hover transition-all disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-100 text-text-secondary text-xs font-medium rounded-lg hover:bg-gray-200 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ Main Component ═══════════════════════ */

export default function StaffManagementTab() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [branchEditId, setBranchEditId] = useState<string | null>(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: staffService.list,
    staleTime: 0,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: branchService.getAll,
    staleTime: 30_000,
  });

  const activeBranches = branches.filter((b) => b.isActive);

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      staffService.update(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setDeleteConfirm(null);
      toast.success('Staff member removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateBranchesMutation = useMutation({
    mutationFn: ({ id, branchIds }: { id: string; branchIds: string[] }) =>
      staffService.updateBranches(id, branchIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setBranchEditId(null);
      toast.success('Branch assignments updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const onRefresh = () => queryClient.invalidateQueries({ queryKey: ['staff'] });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-48 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const owner = staff.find((s) => s.role === 'OWNER');
  const others = staff.filter((s) => s.role !== 'OWNER');

  return (
    <motion.div
      key="staff"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className="space-y-5"
    >
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">Team Members</h2>
          <p className="text-xs text-text-muted mt-0.5">{staff.length} member{staff.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-sm hover:bg-primary-hover transition-all active:scale-[0.97]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Staff
        </button>
      </div>

      {/* Owner card (non-editable) */}
      {owner && (
        <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-purple-700">{owner.username.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text-primary truncate">{owner.username}</p>
                <RoleBadge role="OWNER" />
              </div>
              <p className="text-xs text-text-muted truncate">{owner.email || ''}</p>
            </div>
            <p className="text-xs text-text-muted hidden sm:block">You</p>
          </div>
        </div>
      )}

      {/* Staff list */}
      {others.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text-primary">No staff members yet</p>
          <p className="text-xs text-text-muted mt-1">Add managers and cashiers to help run your restaurant</p>
        </div>
      ) : (
        <div className="space-y-3">
          {others.map((member) => (
            <div
              key={member.id}
              className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
                member.isActive ? 'border-gray-100' : 'border-red-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  member.isActive ? 'bg-primary/10' : 'bg-gray-200'
                }`}>
                  <span className={`text-sm font-bold ${member.isActive ? 'text-primary' : 'text-gray-500'}`}>
                    {member.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-text-primary truncate">{member.name}</p>
                    <RoleBadge role={member.role} roleTitle={member.roleTitle} />
                    {!member.isActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-red-100 text-red-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  {member.email && (
                    <p className="text-xs text-text-muted truncate mt-0.5">{member.email}</p>
                  )}
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    @{member.username}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Last login: {timeAgo(member.lastLoginAt)}
                  </p>
                  {/* Branch badges */}
                  {member.branches && member.branches.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {member.branches.map((ub) => (
                        <span key={ub.branch.id} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
                          {ub.branch.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-amber-600 mt-1">No branch assigned</p>
                  )}
                  {/* Shift badge */}
                  {member.defaultShift && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 mt-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {member.defaultShift.name} ({member.defaultShift.startTime}–{member.defaultShift.endTime})
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">

                  {/* Branches */}
                  {activeBranches.length > 0 && (
                    <button
                      onClick={() => setBranchEditId(branchEditId === member.id ? null : member.id)}
                      className={`p-2 rounded-lg transition-all ${
                        branchEditId === member.id
                          ? 'text-white bg-blue-500'
                          : 'text-blue-500 bg-blue-50 hover:bg-blue-100'
                      }`}
                      title="Manage branches"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </button>
                  )}

                  {/* Edit */}
                  <button
                    onClick={() => setEditTarget(member)}
                    className="p-2 rounded-lg text-blue-500 bg-blue-50 hover:bg-blue-100 transition-all"
                    title="Edit details"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  {/* Toggle active */}
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: member.id, isActive: !member.isActive })}
                    className={`p-2 rounded-lg transition-all ${
                      member.isActive
                        ? 'text-primary bg-orange-50 hover:bg-orange-100'
                        : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                    }`}
                    title={member.isActive ? 'Deactivate' : 'Activate'}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                        member.isActive
                          ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
                          : 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
                      } />
                    </svg>
                  </button>

                  {/* Reset password */}
                  <button
                    onClick={() => setResetTarget(member)}
                    className="p-2 rounded-lg text-text-muted bg-gray-50 hover:bg-gray-100 transition-all"
                    title="Reset password"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </button>

                  {/* Delete */}
                  {deleteConfirm === member.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => deleteMutation.mutate(member.id)}
                        disabled={deleteMutation.isPending}
                        className="p-2 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-all"
                        title="Confirm delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="p-2 rounded-lg text-text-muted bg-gray-100 hover:bg-gray-200 transition-all"
                        title="Cancel"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(member.id)}
                      className="p-2 rounded-lg text-red-400 bg-red-50 hover:bg-red-100 transition-all"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Inline branch editor */}
              {branchEditId === member.id && activeBranches.length > 0 && (
                <BranchEditor
                  member={member}
                  activeBranches={activeBranches}
                  onSave={(branchIds) => updateBranchesMutation.mutate({ id: member.id, branchIds })}
                  onCancel={() => setBranchEditId(null)}
                  isPending={updateBranchesMutation.isPending}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateStaffModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreated={onRefresh}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTarget && (
          <EditStaffModal
            staff={editTarget}
            onClose={() => setEditTarget(null)}
            onUpdated={onRefresh}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {resetTarget && (
          <ResetPasswordModal
            staff={resetTarget}
            onClose={() => setResetTarget(null)}
            onDone={onRefresh}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
