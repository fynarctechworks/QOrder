import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { settingsService } from '../services/settingsService';
import Logo from './Logo';

interface LockScreenProps {
  hasPin: boolean;
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [pinError, setPinError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTimeout(() => pinRefs.current[0]?.focus(), 100);
  }, []);

  const handlePinChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setPinError('');

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
      onClick={() => pinRefs.current[0]?.focus()}
    >
      {/* Hidden input for keyboard & paste support */}
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

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center space-y-7"
      >
        <div className="flex justify-center">
          <Logo size={28} />
        </div>

        <p className="text-lg font-medium text-gray-800 tracking-wide">Enter Passcode</p>

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

        {pinError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-red-500 text-center"
          >
            {pinError}
          </motion.p>
        )}

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
          {/* empty bottom-left cell */}
          <div className="w-16 h-16 sm:w-[75px] sm:h-[75px]" />
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
    </motion.div>
  );
}
