import type Database from 'better-sqlite3';
import { createUser } from './users';
import { updateClinicSettings } from './clinicSettings';
import { getSetting, setSetting } from './settings';
import { recordAudit } from './auditLog';
import type { PublicUser } from './types';

export interface LabSetupInput {
  clinic: {
    clinic_name: string;
    address: string;
    phone: string;
    pathologist_name: string;
    report_number_prefix: string;
    report_archive_folder: string;
  };
  admin: {
    full_name: string;
    username: string;
    password_hash: string;
  };
}

export function isSetupCompleted(db: Database.Database): boolean {
  return getSetting(db, 'setup_completed') === 'true';
}

// Everything "Finish Setup" does, as one atomic unit — if anything fails
// (a duplicate username, a bad value), nothing is left half-done: no
// orphaned admin account with no clinic settings, no setup_completed flag
// set without a real admin account behind it.
export function completeLabSetup(db: Database.Database, input: LabSetupInput): PublicUser {
  const txn = db.transaction((): PublicUser => {
    const admin = createUser(db, {
      username: input.admin.username,
      password_hash: input.admin.password_hash,
      full_name: input.admin.full_name,
      role: 'ADMIN',
    });
    updateClinicSettings(db, input.clinic);
    setSetting(db, 'setup_completed', 'true');
    setSetting(db, 'setup_completed_at', new Date().toISOString());
    recordAudit(db, {
      user_id: admin.id,
      action: 'SETUP_COMPLETED',
      entity: 'system',
      entity_id: null,
      details: { username: admin.username },
    });
    return admin;
  });
  return txn();
}

// Defaults mirror the schema's own DEFAULT values (migrations/001_init.sql,
// 006_settings_extras.sql) — resetting puts the wizard back to a genuinely
// blank slate, not an arbitrary one.
const BLANK_CLINIC_SETTINGS = {
  clinic_name: 'LabCore Diagnostic Laboratory',
  address: '',
  phone: '',
  pathologist_name: '',
  report_number_prefix: 'LAB',
  report_archive_folder: '',
};

// Deliberately never DELETEs a user row: reports.created_by/finalized_by
// and payments.recorded_by are FOREIGN KEY REFERENCES users(id) with no ON
// DELETE clause, so with `foreign_keys = ON` a real delete would either be
// blocked outright (once any report/payment exists) or, if it weren't,
// silently orphan historical attribution. Deactivating every account (same
// mechanism as the Users page's own "Deactivate" button) achieves the same
// practical outcome — nobody can log in with the old accounts — without
// touching a single row of patient/report/result data, matching this
// app's existing "accounts are deactivated, never deleted" rule.
export function resetSetup(db: Database.Database): void {
  const txn = db.transaction(() => {
    db.prepare('UPDATE users SET is_active = 0').run();
    updateClinicSettings(db, BLANK_CLINIC_SETTINGS);
    setSetting(db, 'setup_completed', 'false');
    setSetting(db, 'setup_completed_at', '');
    recordAudit(db, { user_id: null, action: 'DEV_RESET_SETUP', entity: 'system', entity_id: null });
  });
  txn();
}
