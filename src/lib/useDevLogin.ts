import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Shared between DeveloperSetup (Stage 1, full-screen, first launch only)
// and DeveloperAccessDialog (the later Ctrl+Shift+Alt+D support-access
// modal on the Login screen) — both are the exact same credential check
// against the exact same lockout state, just presented in different shells.
export function useDevLogin(onSuccess: () => void) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    api.dev.lockoutStatus().then((s) => setLockedUntil(s.lockedUntil));
  }, []);

  useEffect(() => {
    if (!lockedUntil) {
      setRemainingSeconds(0);
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0) setLockedUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setChecking(true);
    try {
      const result = await api.dev.login(username, password);
      if (result.ok) {
        setUsername('');
        setPassword('');
        onSuccess();
      } else {
        setError(result.error || 'Invalid developer credentials');
        setPassword('');
        if (result.lockedUntil) setLockedUntil(result.lockedUntil);
      }
    } finally {
      setChecking(false);
    }
  };

  return {
    username,
    setUsername,
    password,
    setPassword,
    error,
    checking,
    locked: remainingSeconds > 0,
    remainingSeconds,
    submit,
  };
}
