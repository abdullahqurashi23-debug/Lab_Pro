import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];

/**
 * Calls `onIdle` after `timeoutMinutes` of no mouse/keyboard/touch activity.
 * Pass a non-positive `timeoutMinutes` to disable the timer entirely (used
 * when the admin sets auto-lock to "off").
 */
export function useIdleTimer(timeoutMinutes: number, onIdle: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    reset();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [timeoutMinutes]);
}
