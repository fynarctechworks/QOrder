import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { otpService } from '../services/otpService';

interface CustomerInfoSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string, phone: string) => void;
  isPending: boolean;
  totalLabel: string;
  restaurantId: string;
  tableId: string;
}

const STORAGE_KEY = 'qorder_customer_info';

function getSavedInfo(): { name: string; phone: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: '', phone: '' };
}

function saveInfo(name: string, phone: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, phone }));
}

export default function CustomerInfoSheet({
  open,
  onClose,
  onConfirm,
  isPending,
  totalLabel,
  restaurantId,
  tableId,
}: CustomerInfoSheetProps) {
  const { t } = useTranslation();
  const saved = getSavedInfo();
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  // OTP state
  const [step, setStep] = useState<'info' | 'otp'>('info');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Auto-focus name field when sheet opens
  useEffect(() => {
    if (open) {
      const saved = getSavedInfo();
      setName(saved.name);
      setPhone(saved.phone);
      setErrors({});
      setStep('info');
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError('');
      setOtpLoading(false);
      setTimeout(() => nameRef.current?.focus(), 300);
    }
  }, [open]);

  const validate = (): boolean => {
    const errs: { name?: string; phone?: string } = {};
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      errs.name = t('customerInfo.nameRequired');
    } else if (trimmedName.length < 2) {
      errs.name = t('customerInfo.nameMinLength');
    }

    if (!trimmedPhone) {
      errs.phone = t('customerInfo.phoneRequired');
    } else {
      // Strip optional +91 prefix, spaces, dashes
      const digits = trimmedPhone.replace(/^(\+91[\s-]?|91[\s-]?|0)/, '').replace(/[\s\-()]/g, '');
      if (!/^[6-9]\d{9}$/.test(digits)) {
        errs.phone = t('customerInfo.phoneInvalid10');
      } else if (/^(\d)\1{9}$/.test(digits)) {
        errs.phone = t('customerInfo.phoneInvalid');
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleConfirm = async () => {
    if (!validate()) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    saveInfo(trimmedName, trimmedPhone);

    // Format phone to E.164
    const digits = trimmedPhone.replace(/^(\+91[\s-]?|91[\s-]?|0)/, '').replace(/[\s\-()]/g, '');
    const fullPhone = `+91${digits}`;

    // Send OTP / check if OTP is required
    setOtpLoading(true);
    setOtpError('');
    try {
      const result = await otpService.sendOtp(fullPhone, restaurantId, tableId);
      if (!result.otpRequired) {
        // OTP not required — phone saved, proceed directly
        onConfirm(trimmedName, trimmedPhone);
      } else {
        // OTP sent — show OTP input step
        setStep('otp');
        setCountdown(30);
        setTimeout(() => otpRefs.current[0]?.focus(), 200);
      }
    } catch (err: unknown) {
      setOtpError((err as Error).message || 'Failed to send verification code');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = useCallback(async (code: string) => {
    const trimmedPhone = phone.trim();
    const digits = trimmedPhone.replace(/^(\+91[\s-]?|91[\s-]?|0)/, '').replace(/[\s\-()]/g, '');
    const fullPhone = `+91${digits}`;

    setOtpLoading(true);
    setOtpError('');
    try {
      await otpService.verifyOtp(fullPhone, code, restaurantId, tableId);
      onConfirm(name.trim(), trimmedPhone);
    } catch (err: unknown) {
      setOtpError((err as Error).message || 'Incorrect verification code');
      setOtpLoading(false);
    }
  }, [phone, name, restaurantId, tableId, onConfirm]);

  const handleResendOtp = useCallback(async () => {
    if (countdown > 0) return;
    const trimmedPhone = phone.trim();
    const digits = trimmedPhone.replace(/^(\+91[\s-]?|91[\s-]?|0)/, '').replace(/[\s\-()]/g, '');
    const fullPhone = `+91${digits}`;

    setOtpError('');
    try {
      await otpService.sendOtp(fullPhone, restaurantId, tableId);
      setCountdown(30);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      setOtpError((err as Error).message || 'Failed to resend code');
    }
  }, [phone, restaurantId, tableId, countdown]);

  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    // Auto-advance to next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    const code = newDigits.join('');
    if (code.length === 6) {
      handleVerifyOtp(code);
    }
  }, [otpDigits, handleVerifyOtp]);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }, [otpDigits]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);
    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
    } else {
      otpRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  }, [otpDigits, handleVerifyOtp]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl shadow-2xl safe-bottom max-w-lg mx-auto"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="px-6 pb-8 pt-2">
              <AnimatePresence mode="wait">
                {step === 'info' && (
                  <motion.div
                    key="info"
                    initial={{ opacity: 0, x: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.2 }}
                  >
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t('customerInfo.almostThere')}</h2>
                  <p className="text-xs text-gray-500">{t('customerInfo.whatsappHint')}</p>
                </div>
              </div>

              {/* Name */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('customerInfo.name')} <span className="text-red-400">*</span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder={t('customerInfo.namePlaceholder')}
                  className={`w-full border ${
                    errors.name ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-200'
                  } rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all`}
                  maxLength={100}
                  autoComplete="name"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-500 font-medium">{errors.name}</p>
                )}
              </div>

              {/* Phone */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('customerInfo.whatsappNumber')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  placeholder={t('customerInfo.phonePlaceholder')}
                  className={`w-full border ${
                    errors.phone ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-200'
                  } rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all`}
                  maxLength={20}
                  autoComplete="tel"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-500 font-medium">{errors.phone}</p>
                )}
              </div>

              {/* OTP error */}
              {otpError && (
                <p className="mb-4 text-xs text-red-500 font-medium text-center">{otpError}</p>
              )}

              {/* Confirm button */}
              <button
                onClick={handleConfirm}
                disabled={otpLoading}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold text-base py-4 rounded-2xl transition-colors shadow-sm"
              >
                {otpLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t('common.loading')}
                  </>
                ) : (
                  <>{t('cart.confirmOrder')} &middot; {totalLabel}</>
                )}
              </button>
                  </motion.div>
                )}

                {step === 'otp' && (
                  <motion.div
                    key="otp"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* OTP Header */}
                    <div className="flex items-center gap-3 mb-5">
                      <button
                        onClick={() => { setStep('info'); setOtpError(''); setOtpDigits(['', '', '', '', '', '']); }}
                        className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                      >
                        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">{t('phoneVerification.enterCode', 'Verify your number')}</h2>
                        <p className="text-xs text-gray-500">
                          {t('phoneVerification.codeSentTo', 'Code sent to {{phone}}').replace('{{phone}}', phone.trim())}
                        </p>
                      </div>
                    </div>

                    {/* OTP digit inputs */}
                    <div className="flex justify-center gap-2.5 mb-5" onPaste={handleOtpPaste}>
                      {otpDigits.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => { otpRefs.current[i] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${
                            otpError ? 'border-red-300 bg-red-50' : digit ? 'border-primary bg-primary/5' : 'border-gray-200 bg-gray-50'
                          }`}
                        />
                      ))}
                    </div>

                    {/* OTP error */}
                    {otpError && (
                      <p className="mb-4 text-xs text-red-500 font-medium text-center">{otpError}</p>
                    )}

                    {/* Resend link */}
                    <div className="text-center mb-5">
                      {countdown > 0 ? (
                        <p className="text-xs text-gray-400">
                          {t('phoneVerification.resendIn', 'Resend code in {{seconds}}s').replace('{{seconds}}', String(countdown))}
                        </p>
                      ) : (
                        <button
                          onClick={handleResendOtp}
                          className="text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
                        >
                          {t('phoneVerification.resendCode', 'Resend Code')}
                        </button>
                      )}
                    </div>

                    {/* Verify button */}
                    <button
                      onClick={() => {
                        const code = otpDigits.join('');
                        if (code.length === 6) handleVerifyOtp(code);
                      }}
                      disabled={otpLoading || otpDigits.join('').length < 6}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold text-base py-4 rounded-2xl transition-colors shadow-sm"
                    >
                      {otpLoading ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          {t('phoneVerification.verifying', 'Verifying...')}
                        </>
                      ) : (
                        <>{t('phoneVerification.verify', 'Verify & Place Order')} &middot; {totalLabel}</>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
