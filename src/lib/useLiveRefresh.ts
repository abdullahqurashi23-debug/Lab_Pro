import { useEffect, useRef } from 'react';

// Keeps a page's data current without the user having to navigate away
// and back: `reload` runs whenever the backend reports that stored data
// changed (a report saved or finalized, a payment recorded, a price edited…
// see MUTATING_CHANNEL in electron/main/index.ts), and whenever the app
// window regains focus. Bursts (e.g. auto-save plus finalize) are collapsed
// into one reload.
export function useLiveRefresh(reload: () => void, delayMs = 300): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => reloadRef.current(), delayMs);
    };
    const unsubscribe = window.api?.events?.onDataChanged(schedule);
    window.addEventListener('focus', schedule);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener('focus', schedule);
    };
  }, [delayMs]);
}
