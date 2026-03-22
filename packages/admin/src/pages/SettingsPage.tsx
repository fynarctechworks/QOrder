import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { settingsService } from '../services/settingsService';
import { apiClient } from '../services/apiClient';
import { profileService } from '../services/profileService';
import type { UserProfile } from '../services/profileService';
import { useAuthStore } from '../state/authStore';
import { useBranchStore } from '../state/branchStore';
import Toggle from '../components/Toggle';
import StaffManagementTab from '../components/StaffManagementTab';
import PermissionsTab from '../components/PermissionsTab';
import SectionsTab from '../components/SectionsTab';

/* ═══════════════════════════ Types ════════════════════════════ */

interface FormState {
  name: string;
  currency: string;
  taxRate: string;
  kitchenParcelCharge: string;
  beverageParcelCharge: string;
  minOrderAmount: string;
  prepTime: string;
  acceptsOrders: boolean;
  // Printer
  printerEnabled: boolean;
  printerConnectionType: 'network' | 'bluetooth' | 'browser';
  printerIp: string;
  printerPort: string;
  printerType: 'epson' | 'star';
  printerWidth: string;
  autoPrintOnComplete: boolean;
  // Auto-lock
  autoLockEnabled: boolean;
  autoLockTimeout: string;
  lockPin: string;
  // Customer verification
  requirePhoneVerification: boolean;
  // Geo-fence
  geoLatitude: string;
  geoLongitude: string;
  geoFenceRadius: string;
  geoFenceEnabled: boolean;
  // WhatsApp billing (Meta Business API)
  whatsappBillEnabled: boolean;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  whatsappAccessToken: string;
  // Twilio
  twilioEnabled: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  // WhatsApp Alerts
  adminWhatsAppPhone: string;
  whatsappAlertLowStock: boolean;
  whatsappAlertStaffLate: boolean;
  whatsappAlertEarlyCheckout: boolean;
  whatsappAlertAutoInvoice: boolean;
  staffLateThresholdMinutes: string;
  earlyCheckoutThresholdMinutes: string;
  // QR layout logo
  qrLogoUrl: string;
  // Print layout
  printLogoUrl: string;
  printHeaderText: string;
  printFooterText: string;
  printShowLogo: boolean;
  printShowAddress: boolean;
  printShowCustomerInfo: boolean;
  printShowItemModifiers: boolean;
  printShowSpecialInstructions: boolean;
  printShowSubtotal: boolean;
  printShowTax: boolean;
  menuShowItemImages: boolean;
  smartInventoryEnabled: boolean;
  // Daily report
  reportEmails: string;
}

const DEFAULTS: FormState = {
  name: '',
  currency: 'INR',
  taxRate: '10',
  kitchenParcelCharge: '10',
  beverageParcelCharge: '15',
  minOrderAmount: '0',
  prepTime: '15',
  acceptsOrders: true,
  printerEnabled: false,
  printerConnectionType: 'network',
  printerIp: '',
  printerPort: '9100',
  printerType: 'epson',
  printerWidth: '48',
  autoPrintOnComplete: true,
  autoLockEnabled: false,
  autoLockTimeout: '2',
  lockPin: '',
  requirePhoneVerification: false,
  geoLatitude: '',
  geoLongitude: '',
  geoFenceRadius: '50',
  geoFenceEnabled: false,
  whatsappBillEnabled: false,
  whatsappPhoneNumberId: '',
  whatsappBusinessAccountId: '',
  whatsappAccessToken: '',
  twilioEnabled: false,
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioPhoneNumber: '',
  adminWhatsAppPhone: '',
  whatsappAlertLowStock: false,
  whatsappAlertStaffLate: false,
  whatsappAlertEarlyCheckout: false,
  whatsappAlertAutoInvoice: false,
  staffLateThresholdMinutes: '15',
  earlyCheckoutThresholdMinutes: '30',
  qrLogoUrl: '',
  printLogoUrl: '',
  printHeaderText: '',
  printFooterText: 'Thank you!',
  printShowLogo: true,
  printShowAddress: true,
  printShowCustomerInfo: true,
  printShowItemModifiers: true,
  printShowSpecialInstructions: true,
  printShowSubtotal: true,
  printShowTax: true,
  menuShowItemImages: true,
  smartInventoryEnabled: false,
  reportEmails: '',
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

type SectionTab = 'profile' | 'restaurant' | 'orders' | 'printer' | 'security' | 'staff' | 'permissions' | 'sections';

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
  {
    key: 'printer',
    label: 'Printer',
    icon: 'M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z',
  },
  {
    key: 'security',
    label: 'Security',
    icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  },
  {
    key: 'staff',
    label: 'Staff',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    key: 'permissions',
    label: 'Permissions',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  {
    key: 'sections',
    label: 'Sections',
    icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
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
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex items-center gap-3">
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
      <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-5">
        {children}
      </div>
    </motion.div>
  );
}

/** Printer Test Button */
function PrinterTestButton({
  printerIp,
  printerPort,
  printerType,
  printerWidth,
}: {
  printerIp: string;
  printerPort: number;
  printerType: string;
  printerWidth: number;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTest = async () => {
    if (!printerIp) {
      setResult({ success: false, message: 'Please enter a printer IP address first.' });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await settingsService.testPrinter({ printerIp, printerPort, printerType, printerWidth });
      setResult(res);
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Test print failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleTest}
        disabled={testing}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 active:scale-[0.97]"
      >
        {testing ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Testing...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Test Print
          </>
        )}
      </button>

      {result && (
        <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
          result.success
            ? 'bg-orange-50 text-primary border border-orange-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
              result.success
                ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
                : 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
            } />
          </svg>
          <span>{result.message}</span>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Sends a small test receipt to your printer. Make sure the printer is powered on and connected to the same network.
      </p>
    </div>
  );
}

/** Skeleton */
function SettingsSkeleton() {
  return (
    <div className="space-y-6 w-full max-w-5xl">
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
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const [activeTab, setActiveTab] = useState<SectionTab>('profile');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ── Lock PIN confirmation ──
  const [confirmLockPin, setConfirmLockPin] = useState('');
  const pinBoxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinBoxRefs = useRef<(HTMLInputElement | null)[]>([]);

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
    queryKey: ['settings', activeBranchId],
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
      kitchenParcelCharge: String(s.kitchenParcelCharge ?? 10),
      beverageParcelCharge: String(s.beverageParcelCharge ?? 15),
      minOrderAmount: String(s.minimumOrderAmount ?? 0),
      prepTime: String(s.estimatedPrepTime ?? 15),
      acceptsOrders: (s.acceptsOrders as boolean) ?? true,
      printerEnabled: (s.printerEnabled as boolean) ?? false,
      printerConnectionType: (s.printerConnectionType as 'network' | 'bluetooth' | 'browser') ?? 'network',
      printerIp: (s.printerIp as string) ?? '',
      printerPort: String(s.printerPort ?? 9100),
      printerType: (s.printerType as 'epson' | 'star') ?? 'epson',
      printerWidth: String(s.printerWidth ?? 48),
      autoPrintOnComplete: (s.autoPrintOnComplete as boolean) ?? true,
      autoLockEnabled: (s.autoLockEnabled as boolean) ?? false,
      autoLockTimeout: String(s.autoLockTimeout ?? 2),
      lockPin: (s.lockPin as string) ?? '',
      requirePhoneVerification: (s.requirePhoneVerification as boolean) ?? false,
      geoLatitude: restaurant.latitude != null ? String(restaurant.latitude) : '',
      geoLongitude: restaurant.longitude != null ? String(restaurant.longitude) : '',
      geoFenceRadius: String(restaurant.geoFenceRadius ?? 50),
      geoFenceEnabled: restaurant.latitude != null && restaurant.longitude != null,
      whatsappBillEnabled: (s.whatsappBillEnabled as boolean) ?? false,
      whatsappPhoneNumberId: (s.whatsappPhoneNumberId as string) ?? '',
      whatsappBusinessAccountId: (s.whatsappBusinessAccountId as string) ?? '',
      whatsappAccessToken: '',
      twilioEnabled: (s.twilioEnabled as boolean) ?? false,
      twilioAccountSid: (s.twilioAccountSid as string) ?? '',
      twilioAuthToken: '',
      twilioPhoneNumber: (s.twilioPhoneNumber as string) ?? '',
      adminWhatsAppPhone: (s.adminWhatsAppPhone as string) ?? '',
      whatsappAlertLowStock: (s.whatsappAlertLowStock as boolean) ?? false,
      whatsappAlertStaffLate: (s.whatsappAlertStaffLate as boolean) ?? false,
      whatsappAlertEarlyCheckout: (s.whatsappAlertEarlyCheckout as boolean) ?? false,
      whatsappAlertAutoInvoice: (s.whatsappAlertAutoInvoice as boolean) ?? false,
      staffLateThresholdMinutes: String(s.staffLateThresholdMinutes ?? 15),
      earlyCheckoutThresholdMinutes: String(s.earlyCheckoutThresholdMinutes ?? 30),
      qrLogoUrl: (s.qrLogoUrl as string) ?? '',
      printLogoUrl: (s.printLogoUrl as string) ?? '',
      printHeaderText: (s.printHeaderText as string) ?? '',
      printFooterText: (s.printFooterText as string) ?? 'Thank you!',
      printShowLogo: (s.printShowLogo as boolean) ?? true,
      printShowAddress: (s.printShowAddress as boolean) ?? true,
      printShowCustomerInfo: (s.printShowCustomerInfo as boolean) ?? true,
      printShowItemModifiers: (s.printShowItemModifiers as boolean) ?? true,
      printShowSpecialInstructions: (s.printShowSpecialInstructions as boolean) ?? true,
      printShowSubtotal: (s.printShowSubtotal as boolean) ?? true,
      printShowTax: (s.printShowTax as boolean) ?? true,
      menuShowItemImages: (s.menuShowItemImages as boolean) ?? true,
      smartInventoryEnabled: (s.smartInventoryEnabled as boolean) ?? false,
      reportEmails: ((s.reportEmails as string[] | undefined) ?? []).join(', '),
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
      kitchenParcelCharge: String(s.kitchenParcelCharge ?? 10),
      beverageParcelCharge: String(s.beverageParcelCharge ?? 15),
      minOrderAmount: String(s.minimumOrderAmount ?? 0),
      prepTime: String(s.estimatedPrepTime ?? 15),
      acceptsOrders: (s.acceptsOrders as boolean) ?? true,
      printerEnabled: (s.printerEnabled as boolean) ?? false,
      printerConnectionType: (s.printerConnectionType as 'network' | 'bluetooth' | 'browser') ?? 'network',
      printerIp: (s.printerIp as string) ?? '',
      printerPort: String(s.printerPort ?? 9100),
      printerType: (s.printerType as 'epson' | 'star') ?? 'epson',
      printerWidth: String(s.printerWidth ?? 48),
      autoPrintOnComplete: (s.autoPrintOnComplete as boolean) ?? true,
      autoLockEnabled: (s.autoLockEnabled as boolean) ?? false,
      autoLockTimeout: String(s.autoLockTimeout ?? 2),
      lockPin: (s.lockPin as string) ?? '',
      requirePhoneVerification: (s.requirePhoneVerification as boolean) ?? false,
      geoLatitude: restaurant.latitude != null ? String(restaurant.latitude) : '',
      geoLongitude: restaurant.longitude != null ? String(restaurant.longitude) : '',
      geoFenceRadius: String(restaurant.geoFenceRadius ?? 50),
      geoFenceEnabled: restaurant.latitude != null && restaurant.longitude != null,
      whatsappBillEnabled: (s.whatsappBillEnabled as boolean) ?? false,
      whatsappPhoneNumberId: (s.whatsappPhoneNumberId as string) ?? '',
      whatsappBusinessAccountId: (s.whatsappBusinessAccountId as string) ?? '',
      whatsappAccessToken: '',
      twilioEnabled: (s.twilioEnabled as boolean) ?? false,
      twilioAccountSid: (s.twilioAccountSid as string) ?? '',
      twilioAuthToken: '',
      twilioPhoneNumber: (s.twilioPhoneNumber as string) ?? '',
      adminWhatsAppPhone: (s.adminWhatsAppPhone as string) ?? '',
      whatsappAlertLowStock: (s.whatsappAlertLowStock as boolean) ?? false,
      whatsappAlertStaffLate: (s.whatsappAlertStaffLate as boolean) ?? false,
      whatsappAlertEarlyCheckout: (s.whatsappAlertEarlyCheckout as boolean) ?? false,
      whatsappAlertAutoInvoice: (s.whatsappAlertAutoInvoice as boolean) ?? false,
      staffLateThresholdMinutes: String(s.staffLateThresholdMinutes ?? 15),
      earlyCheckoutThresholdMinutes: String(s.earlyCheckoutThresholdMinutes ?? 30),
      qrLogoUrl: (s.qrLogoUrl as string) ?? '',
      printLogoUrl: (s.printLogoUrl as string) ?? '',
      printHeaderText: (s.printHeaderText as string) ?? '',
      printFooterText: (s.printFooterText as string) ?? 'Thank you!',
      printShowLogo: (s.printShowLogo as boolean) ?? true,
      printShowAddress: (s.printShowAddress as boolean) ?? true,
      printShowCustomerInfo: (s.printShowCustomerInfo as boolean) ?? true,
      printShowItemModifiers: (s.printShowItemModifiers as boolean) ?? true,
      printShowSpecialInstructions: (s.printShowSpecialInstructions as boolean) ?? true,
      printShowSubtotal: (s.printShowSubtotal as boolean) ?? true,
      printShowTax: (s.printShowTax as boolean) ?? true,
      menuShowItemImages: (s.menuShowItemImages as boolean) ?? true,
      smartInventoryEnabled: (s.smartInventoryEnabled as boolean) ?? false,
      reportEmails: ((s.reportEmails as string[] | undefined) ?? []).join(', '),
    };
  }, [restaurant]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial]
  );

  // Password kept in a ref so the mutation closure always sees the latest value
  const passwordRef = useRef('');

  // QR logo upload
  const qrLogoInputRef = useRef<HTMLInputElement>(null);
  const [qrLogoUploading, setQrLogoUploading] = useState(false);
  const handleQrLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await apiClient.upload<{ imageUrl: string }>('/upload/image', formData);
      update('qrLogoUrl', res.imageUrl);
      toast.success('QR logo uploaded');
    } catch {
      toast.error('Failed to upload QR logo');
    } finally {
      setQrLogoUploading(false);
      if (qrLogoInputRef.current) qrLogoInputRef.current.value = '';
    }
  };

  // Logo upload
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await apiClient.upload<{ imageUrl: string }>('/upload/image', formData);
      update('printLogoUrl', res.imageUrl);
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const settings: Record<string, unknown> = {
        acceptsOrders: form.acceptsOrders,
        minimumOrderAmount: parseFloat(form.minOrderAmount) || 0,
        estimatedPrepTime: parseInt(form.prepTime, 10) || 15,
        // Printer settings
        printerEnabled: form.printerEnabled,
        printerConnectionType: form.printerConnectionType,
        printerIp: form.printerIp.trim(),
        printerPort: parseInt(form.printerPort, 10) || 9100,
        printerType: form.printerType,
        printerWidth: parseInt(form.printerWidth, 10) || 48,
        autoPrintOnComplete: form.autoPrintOnComplete,
        // Parcel charges
        kitchenParcelCharge: parseFloat(form.kitchenParcelCharge) || 0,
        beverageParcelCharge: parseFloat(form.beverageParcelCharge) || 0,
        // Auto-lock settings
        autoLockEnabled: form.autoLockEnabled,
        autoLockTimeout: parseInt(form.autoLockTimeout, 10) || 2,
        lockPin: form.lockPin || undefined,
        // Customer verification
        requirePhoneVerification: form.requirePhoneVerification,
        // WhatsApp billing
        whatsappBillEnabled: form.whatsappBillEnabled,
        whatsappPhoneNumberId: form.whatsappPhoneNumberId.trim(),
        whatsappBusinessAccountId: form.whatsappBusinessAccountId.trim(),
        ...(form.whatsappAccessToken.trim() ? { whatsappAccessToken: form.whatsappAccessToken.trim() } : {}),
        // Twilio
        twilioEnabled: form.twilioEnabled,
        twilioAccountSid: form.twilioAccountSid.trim(),
        ...(form.twilioAuthToken.trim() ? { twilioAuthToken: form.twilioAuthToken.trim() } : {}),
        twilioPhoneNumber: form.twilioPhoneNumber.trim(),
        // WhatsApp Alerts
        adminWhatsAppPhone: form.adminWhatsAppPhone.trim(),
        whatsappAlertLowStock: form.whatsappAlertLowStock,
        whatsappAlertStaffLate: form.whatsappAlertStaffLate,
        whatsappAlertEarlyCheckout: form.whatsappAlertEarlyCheckout,
        whatsappAlertAutoInvoice: form.whatsappAlertAutoInvoice,
        staffLateThresholdMinutes: parseInt(form.staffLateThresholdMinutes, 10) || 15,
        earlyCheckoutThresholdMinutes: parseInt(form.earlyCheckoutThresholdMinutes, 10) || 30,
        // Print layout
        qrLogoUrl: form.qrLogoUrl,
        printLogoUrl: form.printLogoUrl,
        printHeaderText: form.printHeaderText,
        printFooterText: form.printFooterText,
        printShowLogo: form.printShowLogo,
        printShowAddress: form.printShowAddress,
        printShowCustomerInfo: form.printShowCustomerInfo,
        printShowItemModifiers: form.printShowItemModifiers,
        printShowSpecialInstructions: form.printShowSpecialInstructions,
        printShowSubtotal: form.printShowSubtotal,
        printShowTax: form.printShowTax,
        menuShowItemImages: form.menuShowItemImages,
        smartInventoryEnabled: form.smartInventoryEnabled,
        reportEmails: form.reportEmails.split(',').map(e => e.trim()).filter(Boolean),
      };

      // Include password when turning off accept orders
      if (form.acceptsOrders === false && passwordRef.current) {
        settings.password = passwordRef.current;
      }

      return settingsService.update({
        name: form.name,
        currency: form.currency,
        taxRate: parseFloat(form.taxRate) || 0,
        // Geo-fence: send null to disable, or numbers to enable
        latitude: form.geoFenceEnabled && form.geoLatitude ? parseFloat(form.geoLatitude) : null,
        longitude: form.geoFenceEnabled && form.geoLongitude ? parseFloat(form.geoLongitude) : null,
        geoFenceRadius: form.geoFenceEnabled ? parseInt(form.geoFenceRadius, 10) || 50 : undefined,
        settings: settings as any,
      });
    },
    onSuccess: (data) => {
      // Immediately update the cached data
      queryClient.setQueryData(['settings', activeBranchId], data);
      // Also invalidate to trigger refetch in other components using this data
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
      toast.success('Settings saved successfully');
      // Reset password state
      passwordRef.current = '';
      setConfirmPassword('');
      setConfirmLockPin('');
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
    // Validate PIN confirmation if a new PIN is being set
    if (form.lockPin.length > 0 && form.lockPin.length < 6) {
      toast.error('PIN must be exactly 6 digits');
      return;
    }
    if (form.lockPin.length === 6 && form.lockPin !== initial.lockPin && confirmLockPin !== form.lockPin) {
      toast.error('PIN and confirmation do not match');
      return;
    }
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
    <div className="w-full max-w-5xl space-y-6">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700 font-semibold">Failed to load settings</p>
        <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing the page.</p>
      </div>
    </div>
  );

  /* ═════════════════════════ RENDER ═════════════════════════ */

  return (
    <div className="space-y-6 w-full max-w-5xl">

      {/* ── Tab Navigation ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 sticky top-0 z-10 w-fit max-w-full overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              title={tab.label}
              className={`inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0 ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            {/* QR Code Logo */}
            <SectionCard
              icon="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
              title="Logo"
              subtitle="Logo displayed in the center of downloaded QR codes"
            >
              <div className="flex items-center gap-4">
                {form.qrLogoUrl ? (
                  <div className="relative w-20 h-20 rounded-xl border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
                    <img
                      src={form.qrLogoUrl.startsWith('/uploads') ? `${(import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.infynarc.com/api' : 'http://localhost:3000/api')).replace('/api', '')}${form.qrLogoUrl}` : form.qrLogoUrl}
                      alt="QR logo"
                      className="max-w-full max-h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => update('qrLogoUrl', '')}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => qrLogoInputRef.current?.click()}
                    disabled={qrLogoUploading}
                    className="px-4 py-2 text-sm font-medium text-primary bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
                  >
                    {qrLogoUploading ? 'Uploading...' : form.qrLogoUrl ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  <p className="text-[11px] text-text-muted">JPEG, PNG, or WebP. Max 5MB.</p>
                </div>
                <input
                  ref={qrLogoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleQrLogoUpload}
                  className="hidden"
                />
              </div>
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

              <Field label="Kitchen Parcel Charge" hint="Per-item charge for takeaway kitchen orders">
                <div className="relative">
                  <input
                    type="number"
                    value={form.kitchenParcelCharge}
                    onChange={(e) => update('kitchenParcelCharge', e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    min="0"
                    step="1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">{form.currency === 'INR' ? '₹' : form.currency}</span>
                </div>
              </Field>

              <Field label="Beverage Parcel Charge" hint="Per-item charge for takeaway beverage orders">
                <div className="relative">
                  <input
                    type="number"
                    value={form.beverageParcelCharge}
                    onChange={(e) => update('beverageParcelCharge', e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    min="0"
                    step="1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">{form.currency === 'INR' ? '₹' : form.currency}</span>
                </div>
              </Field>
            </SectionCard>

            {/* Geo-Fence Security */}
            <SectionCard
              icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              title="Geo-Fence Security"
              subtitle="Prevent remote ordering by requiring customers to be near your restaurant"
            >
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    form.geoFenceEnabled ? 'bg-green-100' : 'bg-gray-200'
                  }`}>
                    <svg className={`w-5 h-5 ${form.geoFenceEnabled ? 'text-green-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Enable Geo-Fence</p>
                    <p className="text-xs text-text-muted">
                      {form.geoFenceEnabled
                        ? 'Only customers near your restaurant can place orders'
                        : 'Anyone with the QR code link can order from anywhere'}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.geoFenceEnabled}
                  onChange={() => update('geoFenceEnabled', !form.geoFenceEnabled)}
                  size="md"
                />
              </div>

              {form.geoFenceEnabled && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Restaurant Latitude" hint="e.g. 12.9716">
                      <input
                        type="number"
                        value={form.geoLatitude}
                        onChange={(e) => update('geoLatitude', e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        step="any"
                        min="-90"
                        max="90"
                        placeholder="Latitude"
                      />
                    </Field>
                    <Field label="Restaurant Longitude" hint="e.g. 77.5946">
                      <input
                        type="number"
                        value={form.geoLongitude}
                        onChange={(e) => update('geoLongitude', e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        step="any"
                        min="-180"
                        max="180"
                        placeholder="Longitude"
                      />
                    </Field>
                  </div>
                  <Field label="Allowed Radius" hint="Maximum distance in meters from your restaurant">
                    <div className="relative">
                      <input
                        type="number"
                        value={form.geoFenceRadius}
                        onChange={(e) => update('geoFenceRadius', e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        min="10"
                        max="5000"
                        step="10"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">m</span>
                    </div>
                  </Field>
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <p className="text-xs text-blue-700 leading-relaxed">
                      📍 <strong>How to get coordinates:</strong> Open Google Maps, right-click on your restaurant location, and click the coordinates to copy them. Enter the latitude and longitude above.
                    </p>
                  </div>
                  {(!form.geoLatitude || !form.geoLongitude) && (
                    <div className="p-3 bg-amber-50 rounded-xl">
                      <p className="text-xs text-amber-700 leading-relaxed">
                        ⚠️ Please enter both latitude and longitude for the geo-fence to work. Without coordinates, the geo-fence will not be active even if enabled.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* WhatsApp Alerts */}
            <SectionCard
              icon="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
              title="WhatsApp Alerts"
              subtitle="Get notifications on WhatsApp for important events"
            >
              <Field label="Admin WhatsApp Number" hint="Phone number to receive alerts (with country code, e.g. +91...)">
                <input
                  type="text"
                  value={form.adminWhatsAppPhone}
                  onChange={(e) => update('adminWhatsAppPhone', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="+919876543210"
                />
              </Field>

              <div className="space-y-3">
                {/* Low Stock Alert */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      form.whatsappAlertLowStock ? 'bg-red-100' : 'bg-gray-200'
                    }`}>
                      <span className="text-lg">{form.whatsappAlertLowStock ? '⚠️' : '📦'}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Low Stock Alerts</p>
                      <p className="text-xs text-text-muted">
                        {form.whatsappAlertLowStock
                          ? 'You will be alerted when ingredients run low'
                          : 'Enable to get notified when stock is below minimum'}
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={form.whatsappAlertLowStock}
                    onChange={() => update('whatsappAlertLowStock', !form.whatsappAlertLowStock)}
                    size="md"
                  />
                </div>

                {/* Staff Late Alert */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      form.whatsappAlertStaffLate ? 'bg-amber-100' : 'bg-gray-200'
                    }`}>
                      <span className="text-lg">{form.whatsappAlertStaffLate ? '⏰' : '👥'}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Staff Late Alerts</p>
                      <p className="text-xs text-text-muted">
                        {form.whatsappAlertStaffLate
                          ? 'You will be alerted when staff miss their shift check-in'
                          : 'Enable to get notified when staff are late'}
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={form.whatsappAlertStaffLate}
                    onChange={() => update('whatsappAlertStaffLate', !form.whatsappAlertStaffLate)}
                    size="md"
                  />
                </div>

                {form.whatsappAlertStaffLate && (
                  <div className="ml-14">
                    <Field label="Late Threshold (minutes)" hint="Alert after this many minutes past shift start">
                      <input
                        type="number"
                        value={form.staffLateThresholdMinutes}
                        onChange={(e) => update('staffLateThresholdMinutes', e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        min="5"
                        max="120"
                        step="5"
                      />
                    </Field>
                  </div>
                )}

                {/* Early Checkout Alert */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      form.whatsappAlertEarlyCheckout ? 'bg-violet-100' : 'bg-gray-200'
                    }`}>
                      <span className="text-lg">{form.whatsappAlertEarlyCheckout ? '🚪' : '🕐'}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Early Checkout Alerts</p>
                      <p className="text-xs text-text-muted">
                        {form.whatsappAlertEarlyCheckout
                          ? 'You will be alerted when staff check out before shift ends'
                          : 'Enable to get notified when staff leave early'}
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={form.whatsappAlertEarlyCheckout}
                    onChange={() => update('whatsappAlertEarlyCheckout', !form.whatsappAlertEarlyCheckout)}
                    size="md"
                  />
                </div>

                {form.whatsappAlertEarlyCheckout && (
                  <div className="ml-14">
                    <Field label="Early Checkout Threshold (minutes)" hint="Alert if staff checks out this many minutes before shift end">
                      <input
                        type="number"
                        value={form.earlyCheckoutThresholdMinutes}
                        onChange={(e) => update('earlyCheckoutThresholdMinutes', e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        min="5"
                        max="120"
                        step="5"
                      />
                    </Field>
                  </div>
                )}

                {/* Auto Invoice */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      form.whatsappAlertAutoInvoice ? 'bg-green-100' : 'bg-gray-200'
                    }`}>
                      <span className="text-lg">{form.whatsappAlertAutoInvoice ? '🧾' : '📄'}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Auto-send Invoice</p>
                      <p className="text-xs text-text-muted">
                        {form.whatsappAlertAutoInvoice
                          ? 'Customers receive invoice on WhatsApp after payment'
                          : 'Enable to auto-send invoices to customers on order completion'}
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={form.whatsappAlertAutoInvoice}
                    onChange={() => update('whatsappAlertAutoInvoice', !form.whatsappAlertAutoInvoice)}
                    size="md"
                  />
                </div>
              </div>

              {!form.adminWhatsAppPhone && (form.whatsappAlertLowStock || form.whatsappAlertStaffLate || form.whatsappAlertEarlyCheckout) && (
                <div className="p-3 bg-amber-50 rounded-xl">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    ⚠️ Please enter an admin WhatsApp number above to receive low stock, staff late, and early checkout alerts.
                  </p>
                </div>
              )}

              <div className="p-3 bg-blue-50 rounded-xl">
                <p className="text-xs text-blue-700 leading-relaxed">
                  📱 WhatsApp alerts use Twilio. Ensure your Twilio credentials are configured in the server environment. Auto-invoice requires customers to have a phone number on their order.
                </p>
              </div>
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
                    form.acceptsOrders ? 'bg-orange-100' : 'bg-red-100'
                  }`}>
                    <svg className={`w-5 h-5 ${form.acceptsOrders ? 'text-primary' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            {/* Customer Phone Verification */}
            <SectionCard
              icon="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
              title="Customer Phone Verification"
              subtitle="Require customers to provide and verify their phone number before ordering"
            >
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    form.requirePhoneVerification ? 'bg-blue-100' : 'bg-gray-200'
                  }`}>
                    <svg className={`w-5 h-5 ${form.requirePhoneVerification ? 'text-blue-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Require OTP Verification</p>
                    <p className="text-xs text-text-muted">
                      {form.requirePhoneVerification
                        ? 'Customers must verify phone via SMS before ordering (~$0.05/verification)'
                        : 'Phone number collected with format validation only (free)'}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.requirePhoneVerification}
                  onChange={() => update('requirePhoneVerification', !form.requirePhoneVerification)}
                  size="md"
                />
              </div>
              <div className="px-1">
                <p className="text-xs text-text-muted leading-relaxed">
                  {form.requirePhoneVerification
                    ? '📱 Customers will receive a 6-digit SMS code to verify their number. Requires Twilio credentials in server configuration.'
                    : '📋 Customers enter their phone number with format validation. A message reminds them that order updates will be sent to this number.'}
                </p>
              </div>
            </SectionCard>

            {/* Daily Report Email */}
            <SectionCard title="Daily Report Email" subtitle="Receive an end-of-day summary at 11:00 PM IST with settlement totals and top-selling items." icon="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-text-primary">
                  Report Recipients
                </label>
                <input
                  type="text"
                  value={form.reportEmails}
                  onChange={e => update('reportEmails', e.target.value)}
                  placeholder="owner@cafe.com, manager@cafe.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <p className="text-xs text-text-muted">
                  Enter one or more email addresses separated by commas. Leave empty to send to the restaurant owner's account email.
                </p>
              </div>
            </SectionCard>

            {/* Smart Inventory */}
            <SectionCard
              icon="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625v2.625m0 2.625v2.625"
              title="Smart Inventory"
              subtitle="Automatically deduct ingredients from stock when orders are placed, and disable menu items when an ingredient runs out"
            >
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    form.smartInventoryEnabled ? 'bg-green-100' : 'bg-gray-200'
                  }`}>
                    <svg className={`w-5 h-5 ${form.smartInventoryEnabled ? 'text-green-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Auto-deduct on Order</p>
                    <p className="text-xs text-text-muted">
                      {form.smartInventoryEnabled
                        ? 'Ingredients will be deducted automatically when orders are placed'
                        : 'Ingredients must be adjusted manually'}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.smartInventoryEnabled}
                  onChange={() => update('smartInventoryEnabled', !form.smartInventoryEnabled)}
                  size="md"
                />
              </div>
              <div className="px-1">
                <p className="text-xs text-text-muted leading-relaxed">
                  Requires recipes to be set up for each menu item in the Inventory section. When an ingredient reaches zero, the linked menu items will be automatically marked unavailable.
                </p>
              </div>
            </SectionCard>

            {/* Menu Display */}
            <SectionCard
              icon="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5"
              title="Menu Display"
              subtitle="Controls how menu items appear in Create Order and QSR"
            >
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-text-primary">Show Item Images</p>
                  <p className="text-xs text-text-muted">Display item photos on the menu grid</p>
                </div>
                <Toggle checked={form.menuShowItemImages} onChange={() => update('menuShowItemImages', !form.menuShowItemImages)} size="md" />
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ Printer Tab ══════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'printer' && (
          <motion.div
            key="printer"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-5"
          >
            <SectionCard
              icon="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
              title="Receipt Printer"
              subtitle="Configure your printer for automatic receipt printing"
            >
              {/* Enable printer toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    form.printerEnabled ? 'bg-orange-100' : 'bg-gray-200'
                  }`}>
                    <svg className={`w-5 h-5 ${form.printerEnabled ? 'text-primary' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Enable Printer</p>
                    <p className="text-xs text-text-muted">
                      {form.printerEnabled ? 'Printer is active' : 'Printer is disabled'}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.printerEnabled}
                  onChange={() => update('printerEnabled', !form.printerEnabled)}
                  size="md"
                />
              </div>

              {form.printerEnabled && (
                <>
                  {/* ── Connection Type Selector ── */}
                  <div>
                    <p className="text-sm font-semibold text-text-primary mb-1">Connection Type</p>
                    <p className="text-xs text-text-muted mb-3">Choose how your printer connects</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Network / WiFi */}
                      <button
                        type="button"
                        onClick={() => update('printerConnectionType', 'network')}
                        className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                          form.printerConnectionType === 'network'
                            ? 'border-primary bg-orange-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        {form.printerConnectionType === 'network' && (
                          <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 ${
                          form.printerConnectionType === 'network' ? 'bg-orange-100' : 'bg-gray-100'
                        }`}>
                          <svg className={`w-5 h-5 ${form.printerConnectionType === 'network' ? 'text-primary' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-text-primary">Network / WiFi</p>
                        <p className="text-[11px] text-text-muted mt-0.5">Connect via IP address over your local network</p>
                      </button>

                      {/* Bluetooth */}
                      <button
                        type="button"
                        onClick={() => update('printerConnectionType', 'bluetooth')}
                        className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                          form.printerConnectionType === 'bluetooth'
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        {form.printerConnectionType === 'bluetooth' && (
                          <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 ${
                          form.printerConnectionType === 'bluetooth' ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          <svg className={`w-5 h-5 ${form.printerConnectionType === 'bluetooth' ? 'text-blue-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l4 4-4 4m0-8v16m0 0l4-4-4-4m0 8l-4-4 4-4" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-text-primary">Bluetooth</p>
                        <p className="text-[11px] text-text-muted mt-0.5">Pair with portable Bluetooth thermal printers</p>
                      </button>

                      {/* Browser Print */}
                      <button
                        type="button"
                        onClick={() => update('printerConnectionType', 'browser')}
                        className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                          form.printerConnectionType === 'browser'
                            ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        {form.printerConnectionType === 'browser' && (
                          <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 ${
                          form.printerConnectionType === 'browser' ? 'bg-emerald-100' : 'bg-gray-100'
                        }`}>
                          <svg className={`w-5 h-5 ${form.printerConnectionType === 'browser' ? 'text-emerald-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-text-primary">Browser Print</p>
                        <p className="text-[11px] text-text-muted mt-0.5">Use any printer connected to your computer (USB, WiFi, etc.)</p>
                      </button>
                    </div>
                  </div>

                  {/* ── Network / WiFi Settings ── */}
                  {form.printerConnectionType === 'network' && (
                    <>
                      <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-primary mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-text-muted">
                            Connects directly to ESC/POS thermal printers over your local network using TCP/IP. The printer must be on the same network as the server.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Printer IP Address" hint="e.g. 192.168.1.100">
                          <input
                            type="text"
                            value={form.printerIp}
                            onChange={(e) => update('printerIp', e.target.value)}
                            placeholder="192.168.1.100"
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                          />
                        </Field>

                        <Field label="Port" hint="Default: 9100">
                          <input
                            type="number"
                            value={form.printerPort}
                            onChange={(e) => update('printerPort', e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                            min="1"
                            max="65535"
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Printer Brand" hint="Select your printer manufacturer">
                          <select
                            value={form.printerType}
                            onChange={(e) => update('printerType', e.target.value as 'epson' | 'star')}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                          >
                            <option value="epson">Epson (TM-T82, TM-T88, etc.)</option>
                            <option value="star">Star (TSP100, TSP650, etc.)</option>
                          </select>
                        </Field>

                        <Field label="Paper Width" hint="Characters per line">
                          <select
                            value={form.printerWidth}
                            onChange={(e) => update('printerWidth', e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                          >
                            <option value="48">80mm (48 chars) — Standard</option>
                            <option value="32">58mm (32 chars) — Compact</option>
                          </select>
                        </Field>
                      </div>

                      {/* Test Print */}
                      <PrinterTestButton
                        printerIp={form.printerIp}
                        printerPort={parseInt(form.printerPort, 10) || 9100}
                        printerType={form.printerType}
                        printerWidth={parseInt(form.printerWidth, 10) || 48}
                      />
                    </>
                  )}

                  {/* ── Bluetooth Settings ── */}
                  {form.printerConnectionType === 'bluetooth' && (
                    <>
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-text-muted">
                            Uses Web Bluetooth to connect to portable Bluetooth thermal printers. Your browser must support Web Bluetooth (Chrome, Edge, Opera). Pair the printer with your device first via system Bluetooth settings.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Printer Brand" hint="Select your printer manufacturer">
                          <select
                            value={form.printerType}
                            onChange={(e) => update('printerType', e.target.value as 'epson' | 'star')}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                          >
                            <option value="epson">Epson (TM-T82, TM-T88, etc.)</option>
                            <option value="star">Star (TSP100, SM-series, etc.)</option>
                          </select>
                        </Field>

                        <Field label="Paper Width" hint="Characters per line">
                          <select
                            value={form.printerWidth}
                            onChange={(e) => update('printerWidth', e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                          >
                            <option value="48">80mm (48 chars) — Standard</option>
                            <option value="32">58mm (32 chars) — Compact</option>
                          </select>
                        </Field>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l4 4-4 4m0-8v16m0 0l4-4-4-4m0 8l-4-4 4-4" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text-primary">Bluetooth Pairing</p>
                            <p className="text-xs text-text-muted">
                              Make sure your Bluetooth printer is turned on and paired with this device via system settings. When printing, the browser will prompt you to select the Bluetooth device.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Browser Print Settings ── */}
                  {form.printerConnectionType === 'browser' && (
                    <>
                      <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-text-muted">
                            Uses your browser&apos;s built-in print dialog. Works with any printer connected to your computer — USB, WiFi (AirPrint, Google Cloud Print), or Bluetooth. Select the desired printer in the print dialog that appears.
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text-primary">No Additional Setup Required</p>
                            <p className="text-xs text-text-muted">
                              Any printer that works with your operating system will automatically be available in the browser print dialog. Just click print and select your printer.
                            </p>
                          </div>
                        </div>
                      </div>

                      <Field label="Paper Width" hint="Used for receipt formatting">
                        <select
                          value={form.printerWidth}
                          onChange={(e) => update('printerWidth', e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        >
                          <option value="48">80mm (48 chars) — Standard</option>
                          <option value="32">58mm (32 chars) — Compact</option>
                        </select>
                      </Field>
                    </>
                  )}

                  {/* Auto-print toggle (shared across all types) */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        form.autoPrintOnComplete ? 'bg-blue-100' : 'bg-gray-200'
                      }`}>
                        <svg className={`w-5 h-5 ${form.autoPrintOnComplete ? 'text-blue-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">Auto-Print on Completion</p>
                        <p className="text-xs text-text-muted">
                          Automatically print receipt when an order is marked as completed
                        </p>
                      </div>
                    </div>
                    <Toggle
                      checked={form.autoPrintOnComplete}
                      onChange={() => update('autoPrintOnComplete', !form.autoPrintOnComplete)}
                      size="md"
                    />
                  </div>
                </>
              )}
            </SectionCard>

            {/* ── Receipt Layout ── */}
            {form.printerEnabled && (
              <SectionCard
                icon="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                title="Receipt Layout"
                subtitle="Customize what appears on your printed receipts"
              >
                {/* Logo Upload */}
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-1">Restaurant Logo</p>
                  <p className="text-xs text-text-muted mb-3">Upload a logo to display at the top of receipts</p>
                  <div className="flex items-center gap-4">
                    {form.printLogoUrl ? (
                      <div className="relative w-20 h-20 rounded-xl border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
                        <img
                          src={form.printLogoUrl.startsWith('/uploads') ? `${(import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.infynarc.com/api' : 'http://localhost:3000/api')).replace('/api', '')}${form.printLogoUrl}` : form.printLogoUrl}
                          alt="Receipt logo"
                          className="max-w-full max-h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => update('printLogoUrl', '')}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="px-4 py-2 text-sm font-medium text-primary bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
                      >
                        {logoUploading ? 'Uploading...' : form.printLogoUrl ? 'Change Logo' : 'Upload Logo'}
                      </button>
                      <p className="text-[11px] text-text-muted">JPEG, PNG, or WebP. Max 5MB.</p>
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Show Logo Toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Show Logo on Receipt</p>
                    <p className="text-xs text-text-muted">Display the uploaded logo at the top</p>
                  </div>
                  <Toggle
                    checked={form.printShowLogo}
                    onChange={() => update('printShowLogo', !form.printShowLogo)}
                    size="md"
                  />
                </div>

                {/* Header Text */}
                <Field label="Header Text" hint="Additional text shown below restaurant name (e.g. address, phone)">
                  <textarea
                    value={form.printHeaderText}
                    onChange={(e) => update('printHeaderText', e.target.value)}
                    placeholder="123 Main St, City&#10;Phone: (555) 123-4567"
                    rows={2}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                  />
                </Field>

                {/* Footer Text */}
                <Field label="Footer Text" hint="Message shown at the bottom of receipts">
                  <input
                    type="text"
                    value={form.printFooterText}
                    onChange={(e) => update('printFooterText', e.target.value)}
                    placeholder="Thank you!"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </Field>

                {/* Section visibility toggles */}
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-1">Receipt Sections</p>
                  <p className="text-xs text-text-muted mb-3">Choose which sections to include on printed receipts</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Address &amp; Contact</p>
                        <p className="text-xs text-text-muted">Header text under restaurant name</p>
                      </div>
                      <Toggle checked={form.printShowAddress} onChange={() => update('printShowAddress', !form.printShowAddress)} size="md" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Customer Info</p>
                        <p className="text-xs text-text-muted">Customer name and phone number</p>
                      </div>
                      <Toggle checked={form.printShowCustomerInfo} onChange={() => update('printShowCustomerInfo', !form.printShowCustomerInfo)} size="md" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Item Modifiers</p>
                        <p className="text-xs text-text-muted">Customizations and modifier options</p>
                      </div>
                      <Toggle checked={form.printShowItemModifiers} onChange={() => update('printShowItemModifiers', !form.printShowItemModifiers)} size="md" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Special Instructions</p>
                        <p className="text-xs text-text-muted">Order and item-level notes</p>
                      </div>
                      <Toggle checked={form.printShowSpecialInstructions} onChange={() => update('printShowSpecialInstructions', !form.printShowSpecialInstructions)} size="md" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Subtotal</p>
                        <p className="text-xs text-text-muted">Show subtotal before tax</p>
                      </div>
                      <Toggle checked={form.printShowSubtotal} onChange={() => update('printShowSubtotal', !form.printShowSubtotal)} size="md" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Tax</p>
                        <p className="text-xs text-text-muted">Show tax amount line</p>
                      </div>
                      <Toggle checked={form.printShowTax} onChange={() => update('printShowTax', !form.printShowTax)} size="md" />
                    </div>
                  </div>
                </div>

                {/* ── Live Receipt Preview ── */}
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-1">Receipt Preview</p>
                  <p className="text-xs text-text-muted mb-3">Live preview of how your receipt will look</p>
                  <div className="flex justify-center">
                    <div
                      className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
                      style={{ width: 320, fontFamily: 'monospace', fontSize: 12, color: '#111' }}
                    >
                      <div style={{ padding: '20px 16px' }}>
                        {/* Logo */}
                        {form.printShowLogo && form.printLogoUrl && (
                          <div style={{ textAlign: 'center', marginBottom: 8 }}>
                            <img
                              src={form.printLogoUrl.startsWith('/uploads') ? `${(import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.infynarc.com/api' : 'http://localhost:3000/api')).replace('/api', '')}${form.printLogoUrl}` : form.printLogoUrl}
                              alt="logo"
                              style={{ maxWidth: 100, maxHeight: 50, display: 'inline-block' }}
                            />
                          </div>
                        )}
                        {/* Restaurant Name */}
                        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                          {form.name || 'Restaurant Name'}
                        </div>
                        {/* Header text */}
                        {form.printShowAddress && form.printHeaderText && (
                          <div style={{ textAlign: 'center', color: '#666', fontSize: 11, whiteSpace: 'pre-line', marginBottom: 6 }}>
                            {form.printHeaderText}
                          </div>
                        )}
                        {/* Order info */}
                        <div style={{ textAlign: 'center', color: '#666', fontSize: 11, marginBottom: 2 }}>Table 5</div>
                        <div style={{ textAlign: 'center', color: '#666', fontSize: 11, marginBottom: 2 }}>Order: #1042</div>
                        <div style={{ textAlign: 'center', color: '#666', fontSize: 11, marginBottom: 8 }}>
                          {new Date().toLocaleString()}
                        </div>
                        {/* Divider */}
                        <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                        {/* Customer info */}
                        {form.printShowCustomerInfo && (
                          <div style={{ fontSize: 11, color: '#444', marginBottom: 4 }}>👤 John Doe · 9876543210</div>
                        )}
                        {/* Special instructions */}
                        {form.printShowSpecialInstructions && (
                          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '5px 8px', margin: '4px 0 6px', fontSize: 10, fontWeight: 600, color: '#92400e' }}>
                            📝 No onions please
                          </div>
                        )}
                        {/* Items */}
                        {[
                          { name: 'Butter Chicken', qty: 1, price: 320, mods: [{ group: 'Spice Level', opt: 'Medium' }], note: '' },
                          { name: 'Garlic Naan', qty: 2, price: 120, mods: [], note: 'Extra crispy' },
                          { name: 'Mango Lassi', qty: 1, price: 90, mods: [], note: '' },
                        ].map((item, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, padding: '5px 0', borderBottom: '1px solid #eee' }}>
                            <span style={{ fontWeight: 700, minWidth: 24, height: 24, background: '#f3f4f6', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{item.qty}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 12 }}>{item.name}</div>
                              {form.printShowItemModifiers && item.mods.map((m, j) => (
                                <div key={j} style={{ color: '#888', fontSize: 10, marginTop: 1 }}>{m.group}: {m.opt}</div>
                              ))}
                              {form.printShowSpecialInstructions && item.note && (
                                <div style={{ color: '#d97706', fontSize: 10, marginTop: 1, fontWeight: 600 }}>⚠ {item.note}</div>
                              )}
                            </div>
                            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12 }}>{getCurrencySymbol(form.currency)}{item.price}</span>
                          </div>
                        ))}
                        {/* Divider */}
                        <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                        {/* Totals */}
                        {form.printShowSubtotal && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 12 }}>
                            <span>Subtotal</span><span>{getCurrencySymbol(form.currency)}530</span>
                          </div>
                        )}
                        {form.printShowTax && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 12 }}>
                            <span>Tax</span><span>{getCurrencySymbol(form.currency)}26.50</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 700, fontSize: 13 }}>
                          <span>TOTAL</span><span>{getCurrencySymbol(form.currency)}556.50</span>
                        </div>
                        {/* Footer */}
                        {form.printFooterText && (
                          <>
                            <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                            <div style={{ textAlign: 'center', fontSize: 12, color: '#444' }}>{form.printFooterText}</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ Security Tab ══════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'security' && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-5"
          >
            <SectionCard
              icon="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              title="Auto Lock"
              subtitle="Automatically lock the screen after a period of inactivity"
            >
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    form.autoLockEnabled ? 'bg-primary/10' : 'bg-gray-200'
                  }`}>
                    <svg className={`w-5 h-5 ${form.autoLockEnabled ? 'text-primary' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Auto Lock Screen</p>
                    <p className="text-xs text-text-muted">
                      {form.autoLockEnabled
                        ? `Lock after ${form.autoLockTimeout} min of inactivity`
                        : 'Screen will not lock automatically'}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={form.autoLockEnabled}
                  onChange={() => update('autoLockEnabled', !form.autoLockEnabled)}
                  size="md"
                />
              </div>

              {/* Timeout selector — only shown when enabled */}
              {form.autoLockEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-4"
                >
                  <Field label="Lock Timeout" hint="Time of inactivity before the screen locks">
                    <div className="relative">
                      <select
                        value={form.autoLockTimeout}
                        onChange={(e) => update('autoLockTimeout', e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none cursor-pointer"
                      >
                        <option value="1">1 minute</option>
                        <option value="2">2 minutes</option>
                        <option value="3">3 minutes</option>
                        <option value="5">5 minutes</option>
                        <option value="10">10 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">60 minutes</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </Field>
                </motion.div>
              )}
            </SectionCard>

            {/* Lock PIN */}
            {form.autoLockEnabled && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <SectionCard
                  icon="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  title="Lock PIN"
                  subtitle="Set a 6-digit PIN for quick unlock. If forgotten, use your account password."
                >
                  <div className="space-y-4">
                    {/* PIN status */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          form.lockPin.length === 6 ? 'bg-orange-100' : 'bg-amber-100'
                        }`}>
                          {form.lockPin.length === 6 ? (
                            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {form.lockPin.length === 6 ? 'PIN is set' : 'No PIN configured'}
                          </p>
                          <p className="text-xs text-text-muted">
                            {form.lockPin.length === 6
                              ? 'You can use this PIN to quickly unlock the screen'
                              : 'Without a PIN, you\'ll need your password to unlock'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* PIN input — box style */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-text-secondary">
                          {form.lockPin.length === 6 ? 'Change PIN' : 'Set PIN'}
                        </label>
                        {form.lockPin.length > 0 && (
                          <button
                            type="button"
                            onClick={() => { update('lockPin', ''); setConfirmLockPin(''); }}
                            className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="flex justify-center gap-2.5">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <input
                            key={`pin-${i}`}
                            ref={(el) => { pinBoxRefs.current[i] = el; }}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={1}
                            value={form.lockPin[i] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '');
                              if (!v && !form.lockPin[i]) return;
                              const digit = v.slice(-1);
                              const arr = form.lockPin.split('');
                              arr[i] = digit;
                              // Fill gaps with empty
                              while (arr.length < 6) arr.push('');
                              const next = arr.join('').replace(/[^0-9]/g, '').slice(0, 6);
                              update('lockPin', next);
                              if (digit && i < 5) pinBoxRefs.current[i + 1]?.focus();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && !form.lockPin[i] && i > 0) {
                                const arr = form.lockPin.split('');
                                arr[i - 1] = '';
                                update('lockPin', arr.join('').replace(/[^0-9]/g, ''));
                                pinBoxRefs.current[i - 1]?.focus();
                              }
                            }}
                            onPaste={(e) => {
                              if (i !== 0) return;
                              e.preventDefault();
                              const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                              update('lockPin', pasted);
                              pinBoxRefs.current[Math.min(pasted.length, 5)]?.focus();
                            }}
                            className={`w-11 h-12 text-center text-lg font-bold rounded-xl border-2 transition-all duration-200 focus:outline-none bg-gray-50 ${
                              form.lockPin[i]
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-gray-200 text-text-primary'
                            } focus:border-primary focus:ring-2 focus:ring-primary/20`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-text-muted text-center">
                        {form.lockPin.length === 6
                          ? <span className="text-primary font-medium flex items-center justify-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>6 digits entered</span>
                          : `${form.lockPin.length}/6 digits`}
                      </p>
                    </div>

                    {/* Confirm PIN — box style, shown when a new 6-digit PIN is entered */}
                    {form.lockPin.length === 6 && form.lockPin !== initial.lockPin && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-text-secondary">Confirm PIN</label>
                        <div className="flex justify-center gap-2.5">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <input
                              key={`confirm-${i}`}
                              ref={(el) => { confirmPinBoxRefs.current[i] = el; }}
                              type="password"
                              inputMode="numeric"
                              autoComplete="off"
                              maxLength={1}
                              value={confirmLockPin[i] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '');
                                if (!v && !confirmLockPin[i]) return;
                                const digit = v.slice(-1);
                                const arr = confirmLockPin.split('');
                                arr[i] = digit;
                                while (arr.length < 6) arr.push('');
                                const next = arr.join('').replace(/[^0-9]/g, '').slice(0, 6);
                                setConfirmLockPin(next);
                                if (digit && i < 5) confirmPinBoxRefs.current[i + 1]?.focus();
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Backspace' && !confirmLockPin[i] && i > 0) {
                                  const arr = confirmLockPin.split('');
                                  arr[i - 1] = '';
                                  setConfirmLockPin(arr.join('').replace(/[^0-9]/g, ''));
                                  confirmPinBoxRefs.current[i - 1]?.focus();
                                }
                              }}
                              onPaste={(e) => {
                                if (i !== 0) return;
                                e.preventDefault();
                                const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                                setConfirmLockPin(pasted);
                                confirmPinBoxRefs.current[Math.min(pasted.length, 5)]?.focus();
                              }}
                              className={`w-11 h-12 text-center text-lg font-bold rounded-xl border-2 transition-all duration-200 focus:outline-none bg-gray-50 ${
                                confirmLockPin[i]
                                  ? confirmLockPin.length === 6 && confirmLockPin === form.lockPin
                                    ? 'border-primary bg-orange-50 text-primary'
                                    : confirmLockPin.length === 6 && confirmLockPin !== form.lockPin
                                      ? 'border-red-400 bg-red-50 text-red-600'
                                      : 'border-primary bg-primary/5 text-primary'
                                  : 'border-gray-200 text-text-primary'
                              } focus:border-primary focus:ring-2 focus:ring-primary/20`}
                            />
                          ))}
                        </div>
                        {confirmLockPin.length === 6 && confirmLockPin === form.lockPin && (
                          <p className="text-xs text-primary font-medium text-center flex items-center justify-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            PINs match
                          </p>
                        )}
                        {confirmLockPin.length === 6 && confirmLockPin !== form.lockPin && (
                          <p className="text-xs text-red-500 font-medium text-center flex items-center justify-center gap-1">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            PINs do not match
                          </p>
                        )}
                        {confirmLockPin.length < 6 && (
                          <p className="text-xs text-text-muted text-center">{confirmLockPin.length}/6 digits</p>
                        )}
                      </div>
                    )}

                    <div className="p-3 bg-blue-50 rounded-xl flex items-start gap-2">
                      <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-xs text-blue-700 space-y-1">
                        <p><strong>Quick unlock:</strong> When locked, enter your 6-digit PIN to unlock instantly.</p>
                        <p><strong>Forgot PIN?</strong> You can always use your account password to unlock and regain access.</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </motion.div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ Staff Tab ══════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'staff' && <StaffManagementTab />}
      </AnimatePresence>

      {/* ══════════ Permissions Tab ══════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'permissions' && <PermissionsTab />}
      </AnimatePresence>

      {/* ══════════ Sections Tab ══════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'sections' && <SectionsTab />}
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
              <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex items-center gap-3">
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
              <div className="px-4 sm:px-6 pb-4 space-y-3">
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
              <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex items-center gap-2">
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
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-4 sm:p-6 space-y-5"
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
