import { useState, useEffect, useRef, useCallback } from 'react';

const SESSION_KEY = 'app:locked';

interface UseIdleLockOptions {
  /** Whether auto-lock is enabled */
  enabled: boolean;
  /** Idle timeout in minutes before locking */
  timeoutMinutes: number;
}

/**
 * Monitors user activity (mouse, keyboard, touch, click, scroll) and
 * triggers a lock state after the configured idle timeout.
 *
 * The locked state is persisted in sessionStorage so a page refresh
 * keeps the screen locked until the user enters their PIN/password.
 */
export function useIdleLock({ enabled, timeoutMinutes }: UseIdleLockOptions) {
  const [isLocked, setIsLockedState] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setIsLocked = useCallback((val: boolean) => {
    try {
      if (val) {
        sessionStorage.setItem(SESSION_KEY, '1');
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch { /* ignore */ }
    setIsLockedState(val);
  }, []);

  const resetTimer = useCallback(() => {
    if (!enabled || isLocked) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, timeoutMinutes * 60 * 1000);
  }, [enabled, timeoutMinutes, isLocked, setIsLocked]);

  const unlock = useCallback(() => {
    setIsLocked(false);
    // timer will restart via the effect below
  }, [setIsLocked]);

  const lock = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsLocked(true);
  }, [setIsLocked]);

  useEffect(() => {
    // When auto-lock is disabled, only stop the idle timer.
    // Do NOT force-unlock — manual lock via lock() must still work.
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (isLocked) {
      // While locked, don't listen for activity
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];

    const handleActivity = () => resetTimer();

    // Start the initial timer
    resetTimer();

    // Attach listeners
    ACTIVITY_EVENTS.forEach((evt) =>
      document.addEventListener(evt, handleActivity, { passive: true })
    );

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) =>
        document.removeEventListener(evt, handleActivity)
      );
    };
  }, [enabled, isLocked, resetTimer]);

  return { isLocked, unlock, lock };
}
