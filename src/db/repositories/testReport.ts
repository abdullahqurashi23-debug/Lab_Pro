import type Database from 'better-sqlite3';
import { resolvePeriod } from './revenue';
import type { SaleReportLine, TestReportFilters, TestReportResult, TestReportRow } from './types';

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
         COALESCE(GROUP_CONCAT(DISTINCT report_tests.short_code_snapshot), '') as test_codes,
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

  const lines = getSaleLines(db, from, to);
  const lineTotals = lines.reduce(
    (acc, l) => ({
      fee: acc.fee + l.fee,
      discount: acc.discount + l.discount,
      advance: acc.advance + l.advance,
      remaining: acc.remaining + l.remaining,
    }),
    { fee: 0, discount: 0, advance: 0, remaining: 0 }
  );

  return { from, to, rows, totals, lines, lineTotals };
}

// One line per test (the printed "Sale Report" layout). Discount, amount
// paid and balance are stored per report, so each report's amounts are
// split across its tests in proportion to price. Every share is rounded
// and the report's last test takes the rounding remainder, so the lines
// always add up exactly to the report's own figures.
function getSaleLines(db: Database.Database, from: string, to: string): SaleReportLine[] {
  const tests = db
    .prepare(
      `SELECT
         reports.id as report_id,
         reports.report_no,
         reports.created_at,
         patients.full_name as patient_name,
         report_tests.test_name_snapshot as test_name,
         report_tests.price_snapshot as fee,
         reports.subtotal,
         reports.discount,
         reports.paid,
         reports.balance
       FROM reports
       JOIN patients ON patients.id = reports.patient_id
       JOIN report_tests ON report_tests.report_id = reports.id
       WHERE reports.status = 'FINALIZED'
         AND date(reports.created_at) >= date(?)
         AND date(reports.created_at) <= date(?)
       ORDER BY reports.created_at ASC, reports.id ASC, report_tests.id ASC`
    )
    .all(from, to) as Array<{
    report_id: number;
    report_no: string;
    created_at: string;
    patient_name: string;
    test_name: string;
    fee: number;
    subtotal: number;
    discount: number;
    paid: number;
    balance: number;
  }>;

  const lines: SaleReportLine[] = [];
  let i = 0;
  while (i < tests.length) {
    const group = [];
    const id = tests[i].report_id;
    while (i < tests.length && tests[i].report_id === id) group.push(tests[i++]);

    const { subtotal, discount, paid, balance } = group[0];
    const left = { discount, advance: paid, remaining: balance };
    group.forEach((t, idx) => {
      const last = idx === group.length - 1;
      const share = (amount: number) => (subtotal > 0 ? Math.round((amount * t.fee) / subtotal) : 0);
      const d = last ? left.discount : share(discount);
      const a = last ? left.advance : share(paid);
      const r = last ? left.remaining : share(balance);
      left.discount -= d;
      left.advance -= a;
      left.remaining -= r;
      lines.push({
        report_id: t.report_id,
        report_no: t.report_no,
        created_at: t.created_at,
        patient_name: t.patient_name,
        test_name: t.test_name,
        fee: t.fee,
        discount: d,
        advance: a,
        remaining: r,
      });
    });
  }
  return lines;
}
