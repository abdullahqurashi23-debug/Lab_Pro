import type Database from 'better-sqlite3';
import type {
  OutstandingBalanceRow,
  RevenueBreakdownRow,
  RevenueBucket,
  RevenueGranularity,
  RevenuePeriodFilters,
  RevenuePeriodReport,
} from './types';

// All period math happens inside SQLite (date('now', ...)) rather than in
// JS with `new Date()`, deliberately — SQLite's date('now') is UTC, and so
// is every `created_at`/`finalized_at` timestamp already stamped elsewhere
// in this app (datetime('now')). Computing boundaries in JS local time
// instead would silently drift by a day near midnight depending on the
// machine's timezone. One query up front gets every anchor date this
// module could need, all in that same UTC "now" frame.
interface PeriodAnchors {
  today: string;
  yesterday: string;
  week_start: string;
  prev_week_end: string;
  prev_week_start: string;
  month_start: string;
  prev_month_start: string;
  prev_month_end: string;
  year_start: string;
  prev_year_start: string;
  prev_year_end: string;
  trend30_start: string;
  trend12w_start: string;
  trend12m_start: string;
  trend5y_start: string;
}

function getAnchors(db: Database.Database): PeriodAnchors {
  return db
    .prepare(
      `SELECT
        date('now') as today,
        date('now','-1 day') as yesterday,
        date('now','-6 days') as week_start,
        date('now','-7 days') as prev_week_end,
        date('now','-13 days') as prev_week_start,
        date('now','start of month') as month_start,
        date('now','start of month','-1 month') as prev_month_start,
        date('now','start of month','-1 day') as prev_month_end,
        date('now','start of year') as year_start,
        date('now','start of year','-1 year') as prev_year_start,
        date('now','start of year','-1 day') as prev_year_end,
        date('now','-29 days') as trend30_start,
        date('now','-83 days') as trend12w_start,
        date('now','start of month','-11 months') as trend12m_start,
        date('now','start of year','-4 years') as trend5y_start`
    )
    .get() as PeriodAnchors;
}

export interface ResolvedPeriod {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  trendFrom: string;
  trendTo: string;
  bucketBy: 'day' | 'week' | 'month' | 'year';
}

// Exported so other period-based reports (e.g. the daily/weekly/monthly
// Test Report) resolve "today"/"this week"/"this month" identically to
// Revenue — a single source of truth for what those words mean, all
// computed in SQLite's own UTC `date('now')` rather than JS Date (see the
// getAnchors comment above for why that matters).
export function resolvePeriod(db: Database.Database, filters: RevenuePeriodFilters): ResolvedPeriod {
  const a = getAnchors(db);
  const g: RevenueGranularity = filters.granularity;

  if (g === 'custom') {
    if (!filters.from || !filters.to) throw new Error('A custom range requires both a from and a to date.');
    const prev = db
      .prepare(
        `SELECT
           date(?, '-' || (CAST(julianday(?) - julianday(?) AS INTEGER) + 1) || ' days') as prevFrom,
           date(?, '-1 day') as prevTo`
      )
      .get(filters.from, filters.to, filters.from, filters.from) as { prevFrom: string; prevTo: string };
    return { from: filters.from, to: filters.to, prevFrom: prev.prevFrom, prevTo: prev.prevTo, trendFrom: filters.from, trendTo: filters.to, bucketBy: 'day' };
  }
  if (g === 'daily') {
    return { from: a.today, to: a.today, prevFrom: a.yesterday, prevTo: a.yesterday, trendFrom: a.trend30_start, trendTo: a.today, bucketBy: 'day' };
  }
  if (g === 'weekly') {
    return { from: a.week_start, to: a.today, prevFrom: a.prev_week_start, prevTo: a.prev_week_end, trendFrom: a.trend12w_start, trendTo: a.today, bucketBy: 'week' };
  }
  if (g === 'monthly') {
    return { from: a.month_start, to: a.today, prevFrom: a.prev_month_start, prevTo: a.prev_month_end, trendFrom: a.trend12m_start, trendTo: a.today, bucketBy: 'month' };
  }
  // yearly
  return { from: a.year_start, to: a.today, prevFrom: a.prev_year_start, prevTo: a.prev_year_end, trendFrom: a.trend5y_start, trendTo: a.today, bucketBy: 'year' };
}

// Fixed, hardcoded SQL fragments only — bucketBy is a value this module
// itself computes (never taken raw from the client), so there's no
// injection surface despite the string being spliced into a query below.
const BUCKET_EXPR: Record<ResolvedPeriod['bucketBy'], string> = {
  day: "date(reports.created_at)",
  week: "date(reports.created_at, '-' || ((strftime('%w', reports.created_at) + 6) % 7) || ' days')",
  month: "strftime('%Y-%m', reports.created_at)",
  year: "strftime('%Y', reports.created_at)",
};

function countAndRevenue(db: Database.Database, from: string, to: string): { count: number; revenue: number; discounts: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue, COALESCE(SUM(discount), 0) as discounts
       FROM reports
       WHERE status = 'FINALIZED' AND date(created_at) >= date(?) AND date(created_at) <= date(?)`
    )
    .get(from, to) as { count: number; revenue: number; discounts: number };
  return { count: row.count || 0, revenue: row.revenue || 0, discounts: row.discounts || 0 };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null = "no baseline to compare against"
  return ((current - previous) / previous) * 100;
}

export function getRevenuePeriodReport(db: Database.Database, filters: RevenuePeriodFilters): RevenuePeriodReport {
  const period = resolvePeriod(db, filters);
  const current = countAndRevenue(db, period.from, period.to);
  const previous = countAndRevenue(db, period.prevFrom, period.prevTo);

  const trend = db
    .prepare(
      `SELECT ${BUCKET_EXPR[period.bucketBy]} as bucket, COALESCE(SUM(reports.total), 0) as revenue, COUNT(*) as count
       FROM reports
       WHERE reports.status = 'FINALIZED' AND date(reports.created_at) >= date(?) AND date(reports.created_at) <= date(?)
       GROUP BY bucket
       ORDER BY bucket`
    )
    .all(period.trendFrom, period.trendTo) as RevenueBucket[];

  const inPeriod = "reports.status = 'FINALIZED' AND date(reports.created_at) >= date(?) AND date(reports.created_at) <= date(?)";
  const periodParams = [period.from, period.to];

  // Test-level breakdowns use price_snapshot (pre-discount) — a report's
  // discount is a single report-level adjustment with no principled way to
  // attribute it back to one specific test line item, so these numbers
  // (like the existing category breakdown before this feature) are gross
  // per-test revenue, not the post-discount report total.
  const topTestsByCount = db
    .prepare(
      `SELECT report_tests.test_name_snapshot as label, COUNT(*) as count, COALESCE(SUM(report_tests.price_snapshot), 0) as revenue
       FROM report_tests
       JOIN reports ON reports.id = report_tests.report_id
       WHERE ${inPeriod}
       GROUP BY label
       ORDER BY count DESC, revenue DESC
       LIMIT 10`
    )
    .all(...periodParams) as RevenueBreakdownRow[];

  const topTestsByRevenue = db
    .prepare(
      `SELECT report_tests.test_name_snapshot as label, COUNT(*) as count, COALESCE(SUM(report_tests.price_snapshot), 0) as revenue
       FROM report_tests
       JOIN reports ON reports.id = report_tests.report_id
       WHERE ${inPeriod}
       GROUP BY label
       ORDER BY revenue DESC, count DESC
       LIMIT 10`
    )
    .all(...periodParams) as RevenueBreakdownRow[];

  const byCategory = db
    .prepare(
      `SELECT COALESCE(NULLIF(test_categories.name, ''), 'Uncategorized') as label,
              COALESCE(SUM(report_tests.price_snapshot), 0) as revenue,
              COUNT(*) as count
       FROM report_tests
       JOIN reports ON reports.id = report_tests.report_id
       LEFT JOIN tests ON tests.id = report_tests.test_id
       LEFT JOIN test_categories ON test_categories.id = tests.category_id
       WHERE ${inPeriod}
       GROUP BY label
       ORDER BY revenue DESC`
    )
    .all(...periodParams) as RevenueBreakdownRow[];

  // Doctor and payment method are report-level attributes (exactly one per
  // report), so these use reports.total directly and correctly reflect the
  // discount already applied.
  const byDoctor = db
    .prepare(
      `SELECT COALESCE(doctors.name, 'Self / Walk-in') as label, COALESCE(SUM(reports.total), 0) as revenue, COUNT(*) as count
       FROM reports
       LEFT JOIN doctors ON doctors.id = reports.doctor_id
       WHERE ${inPeriod}
       GROUP BY label
       ORDER BY revenue DESC`
    )
    .all(...periodParams) as RevenueBreakdownRow[];

  const byPaymentMethod = db
    .prepare(
      `SELECT COALESCE(NULLIF(reports.payment_method, ''), 'Unspecified') as label, COALESCE(SUM(reports.total), 0) as revenue, COUNT(*) as count
       FROM reports
       WHERE ${inPeriod}
       GROUP BY label
       ORDER BY revenue DESC`
    )
    .all(...periodParams) as RevenueBreakdownRow[];

  return {
    from: period.from,
    to: period.to,
    prevFrom: period.prevFrom,
    prevTo: period.prevTo,
    current,
    previous: { revenue: previous.revenue, count: previous.count },
    changePct: {
      revenue: pctChange(current.revenue, previous.revenue),
      count: pctChange(current.count, previous.count),
    },
    trend,
    topTestsByCount,
    topTestsByRevenue,
    byDoctor,
    byCategory,
    byPaymentMethod,
  };
}

// Always the CURRENT, full outstanding ledger — not scoped to whatever
// period is selected above, since "who owes us money right now" is a
// present-tense question, not a historical revenue breakdown. Only
// finalized reports are tracked here on purpose (see 005_payments.sql):
// a draft's balance is still just a mutable field on the row itself.
export function listOutstandingBalances(db: Database.Database): OutstandingBalanceRow[] {
  return db
    .prepare(
      `SELECT reports.id, reports.report_no, reports.patient_id, patients.full_name as patient_name,
              patients.phone as patient_phone, reports.total,
              (reports.paid + COALESCE(p.paid_total, 0)) as paid_total,
              (reports.balance - COALESCE(p.paid_total, 0)) as balance,
              reports.finalized_at
       FROM reports
       JOIN patients ON patients.id = reports.patient_id
       LEFT JOIN (SELECT report_id, SUM(amount) as paid_total FROM payments GROUP BY report_id) p ON p.report_id = reports.id
       WHERE reports.status = 'FINALIZED' AND (reports.balance - COALESCE(p.paid_total, 0)) > 0.005
       ORDER BY balance DESC`
    )
    .all() as OutstandingBalanceRow[];
}
