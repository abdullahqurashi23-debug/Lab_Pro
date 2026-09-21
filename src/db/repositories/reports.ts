import type Database from 'better-sqlite3';
import { computeParameterResults, type ComputedResult } from '../resultLogic';
import { createPatient, isChildPatient, updatePatient } from './patients';
import { getTestById } from './tests';
import { recordAudit } from './auditLog';
import { listPaymentsForReport } from './payments';
import type {
  Gender,
  NewReportInput,
  Report,
  ReportListFilters,
  ReportListRow,
  ReportResult,
  ReportSortKey,
  ReportsPageFilters,
  ReportsPageResult,
  ReportTest,
  ReportWithDetails,
} from './types';

function generateReportNo(db: Database.Database): string {
  const year = new Date().getFullYear();
  const prefixRow = db.prepare('SELECT report_number_prefix FROM clinic_settings WHERE id = 1').get() as
    | { report_number_prefix: string }
    | undefined;
  const prefix = prefixRow?.report_number_prefix?.trim() || 'LAB';
  const row = db
    .prepare('SELECT COUNT(*) as n FROM reports WHERE report_no LIKE ?')
    .get(`${prefix}-${year}-%`) as { n: number };
  const next = (row.n || 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(6, '0')}`;
}

function insertResultRow(db: Database.Database, reportTestId: number, r: ComputedResult) {
  db.prepare(
    `INSERT INTO report_results
       (report_test_id, parameter_id, parameter_name_snapshot, unit_snapshot, ref_range_snapshot, value, flag)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(reportTestId, r.parameter_id, r.parameter_name_snapshot, r.unit_snapshot, r.ref_range_snapshot, r.value, r.flag);
}

function writeReportTests(db: Database.Database, reportId: number, input: NewReportInput, isChild: boolean, gender: Gender | null): number {
  // The New Report UI already refuses to add a test that's already
  // selected, but that's a UI-only safeguard — nothing stopped a direct
  // IPC call (or a future UI bug) from submitting the same test_id twice,
  // silently double-charging its price into the subtotal and creating two
  // report_tests rows with the same React key wherever the report is later
  // rendered (e.g. ResultEntryCard keys by test.id).
  const seenTestIds = new Set<number>();
  for (const item of input.tests) {
    if (seenTestIds.has(item.test_id)) {
      throw new Error(`Test #${item.test_id} was submitted more than once for the same report.`);
    }
    seenTestIds.add(item.test_id);
  }

  const insertReportTest = db.prepare(
    'INSERT INTO report_tests (report_id, test_id, test_name_snapshot, short_code_snapshot, price_snapshot) VALUES (?, ?, ?, ?, ?)'
  );
  let subtotal = 0;
  for (const item of input.tests) {
    const test = getTestById(db, item.test_id);
    if (!test) throw new Error(`Test #${item.test_id} not found.`);
    const info = insertReportTest.run(reportId, test.id, test.name, test.short_code, test.price);
    const reportTestId = info.lastInsertRowid as number;
    subtotal += test.price;
    const results = computeParameterResults(test.parameters, item.results, isChild, gender);
    for (const r of results) insertResultRow(db, reportTestId, r);
  }
  return subtotal;
}

export function createReport(db: Database.Database, input: NewReportInput, createdByUserId: number | null): ReportWithDetails {
  const txn = db.transaction(() => {
    // An existing patient pulled in via search can still be edited (fixing
    // a typo'd name, a wrong age, etc.) before this very first save — that
    // edit has to actually apply here via updatePatient, not just re-fetch
    // the patient unchanged, or it would silently vanish on first save and
    // only start sticking from the second save onward (updateDraftReport
    // already applies edits correctly; this keeps both paths consistent).
    const patient = input.patient.id
      ? updatePatient(db, input.patient.id, {
          full_name: input.patient.full_name,
          age: input.patient.age,
          age_unit: input.patient.age_unit,
          gender: input.patient.gender,
          phone: input.patient.phone,
          address: input.patient.address,
        })
      : createPatient(db, {
          full_name: input.patient.full_name,
          age: input.patient.age,
          age_unit: input.patient.age_unit,
          gender: input.patient.gender,
          phone: input.patient.phone,
          address: input.patient.address,
        });
    if (!patient) throw new Error('Patient not found.');

    const isChild = isChildPatient(patient);
    const reportNo = generateReportNo(db);
    const rawDiscount = input.discount || 0;
    const paid = input.paid || 0;

    const reportInfo = db
      .prepare(
        `INSERT INTO reports (report_no, patient_id, doctor_id, discount, paid, payment_method, notes, performed_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reportNo,
        patient.id,
        input.doctor_id || null,
        rawDiscount,
        paid,
        input.payment_method || '',
        input.notes || '',
        input.performed_by || '',
        createdByUserId
      );
    const reportId = reportInfo.lastInsertRowid as number;

    const subtotal = writeReportTests(db, reportId, input, isChild, patient.gender);
    // Clamped against the now-known subtotal — a discount can't exceed what
    // there was to discount in the first place. Without this, a discount
    // larger than the subtotal (bad client data, or a report edited down
    // to fewer/cheaper tests after the discount was set) would leave the
    // stored `discount` figure larger than `subtotal`, so `subtotal -
    // discount` would go negative even though `total` itself is correctly
    // floored at 0 below — breaking the "Gross - Discount = Net" identity
    // anywhere `discount` is reported on its own (e.g. revenue's "total
    // discounts given").
    const discount = Math.min(subtotal, rawDiscount);
    const total = Math.max(0, subtotal - discount);
    // Clamped at 0 rather than left negative on overpayment (paid > total)
    // — the amount actually collected stays in `paid` exactly as entered,
    // this only affects what's shown/stored as still owed.
    const balance = Math.max(0, total - paid);

    db.prepare('UPDATE reports SET discount = ?, subtotal = ?, total = ?, balance = ? WHERE id = ?').run(
      discount,
      subtotal,
      total,
      balance,
      reportId
    );

    return reportId;
  });

  const reportId = txn();
  return getReportById(db, reportId) as ReportWithDetails;
}

export function updateDraftReport(db: Database.Database, reportId: number, input: NewReportInput): ReportWithDetails {
  const existing = db.prepare('SELECT status, patient_id FROM reports WHERE id = ?').get(reportId) as
    | { status: string; patient_id: number }
    | undefined;
  if (!existing) throw new Error('Report not found.');
  if (existing.status === 'FINALIZED') throw new Error('This report is finalized and cannot be edited.');

  const txn = db.transaction(() => {
    // Patient details (name/age/gender/contact) can still be corrected
    // while the report is a draft — the auto-save on the New Report page
    // relies on this to persist fixes, not just tests and billing.
    const patient = updatePatient(db, existing.patient_id, {
      full_name: input.patient.full_name,
      age: input.patient.age,
      age_unit: input.patient.age_unit,
      gender: input.patient.gender,
      phone: input.patient.phone,
      address: input.patient.address,
    });
    const isChild = isChildPatient(patient);

    const oldReportTestIds = (
      db.prepare('SELECT id FROM report_tests WHERE report_id = ?').all(reportId) as { id: number }[]
    ).map((r) => r.id);
    for (const id of oldReportTestIds) {
      db.prepare('DELETE FROM report_results WHERE report_test_id = ?').run(id);
    }
    db.prepare('DELETE FROM report_tests WHERE report_id = ?').run(reportId);

    const subtotal = writeReportTests(db, reportId, input, isChild, patient.gender);
    // Same clamp as createReport — see the comment there for why a
    // discount can never be allowed to exceed the subtotal it applies to.
    const discount = Math.min(subtotal, input.discount || 0);
    const paid = input.paid || 0;
    const total = Math.max(0, subtotal - discount);
    const balance = Math.max(0, total - paid);

    db.prepare(
      'UPDATE reports SET doctor_id = ?, subtotal = ?, discount = ?, total = ?, paid = ?, balance = ?, payment_method = ?, notes = ?, performed_by = ? WHERE id = ?'
    ).run(
      input.doctor_id || null,
      subtotal,
      discount,
      total,
      paid,
      balance,
      input.payment_method || '',
      input.notes || '',
      input.performed_by || '',
      reportId
    );
  });
  txn();

  return getReportById(db, reportId) as ReportWithDetails;
}

// Every parameter recorded on this report must have either a real value or
// the explicit "Not Done" marker — a blank left by mistake must block
// finalization, since there's no way to fix it afterward once locked.
export function assertResultsComplete(db: Database.Database, reportId: number): void {
  const missing = db
    .prepare(
      `SELECT rt.test_name_snapshot as test_name, rr.parameter_name_snapshot as parameter_name
       FROM report_results rr
       JOIN report_tests rt ON rt.id = rr.report_test_id
       WHERE rt.report_id = ? AND (rr.value IS NULL OR TRIM(rr.value) = '')
       ORDER BY rr.id`
    )
    .all(reportId) as { test_name: string; parameter_name: string }[];
  if (missing.length === 0) return;

  const shown = missing.slice(0, 6).map((m) => `${m.test_name} → ${m.parameter_name}`);
  const more = missing.length > 6 ? `, and ${missing.length - 6} more` : '';
  throw new Error(
    `Cannot finalize: missing results for ${shown.join(', ')}${more}. Enter a value or mark "Not Done" for each parameter.`
  );
}

// Locks the report permanently. Deliberately does status+finalized_by/at+
// the audit log entry all inside ONE transaction — a finalize that
// half-completes (e.g. the process dies between the status flip and the
// audit write) would leave a locked report with no record of who locked it
// or when, which defeats the point of an audit trail.
export function finalizeReport(db: Database.Database, reportId: number, finalizedByUserId: number | null): ReportWithDetails {
  const existing = db.prepare('SELECT status, report_no FROM reports WHERE id = ?').get(reportId) as
    | { status: string; report_no: string }
    | undefined;
  if (!existing) throw new Error('Report not found.');
  if (existing.status === 'FINALIZED') throw new Error('This report is already finalized.');

  assertResultsComplete(db, reportId);

  const txn = db.transaction(() => {
    db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_by = ?, finalized_at = datetime('now') WHERE id = ?").run(
      finalizedByUserId,
      reportId
    );
    recordAudit(db, {
      user_id: finalizedByUserId,
      action: 'FINALIZE',
      entity: 'report',
      entity_id: reportId,
      details: { report_no: existing.report_no },
    });
  });
  txn();

  return getReportById(db, reportId) as ReportWithDetails;
}

// Attaches the archived PDF's location + hash to an already-finalized
// report. This is its own narrow UPDATE (not part of the finalize
// transaction above) because generating the PDF is asynchronous — it
// renders through a hidden BrowserWindow — and better-sqlite3 transactions
// must be synchronous. The 004 migration's refined trigger allows exactly
// this one kind of update (pdf_path/pdf_sha256 only) on a finalized row.
export function setReportPdfInfo(db: Database.Database, reportId: number, pdfPath: string, sha256: string): void {
  db.prepare('UPDATE reports SET pdf_path = ?, pdf_sha256 = ? WHERE id = ?').run(pdfPath, sha256, reportId);
}

// Used by the Settings > Verify Report tool: given a hash computed from a
// PDF file the user picked, find the finalized report it was originally
// generated for (if any).
export function findReportByPdfHash(
  db: Database.Database,
  sha256: string
): { report_no: string; patient_name: string; finalized_at: string | null } | undefined {
  return db
    .prepare(
      `SELECT reports.report_no, reports.finalized_at, patients.full_name as patient_name
       FROM reports
       JOIN patients ON patients.id = reports.patient_id
       WHERE reports.pdf_sha256 = ? AND reports.pdf_sha256 != ''`
    )
    .get(sha256) as { report_no: string; patient_name: string; finalized_at: string | null } | undefined;
}

export function deleteDraftReport(db: Database.Database, reportId: number): { deleted: boolean } {
  const report = db.prepare('SELECT status FROM reports WHERE id = ?').get(reportId) as { status: string } | undefined;
  if (!report) return { deleted: false };
  if (report.status === 'FINALIZED') throw new Error('This report is finalized and cannot be deleted.');

  const txn = db.transaction(() => {
    const reportTestIds = (
      db.prepare('SELECT id FROM report_tests WHERE report_id = ?').all(reportId) as { id: number }[]
    ).map((r) => r.id);
    for (const id of reportTestIds) {
      db.prepare('DELETE FROM report_results WHERE report_test_id = ?').run(id);
    }
    db.prepare('DELETE FROM report_tests WHERE report_id = ?').run(reportId);
    db.prepare('DELETE FROM reports WHERE id = ?').run(reportId);
  });
  txn();
  return { deleted: true };
}

export function getReportById(db: Database.Database, id: number): ReportWithDetails | null {
  const report = db
    .prepare(
      `SELECT reports.*, patients.full_name as patient_name, patients.patient_code, patients.age,
              patients.age_unit, patients.gender, doctors.name as doctor_name,
              finalizer.full_name as finalized_by_name
       FROM reports
       JOIN patients ON patients.id = reports.patient_id
       LEFT JOIN doctors ON doctors.id = reports.doctor_id
       LEFT JOIN users as finalizer ON finalizer.id = reports.finalized_by
       WHERE reports.id = ?`
    )
    .get(id) as
    | (Report & {
        patient_name: string;
        patient_code: string;
        age: number | null;
        age_unit: string;
        gender: Gender | null;
        doctor_name: string | null;
        finalized_by_name: string | null;
      })
    | undefined;
  if (!report) return null;

  const reportTests = db
    .prepare('SELECT * FROM report_tests WHERE report_id = ? ORDER BY id')
    .all(id) as Omit<ReportTest, 'results'>[];

  const tests: ReportTest[] = reportTests.map((rt) => ({
    ...rt,
    results: db
      .prepare('SELECT * FROM report_results WHERE report_test_id = ? ORDER BY id')
      .all(rt.id) as ReportResult[],
  }));

  const payments = listPaymentsForReport(db, id);
  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  // Clamped at 0, same reasoning as `balance` above — an overpayment (or a
  // correction entry that overshoots) should read as "fully paid," not a
  // negative amount owed. The payments ledger itself is left untouched;
  // this only affects the derived figure shown to the user.
  const outstandingBalance = Math.max(0, report.balance - paymentsTotal);

  return {
    ...report,
    age_unit: report.age_unit as ReportWithDetails['age_unit'],
    tests,
    payments,
    outstanding_balance: outstandingBalance,
  };
}

export function listReports(db: Database.Database, filters: ReportListFilters = {}): ReportListRow[] {
  const { from, to, status, patient_id } = filters;
  let query = `
    SELECT reports.*, patients.full_name as patient_name, patients.patient_code, patients.phone as patient_phone, doctors.name as doctor_name,
      COALESCE((SELECT GROUP_CONCAT(rt.test_name_snapshot) FROM report_tests rt WHERE rt.report_id = reports.id), '') as test_names
    FROM reports
    JOIN patients ON patients.id = reports.patient_id
    LEFT JOIN doctors ON doctors.id = reports.doctor_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (from) {
    query += ' AND reports.created_at >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND reports.created_at <= ?';
    params.push(to);
  }
  if (status) {
    query += ' AND reports.status = ?';
    params.push(status);
  }
  if (patient_id) {
    query += ' AND reports.patient_id = ?';
    params.push(patient_id);
  }
  query += ' ORDER BY reports.created_at DESC';
  return db.prepare(query).all(...params) as ReportListRow[];
}

export function searchReports(db: Database.Database, query: string): ReportListRow[] {
  if (!query.trim()) return [];
  const q = `%${query.trim()}%`;
  return db
    .prepare(
      `SELECT reports.*, patients.full_name as patient_name, patients.patient_code, patients.phone as patient_phone, doctors.name as doctor_name
       FROM reports
       JOIN patients ON patients.id = reports.patient_id
       LEFT JOIN doctors ON doctors.id = reports.doctor_id
       WHERE reports.report_no LIKE ? OR patients.full_name LIKE ?
       ORDER BY reports.created_at DESC
       LIMIT 8`
    )
    .all(q, q) as ReportListRow[];
}

// Column names are interpolated directly into SQL below, so this whitelist
// (rather than trusting the client-supplied sort key string) is what keeps
// that safe — every value here is a fixed, hardcoded column reference, never
// derived from user input.
const REPORT_SORT_COLUMNS: Record<ReportSortKey, string> = {
  report_no: 'reports.report_no',
  patient_name: 'patients.full_name',
  doctor_name: 'doctors.name',
  created_at: 'reports.created_at',
  total: 'reports.total',
  balance: 'reports.balance',
  status: 'reports.status',
};

// The searchable, sortable, paginated Reports History table. `search`
// matches report number, patient name, patient phone, OR any test name
// that appears on the report (via EXISTS, so a report with multiple
// matching tests still comes back as exactly one row).
export function listReportsPage(db: Database.Database, filters: ReportsPageFilters = {}): ReportsPageResult {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 25));
  const sortColumn = REPORT_SORT_COLUMNS[filters.sortKey ?? 'created_at'] ?? REPORT_SORT_COLUMNS.created_at;
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';

  const whereClauses: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    whereClauses.push(
      `(reports.report_no LIKE ? OR patients.full_name LIKE ? OR patients.phone LIKE ? OR EXISTS (
         SELECT 1 FROM report_tests rt WHERE rt.report_id = reports.id AND rt.test_name_snapshot LIKE ?
       ))`
    );
    params.push(q, q, q, q);
  }
  if (filters.from) {
    whereClauses.push('reports.created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    whereClauses.push('reports.created_at <= ?');
    params.push(filters.to);
  }
  if (filters.status) {
    whereClauses.push('reports.status = ?');
    params.push(filters.status);
  }
  if (filters.doctor_id) {
    whereClauses.push('reports.doctor_id = ?');
    params.push(filters.doctor_id);
  }
  if (filters.patient_id) {
    whereClauses.push('reports.patient_id = ?');
    params.push(filters.patient_id);
  }

  const fromAndWhere = `
    FROM reports
    JOIN patients ON patients.id = reports.patient_id
    LEFT JOIN doctors ON doctors.id = reports.doctor_id
    WHERE ${whereClauses.join(' AND ')}
  `;

  const total = (db.prepare(`SELECT COUNT(*) as n ${fromAndWhere}`).get(...params) as { n: number }).n;

  const rows = db
    .prepare(
      `SELECT reports.*, patients.full_name as patient_name, patients.patient_code, patients.phone as patient_phone, doctors.name as doctor_name
       ${fromAndWhere}
       ORDER BY ${sortColumn} ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize) as ReportListRow[];

  return { rows, total };
}
