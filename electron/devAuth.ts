import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import { DEV_USERNAME_HASH, DEV_PASSWORD_HASH } from './devConfig';
import { getSetting, setSetting } from '../src/db/repositories/settings';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
const FAIL_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DevLoginResult {
  ok: boolean;
  error?: string;
  lockedUntil?: number;
}

// The fail count and lockout deadline live in the `settings` table, not a
// module-level variable — restarting the app must not be a way to reset a
// lockout, or the 60-second lock would only ever slow down someone who
// doesn't know they can just relaunch.
function getFailState(db: Database.Database): { count: number; lockedUntil: number } {
  return {
    count: Number(getSetting(db, 'dev_login_fail_count') || '0'),
    lockedUntil: Number(getSetting(db, 'dev_lockout_until') || '0'),
  };
}

export function getDevLockoutStatus(db: Database.Database): { lockedUntil: number | null } {
  const { lockedUntil } = getFailState(db);
  return { lockedUntil: lockedUntil > Date.now() ? lockedUntil : null };
}

export async function attemptDevLogin(db: Database.Database, rawUsername: string, rawPassword: string): Promise<DevLoginResult> {
  const { count, lockedUntil } = getFailState(db);
  if (lockedUntil > Date.now()) {
    return { ok: false, error: 'Too many attempts. Try again later.', lockedUntil };
  }

  const username = String(rawUsername ?? '').trim().toLowerCase();
  const password = String(rawPassword ?? '');
  // Both checks always run and share one generic error message below —
  // a real difference in behavior between "wrong username" and "wrong
  // password" (timing, wording, which field is blamed) is exactly the kind
  // of hint this screen must never give.
  const usernameOk = bcrypt.compareSync(username, DEV_USERNAME_HASH);
  const passwordOk = bcrypt.compareSync(password, DEV_PASSWORD_HASH);

  if (usernameOk && passwordOk) {
    setSetting(db, 'dev_login_fail_count', '0');
    setSetting(db, 'dev_lockout_until', '0');
    return { ok: true };
  }

  await sleep(FAIL_DELAY_MS);

  const nextCount = count + 1;
  let newLockedUntil: number | undefined;
  if (nextCount >= MAX_ATTEMPTS) {
    newLockedUntil = Date.now() + LOCKOUT_MS;
    setSetting(db, 'dev_lockout_until', String(newLockedUntil));
    setSetting(db, 'dev_login_fail_count', '0');
  } else {
    setSetting(db, 'dev_login_fail_count', String(nextCount));
  }
  return { ok: false, error: 'Invalid developer credentials', lockedUntil: newLockedUntil };
}
