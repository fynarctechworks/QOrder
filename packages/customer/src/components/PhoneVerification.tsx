import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { otpService } from '../services/otpService';

// Common country codes — sorted by usage likelihood
const COUNTRY_CODES = [
  { code: '+91', country: 'IN', label: '🇮🇳 +91' },
  { code: '+1', country: 'US', label: '🇺🇸 +1' },
  { code: '+44', country: 'GB', label: '🇬🇧 +44' },
  { code: '+971', country: 'AE', label: '🇦🇪 +971' },
  { code: '+966', country: 'SA', label: '🇸🇦 +966' },
  { code: '+65', country: 'SG', label: '🇸🇬 +65' },
  { code: '+60', country: 'MY', label: '🇲🇾 +60' },
  { code: '+61', country: 'AU', label: '🇦🇺 +61' },
  { code: '+49', country: 'DE', label: '🇩🇪 +49' },
  { code: '+33', country: 'FR', label: '🇫🇷 +33' },
  { code: '+81', country: 'JP', label: '🇯🇵 +81' },
  { code: '+86', country: 'CN', label: '🇨🇳 +86' },
  { code: '+82', country: 'KR', label: '🇰🇷 +82' },
  { code: '+55', country: 'BR', label: '🇧🇷 +55' },
  { code: '+62', country: 'ID', label: '🇮🇩 +62' },
  { code: '+66', country: 'TH', label: '🇹🇭 +66' },
  { code: '+234', country: 'NG', label: '🇳🇬 +234' },
  { code: '+27', country: 'ZA', label: '🇿🇦 +27' },
  { code: '+52', country: 'MX', label: '🇲🇽 +52' },
  { code: '+39', country: 'IT', label: '🇮🇹 +39' },
];

interface Props {
  restaurantId: string;
  tableId: string;
  requireOtp: boolean;
  onVerified: () => void;
}

type Step = 'phone' | 'otp';

export default function PhoneVerification({ restaurantId, tableId, requireOtp, onVerified }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus phone input on mount
  useEffect(() => {
    setTimeout(() => phoneInputRef.current?.focus(), 300);
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const fullPhone = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;

  const handleSendOtp = useCallback(async () => {
    setError('');
    if (!phoneNumber.trim() || phoneNumber.replace(/\D/g, '').length < 5) {
      setError(t('phoneVerification.invalidPhone'));
      return;
    }

    setLoading(true);
    try {
      const result = await otpService.sendOtp(fullPhone, restaurantId, tableId);

      if (!result.otpRequired) {
        // OTP not required — phone saved with format validation only
        onVerified();
        return;
      }

      // OTP sent — move to code entry
      setStep('otp');
      setCountdown(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (err: unknown) {
      setError((err as Error).message || t('phoneVerification.sendFailed'));
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, fullPhone, restaurantId, tableId, onVerified]);

  const handleVerifyOtp = useCallback(async (code: string) => {
    setError('');
    setLoading(true);
    try {
      await otpService.verifyOtp(fullPhone, code, restaurantId, tableId);
      onVerified();
    } catch (err: unknown) {
      setError((err as Error).message || t('phoneVerification.incorrectCode'));
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  }, [fullPhone, restaurantId, tableId, onVerified]);

  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...otpDigits];
    // Handle paste of full code
    if (value.length > 1) {
      const digits = value.slice(0, 6).split('');
      digits.forEach((d, i) => {
        if (i < 6) newDigits[i] = d;
      });
      setOtpDigits(newDigits);
      const lastIndex = Math.min(digits.length - 1, 5);
      otpRefs.current[lastIndex]?.focus();
      if (digits.length === 6) {
        handleVerifyOtp(digits.join(''));
      }
      return;
    }

    newDigits[index] = value;
    setOtpDigits(newDigits);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    const code = newDigits.join('');
    if (code.length === 6 && newDigits.every((d) => d !== '')) {
      handleVerifyOtp(code);
    }
  }, [otpDigits, handleVerifyOtp]);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }, [otpDigits]);

  const handleResend = useCallback(async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);
    try {
      await otpService.sendOtp(fullPhone, restaurantId, tableId);
      setCountdown(30);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err: unknown) {
      setError((err as Error).message || t('phoneVerification.resendFailed'));
    } finally {
      setLoading(false);
    }
  }, [countdown, fullPhone, restaurantId, tableId]);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {step === 'phone' && (
          <motion.div
            key="phone-step"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Header */}
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-text-primary">{t('phoneVerification.enterPhone')}</h3>
              <p className="text-xs text-text-muted mt-1">
                {requireOtp
                  ? t('phoneVerification.otpHint')
                  : t('phoneVerification.noOtpHint')}
              </p>
            </div>

            {/* Phone input */}
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="shrink-0 w-[100px] px-2 py-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm font-medium text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {COUNTRY_CODES.map((cc) => (
                  <option key={cc.code} value={cc.code}>
                    {cc.label}
                  </option>
                ))}
              </select>
              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value.replace(/[^\d\s-]/g, ''));
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                placeholder={t('phoneVerification.phonePlaceholder')}
                className="flex-1 px-4 py-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm text-text-primary placeholder-text-muted/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-500 text-center"
              >
                {error}
              </motion.p>
            )}

            {/* Submit button */}
            <button
              onClick={handleSendOtp}
              disabled={loading || !phoneNumber.trim()}
              className="w-full py-3.5 bg-primary text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:bg-primary-hover active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {requireOtp ? t('phoneVerification.sendCode') : t('phoneVerification.continue')}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </motion.div>
        )}

        {step === 'otp' && (
          <motion.div
            key="otp-step"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Header */}
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-text-primary">{t('phoneVerification.enterCode')}</h3>
              <p className="text-xs text-text-muted mt-1">
                {t('phoneVerification.sentTo')} <span className="font-medium text-text-primary">{fullPhone}</span>
              </p>
            </div>

            {/* OTP input boxes */}
            <div className="flex justify-center gap-2">
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={i === 0 ? 6 : 1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text').replace(/\D/g, '');
                    if (text.length > 1) {
                      e.preventDefault();
                      handleOtpChange(0, text);
                    }
                  }}
                  className="w-11 h-12 text-center text-lg font-bold bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-500 text-center"
              >
                {error}
              </motion.p>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex justify-center">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}

            {/* Resend + back */}
            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setStep('phone');
                  setOtpDigits(['', '', '', '', '', '']);
                  setError('');
                }}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                {t('phoneVerification.changeNumber')}
              </button>
              <button
                onClick={handleResend}
                disabled={countdown > 0 || loading}
                className="text-primary font-medium disabled:text-text-muted disabled:opacity-60 transition-colors"
              >
                {countdown > 0 ? t('phoneVerification.resendIn', { countdown }) : t('phoneVerification.resendCode')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
