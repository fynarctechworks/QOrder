import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { twoFactorService } from '../services/twoFactorService';
import { useAuthStore } from '../state/authStore';
import type { User } from '../types';

export default function TwoFactorVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = (location.state as { userId?: string }) || {};
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-advance
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (newCode.every((d) => d) && index === 5) {
      handleSubmit(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      handleSubmit(pasted);
    }
  };

  async function handleSubmit(codeStr?: string) {
    const finalCode = codeStr || (useBackup ? backupCode : code.join(''));
    if (!userId || !finalCode) {
      toast.error('Missing verification data');
      return;
    }

    setIsLoading(true);
    try {
      const result = await twoFactorService.verifyLogin(userId, finalCode);
      if (result.accessToken) {
        useAuthStore.getState().setAccessToken(result.accessToken);
      }
      useAuthStore.getState().login(result.user as User, result.accessToken);
      toast.success('Login successful!');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  }

  if (!userId) {
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-5">
            <Logo size={64} className="rounded-2xl shadow-md" />
          </div>
          <h1 className="text-[22px] font-bold text-text-primary tracking-tight">
            Two-Factor Authentication
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {useBackup
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 sm:px-6 py-6 sm:py-7 space-y-5">
          {useBackup ? (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Backup Code
              </label>
              <input
                type="text"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                placeholder="Enter backup code"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-sm text-center tracking-widest"
                autoFocus
              />
            </div>
          ) : (
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className="w-11 h-12 rounded-xl border border-gray-200 text-center text-lg font-semibold focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                  autoFocus={idx === 0}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => handleSubmit()}
            disabled={isLoading || (useBackup ? !backupCode : code.some((d) => !d))}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Verifying...' : 'Verify'}
          </button>

          <div className="text-center">
            <button
              onClick={() => {
                setUseBackup(!useBackup);
                setCode(['', '', '', '', '', '']);
                setBackupCode('');
              }}
              className="text-sm text-primary hover:underline"
            >
              {useBackup ? 'Use authenticator app' : 'Use a backup code'}
            </button>
          </div>
        </div>

        <div className="text-center mt-4">
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Back to login
          </button>
        </div>
      </motion.div>
    </div>
  );
}
