import type Database from 'better-sqlite3';
import type { Payment } from './types';

export interface NewPaymentInput {
  amount: number;
  method?: string;
  notes?: string;
}

export function getPaymentById(db: Database.Database, id: number): Payment | undefined {
  return db
    .prepare(
      `SELECT payments.*, users.full_name as recorded_by_name
       FROM payments
       LEFT JOIN users ON users.id = payments.recorded_by
       WHERE payments.id = ?`
    )
    .get(id) as Payment | undefined;
}

// Deliberately append-only — no update/delete. A correction is recorded as
// a new (possibly negative) entry rather than editing history, the same
// immutability philosophy as the reports table itself, just without needing
// a database trigger to enforce it (there's simply no code path that edits
// a payment once inserted).
export function recordPayment(
  db: Database.Database,
  reportId: number,
  input: NewPaymentInput,
  recordedByUserId: number | null
): Payment {
  const report = db.prepare('SELECT id FROM reports WHERE id = ?').get(reportId);
  if (!report) throw new Error('Report not found.');

  const info = db
    .prepare('INSERT INTO payments (report_id, amount, method, notes, recorded_by) VALUES (?, ?, ?, ?, ?)')
    .run(reportId, input.amount, input.method || '', input.notes || '', recordedByUserId);
  return getPaymentById(db, info.lastInsertRowid as number) as Payment;
}

export function listPaymentsForReport(db: Database.Database, reportId: number): Payment[] {
  return db
    .prepare(
      `SELECT payments.*, users.full_name as recorded_by_name
       FROM payments
       LEFT JOIN users ON users.id = payments.recorded_by
       WHERE payments.report_id = ?
       ORDER BY payments.created_at ASC`
    )
    .all(reportId) as Payment[];
}

export function getPaymentsTotalForReport(db: Database.Database, reportId: number): number {
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE report_id = ?').get(reportId) as {
    total: number;
  };
  return row.total || 0;
}
