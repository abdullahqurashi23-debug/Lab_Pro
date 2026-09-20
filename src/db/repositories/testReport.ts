import type Database from 'better-sqlite3';
import { resolvePeriod } from './revenue';
import type { TestReportFilters, TestReportResult, TestReportRow } from './types';

// A printable register of every finalized report in a day/week/month —
// one row per report (not per individual test line, since discount is a
// report-level field, not allocated per test), test names joined into one
// column. Same FINALIZED-only, date(created_at)-based filtering as Revenue
// (see revenue.ts's countAndRevenue) so the two reports always agree on
// what happened in "today"/"this week"/"this month".
export function getTestReportForPeriod(db: Database.Database, filters: TestReportFilters): TestReportResult {
  const { from, to } = resolvePeriod(db, filters);

  const rows = db
    .prepare(
      `SELECT
         reports.id as report_id,
         reports.report_no,
         patients.full_name as patient_name,
         COALESCE(GROUP_CONCAT(DISTINCT report_tests.test_name_snapshot), '') as test_names,
         doctors.name as doctor_name,
         reports.subtotal,
         reports.discount,
         reports.total
       FROM reports
       JOIN patients ON patients.id = reports.patient_id
       LEFT JOIN doctors ON doctors.id = reports.doctor_id
       LEFT JOIN report_tests ON report_tests.report_id = reports.id
       WHERE reports.status = 'FINALIZED'
         AND date(reports.created_at) >= date(?)
         AND date(reports.created_at) <= date(?)
       GROUP BY reports.id
       ORDER BY reports.created_at ASC`
    )
    .all(from, to) as TestReportRow[];

  const totals = rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + r.subtotal,
      discount: acc.discount + r.discount,
      total: acc.total + r.total,
    }),
    { subtotal: 0, discount: 0, total: 0 }
  );

  return { from, to, rows, totals };
}
