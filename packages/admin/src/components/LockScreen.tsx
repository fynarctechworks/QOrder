import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

interface LockScreenProps {
  hasPin: boolean;
  onUnlock: () => void;
}

export default function LockScreen({ hasPin, onUnlock }: LockScreenProps) {
  const { user, login } = useAuth();

  // PIN mode state
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [pinError, setPinError] = useState('');
  const [shake, setShake] = useState(false);

  // Password fallback state
  const [mode, setMode] = useState<'pin' | 'password'>(hasPin ? 'pin' : 'password');
  const [password, setPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [loading, setLoading] = useState(false);
  const pwdRef = useRef<HTMLInputElement>(null);

  // Auto-focus first PIN input or password field
  useEffect(() => {
    if (mode === 'pin') {
      setTimeout(() => pinRefs.current[0]?.focus(), 100);
    } else {
      setTimeout(() => pwdRef.current?.focus(), 100);
    }
  }, [mode]);

  // ── PIN handlers ──
  const handlePinChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setPinError('');

    // Auto-submit when all 6 digits filled
    const full = next.join('');
    if (full.length === 6 && next.every(d => d !== '')) {
      setLoading(true);
      settingsService.verifyPin(full).then(ok => {
        setLoading(false);
        if (ok) {
          onUnlock();
        } else {
          setShake(true);
          setPinError('Incorrect PIN');
          setTimeout(() => {
            setDigits(['', '', '', '', '', '']);
            setShake(false);
          }, 500);
        }
      });
    }
  }, [digits, onUnlock]);

  // ── Password handler ──
  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setPwdError('Please enter your password');
      return;
    }
    setLoading(true);
    setPwdError('');
    try {
      const identifier = user?.email || user?.username || '';
      await login(identifier, password);
      onUnlock();
    } catch {
      setPwdError('Incorrect password. Please try again.');
      setPassword('');
      pwdRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = useCallback((num: number) => {
    const idx = digits.findIndex(d => d === '');
    if (idx !== -1) handlePinChange(idx, String(num));
  }, [digits, handlePinChange]);

  const handleBackspace = useCallback(() => {
    const lastFilled = digits.reduce((acc, d, i) => (d ? i : acc), -1);
    if (lastFilled >= 0) {
      const next = [...digits];
      next[lastFilled] = '';
      setDigits(next);
      setPinError('');
    }
  }, [digits]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/98 backdrop-blur-2xl"
      onClick={() => mode === 'pin' && pinRefs.current[0]?.focus()}
    >
      {/* Hidden input for keyboard & paste support */}
      {mode === 'pin' && hasPin && (
        <input
          ref={(el) => { pinRefs.current[0] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value=""
          onChange={() => {}}
          onKeyDown={(e) => {
            if (loading) return;
            if (/^\d$/.test(e.key)) {
              const idx = digits.findIndex(d => d === '');
              if (idx !== -1) handlePinChange(idx, e.key);
            } else if (e.key === 'Backspace') {
              handleBackspace();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!pasted) return;
            const next = ['', '', '', '', '', ''];
            for (let i = 0; i < pasted.length; i++) next[i] = pasted[i] ?? '';
            setDigits(next);
            if (pasted.length === 6) {
              setLoading(true);
              settingsService.verifyPin(pasted).then(ok => {
                setLoading(false);
                if (ok) { onUnlock(); }
                else {
                  setShake(true);
                  setPinError('Incorrect PIN');
                  setTimeout(() => { setDigits(['', '', '', '', '', '']); setShake(false); }, 500);
                }
              });
            }
          }}
          className="absolute opacity-0 w-0 h-0"
        />
      )}

          <AnimatePresence mode="wait">
            {/* ── PIN Mode (iPhone style) ── */}
            {mode === 'pin' && hasPin && (
              <motion.div
                key="pin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center space-y-7"
              >
                {/* Logo */}
                <div className="flex justify-center">
                  <Logo size={28} />
                </div>

                {/* Title */}
                <p className="text-lg font-medium text-gray-800 tracking-wide">Enter Passcode</p>

                {/* 6 Dots */}
                <motion.div
                  className="flex justify-center gap-4"
                  animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  {digits.map((d, i) => (
                    <motion.div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full border-2 border-gray-800 transition-all duration-150 ${
                        d ? 'bg-gray-800' : 'bg-transparent'
                      }`}
                      animate={d ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.15 }}
                    />
                  ))}
                </motion.div>

                {/* Error */}
                {pinError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500 text-center"
                  >
                    {pinError}
                  </motion.p>
                )}

                {/* Number Keypad - iPhone style circular buttons */}
                <div className="grid grid-cols-3 gap-x-4 sm:gap-x-6 gap-y-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeypadPress(num)}
                      disabled={loading}
                      className="w-16 h-16 sm:w-[75px] sm:h-[75px] rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-all duration-100 disabled:opacity-50 select-none"
                    >
                      <span className="text-2xl sm:text-[28px] font-light text-gray-800 leading-none">{num}</span>
                    </button>
                  ))}
                  {/* Forgot PIN */}
                  <button
                    type="button"
                    onClick={() => { setMode('password'); setPwdError(''); setPassword(''); }}
                    className="w-16 h-16 sm:w-[75px] sm:h-[75px] rounded-full flex items-center justify-center select-none"
                  >
                    <span className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors font-medium">Forgot?</span>
                  </button>
                  {/* 0 */}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress(0)}
                    disabled={loading}
                    className="w-16 h-16 sm:w-[75px] sm:h-[75px] rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-all duration-100 disabled:opacity-50 select-none"
                  >
                    <span className="text-2xl sm:text-[28px] font-light text-gray-800 leading-none">0</span>
                  </button>
                  {/* Delete */}
                  <button
                    type="button"
                    onClick={handleBackspace}
                    disabled={loading || digits.every(d => d === '')}
                    className="w-16 h-16 sm:w-[75px] sm:h-[75px] rounded-full flex items-center justify-center select-none disabled:opacity-30"
                  >
                    <svg className="w-7 h-7 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.21-.211.497-.33.795-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.795-.33z" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Password Mode ── */}
            {(mode === 'password' || !hasPin) && (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-xs mx-auto"
              >
                {/* Logo */}
                <div className="flex justify-center mb-6">
                  <Logo size={28} />
                </div>

                <form onSubmit={handlePasswordUnlock} className="space-y-5">
                  <div className="text-center">
                    <p className="text-lg font-medium text-gray-800 tracking-wide">Enter Password</p>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </div>
                      <input
                        ref={pwdRef}
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); if (pwdError) setPwdError(''); }}
                        placeholder="Enter your password"
                        className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        autoComplete="current-password"
                        disabled={loading}
                      />
                    </div>
                    {pwdError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-red-500 text-center"
                      >
                        {pwdError}
                      </motion.p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !password.trim()}
                    className="w-full py-3.5 bg-primary hover:bg-primary-hover active:bg-primary text-white rounded-xl font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Verifying...
                      </>
                    ) : 'Unlock'}
                  </button>

                  {hasPin && (
                    <button
                      type="button"
                      onClick={() => { setMode('pin'); setDigits(['', '', '', '', '', '']); setPinError(''); }}
                      className="w-full text-center text-sm text-gray-400 hover:text-gray-600 font-medium py-1 transition-colors"
                    >
                      Back to PIN entry
                    </button>
                  )}
                </form>
              </motion.div>
            )}
          </AnimatePresence>
    </motion.div>
  );
}
