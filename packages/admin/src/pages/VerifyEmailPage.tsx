import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../state/authStore';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';

const OTP_LENGTH = 6;

export default function VerifyEmailPage() {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.login);

  const email = location.state?.email as string;

  // Redirect if no email in state
  useEffect(() => {
    if (!email) {
      navigate('/signup', { replace: true });
    }
  }, [email, navigate]);

  // Start cooldown on mount
  useEffect(() => {
    setResendCooldown(60);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // only digits

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // take last digit
    setOtp(newOtp);

    // Auto-advance
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all filled
    if (newOtp.every((d) => d !== '') && newOtp.join('').length === OTP_LENGTH) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i] ?? '';
    }
    setOtp(newOtp);

    // Focus last filled or next empty
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();

    if (newOtp.every((d) => d !== '')) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== OTP_LENGTH) {
      toast.error('Please enter the complete verification code');
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.verifyEmail(email, otpCode);
      setUser(result.user);
      toast.success('Email verified! Welcome to Q Order!');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid code');
      // Clear OTP on error
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    try {
      await authService.resendVerification(email);
      toast.success('New verification code sent!');
      setResendCooldown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend');
    }
  };

  if (!email) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Logo & heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-5">
            <Logo size={64} className="rounded-2xl shadow-md" />
          </div>
          <h1 className="text-[22px] font-bold text-text-primary tracking-tight">
            Verify your email
          </h1>
          <p className="text-sm text-text-muted mt-1">
            We've sent a 6-digit code to
          </p>
          <p className="text-sm font-medium text-text-primary mt-0.5">
            {email}
          </p>
        </div>

        {/* OTP card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-7 space-y-6">
          {/* OTP inputs */}
          <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={isLoading}
                className={`w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-gray-50 transition-all duration-200 focus:outline-none focus:bg-white disabled:opacity-50 ${
                  digit
                    ? 'border-primary text-primary'
                    : 'border-gray-200 text-text-primary focus:border-primary'
                }`}
                autoFocus={index === 0}
              />
            ))}
          </div>

          {/* Verify button */}
          <button
            onClick={() => handleVerify()}
            disabled={isLoading || otp.some((d) => !d)}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium text-sm py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Verify Email
              </>
            )}
          </button>

          {/* Resend */}
          <div className="text-center">
            {resendCooldown > 0 ? (
              <p className="text-xs text-text-muted">
                Resend code in <span className="font-semibold text-text-secondary">{resendCooldown}s</span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                className="text-sm text-primary font-medium hover:underline"
              >
                Resend verification code
              </button>
            )}
          </div>
        </div>

        {/* Back link */}
        <p className="text-center text-sm text-text-muted mt-5">
          Wrong email?{' '}
          <Link
            to="/signup"
            className="text-primary font-medium hover:underline"
          >
            Go back
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
