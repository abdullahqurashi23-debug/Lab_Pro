import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PublicUser } from '@/lib/types';

type AuthPhase = 'checking' | 'needs-setup' | 'locked' | 'must-change-password' | 'unlocked';

interface LoginOutcome {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  phase: AuthPhase;
  user: PublicUser | null;
  createFirstAdmin: (username: string, password: string) => Promise<LoginOutcome>;
  login: (username: string, password: string) => Promise<LoginOutcome>;
  completePasswordChange: () => void;
  logout: (reason?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('checking');
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    // The main process holds the session in memory, so a fresh app launch
    // always starts logged out — this is a deliberate screen-lock-style
    // behavior, not a bug: every launch requires a real sign-in. A brand
    // new install with no admin account yet takes priority over that: it
    // goes to the one-time setup screen instead of a login form for an
    // account that doesn't exist.
    api.auth
      .needsSetup()
      .then((needsSetup) => {
        if (needsSetup) {
          setPhase('needs-setup');
          return;
        }
        return api.auth.currentUser().then((current) => {
          if (current) {
            setUser(current);
            setPhase('unlocked');
          } else {
            setPhase('locked');
          }
        });
      })
      .catch(() => setPhase('locked'));
  }, []);

  const createFirstAdmin = useCallback(async (username: string, password: string): Promise<LoginOutcome> => {
    const result = await api.auth.createFirstAdmin(username, password);
    if (!result.ok || !result.user) {
      return { ok: false, error: result.error || 'Failed to create the admin account.' };
    }
    setUser(result.user);
    setPhase(result.mustChangePassword ? 'must-change-password' : 'unlocked');
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

  const value: AuthContextValue = { phase, user, createFirstAdmin, login, completePasswordChange, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
