import { useState, useEffect, useRef, useCallback } from 'react';

interface UseIdleLockOptions {
  /** Whether auto-lock is enabled */
  enabled: boolean;
  /** Idle timeout in minutes before locking */
  timeoutMinutes: number;
}

/**
 * Monitors user activity (mouse, keyboard, touch, click, scroll) and
 * triggers a lock state after the configured idle timeout.
 */
export function useIdleLock({ enabled, timeoutMinutes }: UseIdleLockOptions) {
  const [isLocked, setIsLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (!enabled || isLocked) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, timeoutMinutes * 60 * 1000);
  }, [enabled, timeoutMinutes, isLocked]);

  const unlock = useCallback(() => {
    setIsLocked(false);
    // timer will restart via the effect below
  }, []);

  const lock = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsLocked(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Auto-lock disabled — ensure unlocked & no timer
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsLocked(false);
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
