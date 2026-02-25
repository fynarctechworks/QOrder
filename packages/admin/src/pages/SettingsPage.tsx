import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { settingsService } from '../services/settingsService';
import { profileService } from '../services/profileService';
import type { UserProfile } from '../services/profileService';
import { useAuthStore } from '../state/authStore';
import Toggle from '../components/Toggle';

/* ═══════════════════════════ Types ════════════════════════════ */

interface FormState {
  name: string;
  currency: string;
  taxRate: string;
  minOrderAmount: string;
  prepTime: string;
  acceptsOrders: boolean;
}

const DEFAULTS: FormState = {
  name: '',
  currency: 'INR',
  taxRate: '10',
  minOrderAmount: '0',
  prepTime: '15',
  acceptsOrders: true,
};

const CURRENCIES = [
  { value: 'USD', label: 'US Dollar' },
  { value: 'EUR', label: 'Euro' },
  { value: 'GBP', label: 'British Pound' },
  { value: 'INR', label: 'Indian Rupee' },
];

/**
 * Get currency symbol dynamically using Intl API
 * This ensures symbols are never hardcoded and come from browser's locale data
 */
function getCurrencySymbol(currencyCode: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    
    const symbolPart = parts.find(part => part.type === 'currency');
    return symbolPart?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}

type SectionTab = 'profile' | 'restaurant' | 'orders';

const TABS: { key: SectionTab; label: string; icon: string }[] = [
  {
    key: 'profile',
    label: 'Profile',
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  },
  {
    key: 'restaurant',
    label: 'Restaurant',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    key: 'orders',
    label: 'Orders',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
];

/* ═══════════════════════════ Sub-components ══════════════════ */

/** Field wrapper */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      {hint && <p className="text-xs text-text-muted mb-2">{hint}</p>}
      {children}
    </div>
  );
}

/** Section card */
function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
          </svg>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 pb-6 space-y-5">
        {children}
      </div>
    </motion.div>
  );
}

/** Skeleton */
function SettingsSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header skeleton */}
      <div className="animate-pulse">
        <div className="h-7 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-56 bg-gray-100 rounded" />
      </div>
      {/* Tabs skeleton */}
      <div className="flex gap-2 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-28 bg-gray-200 rounded-xl" />
        ))}
      </div>
      {/* Cards skeleton */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200" />
            <div className="space-y-2">
              <div className="h-4 w-36 bg-gray-200 rounded" />
              <div className="h-3 w-48 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j}>
                <div className="h-3 w-24 bg-gray-100 rounded mb-2" />
                <div className="h-10 w-full bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════ Page ════════════════════════════ */

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SectionTab>('profile');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ── Profile state ──
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState('');

  // ── OTP verification state ──
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpPending, setOtpPending] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [pendingAction, setPendingAction] = useState<'username' | 'email' | 'password' | null>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const { data: profile, isLoading: profileLoading, isError: profileError } = useQuery({
    queryKey: ['profile'],
    queryFn: profileService.getProfile,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: restaurant, isLoading, isError: settingsError } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const [form, setForm] = useState<FormState>(DEFAULTS);

  // Sync form when data loads
  useEffect(() => {
    if (!restaurant) return;
    const s = (restaurant.settings ?? {}) as Record<string, unknown>;
    setForm({
      name: restaurant.name ?? '',
      currency: restaurant.currency ?? 'USD',
      taxRate: String(restaurant.taxRate ?? 10),
      minOrderAmount: String(s.minimumOrderAmount ?? 0),
      prepTime: String(s.estimatedPrepTime ?? 15),
      acceptsOrders: (s.acceptsOrders as boolean) ?? true,
    });
  }, [restaurant]);

  // Derive an "initial" snapshot for dirty detection
  const initial = useMemo<FormState>(() => {
    if (!restaurant) return DEFAULTS;
    const s = (restaurant.settings ?? {}) as Record<string, unknown>;
    return {
      name: restaurant.name ?? '',
      currency: restaurant.currency ?? 'USD',
      taxRate: String(restaurant.taxRate ?? 10),
      minOrderAmount: String(s.minimumOrderAmount ?? 0),
      prepTime: String(s.estimatedPrepTime ?? 15),
      acceptsOrders: (s.acceptsOrders as boolean) ?? true,
    };
  }, [restaurant]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial]
  );

  // Password kept in a ref so the mutation closure always sees the latest value
  const passwordRef = useRef('');

  const mutation = useMutation({
    mutationFn: () => {
      const settings: Record<string, unknown> = {
        acceptsOrders: form.acceptsOrders,
        minimumOrderAmount: parseFloat(form.minOrderAmount) || 0,
        estimatedPrepTime: parseInt(form.prepTime, 10) || 15,
      };

      // Include password when turning off accept orders
      if (form.acceptsOrders === false && passwordRef.current) {
        settings.password = passwordRef.current;
      }

      return settingsService.update({
        name: form.name,
        currency: form.currency,
        taxRate: parseFloat(form.taxRate) || 0,
        settings: settings as any,
      });
    },
    onSuccess: (data) => {
      // Immediately update the cached data
      queryClient.setQueryData(['settings'], data);
      // Also invalidate to trigger refetch in other components using this data
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
      toast.success('Settings saved successfully');
      // Reset password state
      passwordRef.current = '';
      setConfirmPassword('');
      setPasswordError('');
      setShowPasswordModal(false);
    },
    onError: (err: Error) => {
      const msg = err.message || 'Failed to save settings';
      // If password-related error, show in modal
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('incorrect')) {
        setPasswordError(msg);
      } else {
        toast.error(msg);
      }
    },
  });

  /** Handle save — if accept orders is being turned OFF, show password prompt */
  const handleSave = () => {
    // Check if acceptsOrders is being turned off (was on initially, now off)
    if (form.acceptsOrders === false && initial.acceptsOrders === true) {
      setShowPasswordModal(true);
      setPasswordError('');
      setConfirmPassword('');
    } else {
      passwordRef.current = '';
      mutation.mutate();
    }
  };

  /** Confirm password and proceed with save */
  const handlePasswordConfirm = () => {
    if (!confirmPassword.trim()) {
      setPasswordError('Please enter your password');
      return;
    }
    setPasswordError('');
    passwordRef.current = confirmPassword;
    mutation.mutate();
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Profile mutations ──
  const usernameMutation = useMutation({
    mutationFn: (args: { username: string; otp: string }) => profileService.updateUsername(args.username, args.otp),
    onSuccess: (data: UserProfile) => {
      queryClient.setQueryData(['profile'], data);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      useAuthStore.getState().updateUser({ username: data.username });
      toast.success('Username updated');
      setEditingUsername(false);
      closeOtpModal();
    },
    onError: (err: Error) => {
      setOtpError(err.message || 'Failed to update username');
    },
  });

  const emailMutation = useMutation({
    mutationFn: (args: { email: string; otp: string }) => profileService.updateEmail(args.email, args.otp),
    onSuccess: (data: UserProfile) => {
      queryClient.setQueryData(['profile'], data);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      useAuthStore.getState().updateUser({ email: data.email });
      toast.success('Email updated');
      setEditingEmail(false);
      closeOtpModal();
    },
    onError: (err: Error) => {
      setOtpError(err.message || 'Failed to update email');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (otp: string) => profileService.changePassword(currentPwd, newPwd, otp),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setShowChangePassword(false);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      closeOtpModal();
    },
    onError: (err: Error) => {
      setOtpError(err.message || 'Failed to change password');
    },
  });

  // ── OTP flow helpers ──
  const closeOtpModal = () => {
    setOtpModalOpen(false);
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError('');
    setOtpPending(false);
    setPendingAction(null);
  };

  const startOtpFlow = async (action: 'username' | 'email' | 'password') => {
    setPendingAction(action);
    setOtpSending(true);
    setOtpError('');
    try {
      await profileService.sendOTP();
      setOtpModalOpen(true);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpResendCooldown(60);
      toast.success('Verification code sent to your email');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send verification code');
      setPendingAction(null);
    } finally {
      setOtpSending(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResendCooldown > 0) return;
    setOtpSending(true);
    try {
      await profileService.sendOTP();
      setOtpResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError('');
      toast.success('New code sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setOtpSending(false);
    }
  };

  // Resend cooldown timer
  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const timer = setTimeout(() => setOtpResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpResendCooldown]);

  const handleOtpDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    setOtpError('');

    // Auto-advance
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newDigits.every((d) => d !== '') && newDigits.join('').length === 6) {
      submitOtp(newDigits.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const digits = pasted.split('');
      setOtpDigits(digits);
      otpInputRefs.current[5]?.focus();
      submitOtp(pasted);
    }
  };

  const submitOtp = (otp: string) => {
    if (otp.length !== 6) return;
    setOtpPending(true);
    setOtpError('');

    if (pendingAction === 'username') {
      usernameMutation.mutate({ username: usernameValue.trim(), otp });
    } else if (pendingAction === 'email') {
      emailMutation.mutate({ email: emailValue.trim().toLowerCase(), otp });
    } else if (pendingAction === 'password') {
      changePasswordMutation.mutate(otp);
    }
  };

  // Reset pending state when mutations finish
  useEffect(() => {
    if (!usernameMutation.isPending && !emailMutation.isPending && !changePasswordMutation.isPending) {
      setOtpPending(false);
    }
  }, [usernameMutation.isPending, emailMutation.isPending, changePasswordMutation.isPending]);

  const handleChangePassword = () => {
    if (!currentPwd) { toast.error('Enter current password'); return; }
    if (newPwd.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPwd !== confirmPwd) { toast.error('Passwords do not match'); return; }
    startOtpFlow('password');
  };

  if (isLoading && profileLoading) return <SettingsSkeleton />;

  if (profileError || settingsError) return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Settings</h1>
      </div>
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700 font-semibold">Failed to load settings</p>
        <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing the page.</p>
      </div>
    </div>
  );

  /* ═════════════════════════ RENDER ═════════════════════════ */

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Configure your restaurant preferences
        </p>
      </div>

      {/* ── Tab Navigation ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            {/* Username */}
            <SectionCard
              icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              title="Username"
              subtitle="Your unique username for signing in"
            >
              {editingUsername ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={usernameValue}
                    onChange={(e) => setUsernameValue(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Enter new username"
                    autoFocus
                  />
                  <button
                    onClick={() => { if (usernameValue.trim().length >= 3) startOtpFlow('username'); }}
                    disabled={otpSending || usernameValue.trim().length < 3}
                    className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-50"
                  >
                    {otpSending && pendingAction === 'username' ? 'Sending code…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingUsername(false)}
                    className="px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{profile?.username || '—'}</p>
                    <p className="text-xs text-text-muted mt-0.5">Current username</p>
                  </div>
                  <button
                    onClick={() => { setUsernameValue(profile?.username || ''); setEditingUsername(true); }}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-gray-50 hover:border-gray-300 transition-all"
                  >
                    Edit
                  </button>
                </div>
              )}
            </SectionCard>

            {/* Email */}
            <SectionCard
              icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              title="Email"
              subtitle="Your email address for notifications and login"
            >
              {editingEmail ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Enter new email"
                    autoFocus
                  />
                  <button
                    onClick={() => { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim())) startOtpFlow('email'); }}
                    disabled={otpSending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim())}
                    className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-50"
                  >
                    {otpSending && pendingAction === 'email' ? 'Sending code…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingEmail(false)}
                    className="px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{profile?.email || '—'}</p>
                    <p className="text-xs text-text-muted mt-0.5">Current email</p>
                  </div>
                  <button
                    onClick={() => { setEmailValue(profile?.email || ''); setEditingEmail(true); }}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-gray-50 hover:border-gray-300 transition-all"
                  >
                    Edit
                  </button>
                </div>
              )}
            </SectionCard>

            {/* Change Password */}
            <SectionCard
              icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              title="Password"
              subtitle="Change your account password"
            >
              {showChangePassword ? (
                <div className="space-y-4">
                  <Field label="Current Password">
                    <input
                      type="password"
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      placeholder="Enter current password"
                    />
                  </Field>
                  <Field label="New Password">
                    <input
                      type="password"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      placeholder="At least 6 characters"
                    />
                  </Field>
                  <Field label="Confirm New Password">
                    <input
                      type="password"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      placeholder="Re-enter new password"
                    />
                  </Field>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleChangePassword}
                      disabled={changePasswordMutation.isPending}
                      className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                      {changePasswordMutation.isPending ? 'Changing…' : 'Change Password'}
                    </button>
                    <button
                      onClick={() => { setShowChangePassword(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}
                      className="px-5 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">••••••••</p>
                    <p className="text-xs text-text-muted mt-0.5">Last changed: Unknown</p>
                  </div>
                  <button
                    onClick={() => setShowChangePassword(true)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-gray-50 hover:border-gray-300 transition-all"
                  >
                    Change
                  </button>
                </div>
              )}
            </SectionCard>
          </motion.div>
        )}

        {activeTab === 'restaurant' && (
          <motion.div
            key="restaurant"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            {/* Restaurant Info */}
            <SectionCard
              icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              title="Restaurant Information"
              subtitle="Basic details about your restaurant"
            >
              <Field label="Restaurant Name" hint="This will be displayed to your customers">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="e.g. The Italian Kitchen"
                />
              </Field>

              <Field label="Currency" hint="Used for pricing and invoices">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => update('currency', c.value)}
                      className={`relative flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 transition-all duration-200 ${
                        form.currency === c.value
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-xl font-bold ${form.currency === c.value ? 'text-primary' : 'text-text-secondary'}`}>
                        {getCurrencySymbol(c.value)}
                      </span>
                      <span className={`text-[11px] font-medium ${form.currency === c.value ? 'text-primary' : 'text-text-muted'}`}>
                        {c.value}
                      </span>
                      {form.currency === c.value && (
                        <motion.div
                          layoutId="currencyCheck"
                          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center"
                        >
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </motion.div>
                      )}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Tax Rate" hint="Applied to all orders">
                <div className="relative">
                  <input
                    type="number"
                    value={form.taxRate}
                    onChange={(e) => update('taxRate', e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">%</span>
                </div>
              </Field>
            </SectionCard>
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div
            key="orders"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            {/* Order preferences */}
            <SectionCard
              icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              title="Order Preferences"
              subtitle="Control how orders work in your restaurant"
            >
              {/* Accept orders toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    form.acceptsOrders ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    <svg className={`w-5 h-5 ${form.acceptsOrders ? 'text-emerald-600' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={form.acceptsOrders ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'} />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Accept Orders</p>
                    <p className="text-xs text-text-muted">
                      {form.acceptsOrders ? 'Customers can place orders now' : 'Order intake is paused'}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.acceptsOrders}
                  onChange={() => update('acceptsOrders', !form.acceptsOrders)}
                  size="md"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Minimum Order Amount" hint={`In ${form.currency}`}>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">
                      {getCurrencySymbol(form.currency)}
                    </span>
                    <input
                      type="number"
                      value={form.minOrderAmount}
                      onChange={(e) => update('minOrderAmount', e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </Field>

                <Field label="Default Prep Time" hint="Estimated preparation time">
                  <div className="relative">
                    <input
                      type="number"
                      value={form.prepTime}
                      onChange={(e) => update('prepTime', e.target.value)}
                      className="w-full px-4 py-2.5 pr-14 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      min="1"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">min</span>
                  </div>
                </Field>
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky Save Bar (bottom) ────────────────────────── */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="sticky bottom-4 z-20"
          >
            <div className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-lg px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <p className="text-sm text-text-secondary truncate">You have unsaved changes</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setForm(initial)}
                  className="px-4 py-2 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={mutation.isPending}
                  className="btn-primary rounded-xl text-sm px-5 py-2 shadow-sm active:scale-[0.97] disabled:opacity-60"
                >
                  {mutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Password Confirmation Modal ─────────────────────── */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={() => { setShowPasswordModal(false); setPasswordError(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-text-primary">Confirm Password</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Enter your account password to disable order acceptance
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 pb-4 space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="text-xs text-amber-700">
                    Customers will not be able to place orders while this is turned off.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordConfirm(); }}
                    placeholder="Enter your password"
                    autoFocus
                    className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 transition-all ${
                      passwordError
                        ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                        : 'border-gray-200 focus:border-primary focus:ring-primary'
                    }`}
                  />
                  {passwordError && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                      </svg>
                      {passwordError}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex items-center gap-2">
                <button
                  onClick={() => { setShowPasswordModal(false); setPasswordError(''); setConfirmPassword(''); }}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordConfirm}
                  disabled={mutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-all active:scale-[0.97] disabled:opacity-60"
                >
                  {mutation.isPending ? 'Verifying…' : 'Confirm & Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── OTP Verification Modal ─────────────────────────── */}
      <AnimatePresence>
        {otpModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={closeOtpModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5"
            >
              {/* Header */}
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-text-primary">Email Verification</h3>
                <p className="text-sm text-text-muted mt-1">
                  Enter the 6-digit code sent to <span className="font-medium text-text-primary">{profile?.email}</span>
                </p>
              </div>

              {/* OTP Inputs */}
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpInputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={otpPending}
                    className={`w-11 h-13 text-center text-lg font-bold rounded-xl border-2 bg-gray-50 transition-all focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 ${
                      otpError ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {/* Error */}
              {otpError && (
                <p className="text-sm text-red-500 text-center">{otpError}</p>
              )}

              {/* Pending indicator */}
              {otpPending && (
                <p className="text-sm text-text-muted text-center animate-pulse">Verifying…</p>
              )}

              {/* Resend */}
              <div className="text-center">
                {otpResendCooldown > 0 ? (
                  <p className="text-xs text-text-muted">
                    Resend code in <span className="font-medium text-text-primary">{otpResendCooldown}s</span>
                  </p>
                ) : (
                  <button
                    onClick={handleResendOtp}
                    disabled={otpSending}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {otpSending ? 'Sending…' : 'Resend code'}
                  </button>
                )}
              </div>

              {/* Cancel */}
              <button
                onClick={closeOtpModal}
                className="w-full py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
