import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PublicUser } from '@/lib/types';
import type { LabSetupInput } from '@/vite-env';

type AuthPhase = 'checking' | 'needs-dev-setup' | 'needs-lab-setup' | 'locked' | 'must-change-password' | 'unlocked';

interface LoginOutcome {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  phase: AuthPhase;
  user: PublicUser | null;
  // Called by DeveloperSetup once its own dev:login call succeeds — moves
  // Stage 1 (developer login) to Stage 2 (the lab setup wizard).
  enterLabSetup: () => void;
  completeLabSetup: (input: LabSetupInput) => Promise<LoginOutcome>;
  login: (username: string, password: string) => Promise<LoginOutcome>;
  completePasswordChange: () => void;
  logout: (reason?: string) => void;
  refreshUser: () => Promise<void>;
  // Re-runs the same needsSetup/currentUser check the app does on launch —
  // needed after Reset Setup (Developer Panel), which can flip
  // setup_completed back to false while the app is still running. Without
  // this, the window would keep showing whatever phase it resolved to at
  // launch until the next full restart.
  refreshPhase: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('checking');
  const [user, setUser] = useState<PublicUser | null>(null);

  const refreshPhase = useCallback(async () => {
    // The main process holds the session in memory, so a fresh app launch
    // always starts logged out — this is a deliberate screen-lock-style
    // behavior, not a bug: every launch requires a real sign-in. A brand
    // new (or not-yet-fully-set-up) install takes priority over that: it
    // goes to the one-time Developer Setup screen instead of a login form
    // for an account that doesn't exist yet.
    try {
      const needsSetup = await api.auth.needsSetup();
      if (needsSetup) {
        setPhase('needs-dev-setup');
        return;
      }
      const current = await api.auth.currentUser();
      if (current) {
        setUser(current);
        setPhase('unlocked');
      } else {
        setPhase('locked');
      }
    } catch {
      setPhase('locked');
    }
  }, []);

  useEffect(() => {
    refreshPhase();
  }, [refreshPhase]);

  const enterLabSetup = useCallback(() => {
    setPhase('needs-lab-setup');
  }, []);

  const completeLabSetup = useCallback(async (input: LabSetupInput): Promise<LoginOutcome> => {
    const result = await api.dev.completeLabSetup(input);
    if (!result.ok || !result.user) {
      return { ok: false, error: result.error || 'Failed to finish setup.' };
    }
    // Hands off to the normal Login screen rather than signing the new
    // admin in automatically — the first thing that happens on this
    // install is a real login with the credentials just chosen.
    setPhase('locked');
    return { ok: true };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginOutcome> => {
    const result = await api.auth.login(username, password);
    if (!result.ok || !result.user) {
      return { ok: false, error: result.error || 'Invalid username or password.' };
    }
    setUser(result.user);
    setPhase(result.mustChangePassword ? 'must-change-password' : 'unlocked');
    return { ok: true };
  }, []);

  const completePasswordChange = useCallback(() => {
    setPhase('unlocked');
  }, []);

  const logout = useCallback((reason?: string) => {
    api.auth.logout(reason);
    setUser(null);
    setPhase('locked');
  }, []);

  // Lets the TopBar's displayed name update immediately after the current
  // user edits their own full name in Users — otherwise it would keep
  // showing the stale name (held in this context's state) until the next
  // login, even though the database and Users list are already correct.
  const refreshUser = useCallback(async () => {
    const current = await api.auth.currentUser();
    if (current) setUser(current);
  }, []);

  const value: AuthContextValue = {
    phase,
    user,
    enterLabSetup,
    completeLabSetup,
    login,
    completePasswordChange,
    logout,
    refreshUser,
    refreshPhase,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
