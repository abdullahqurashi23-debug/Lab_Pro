import type Database from 'better-sqlite3';
import type { ReportListRow } from './types';

export interface StatBucket {
  count: number;
  revenue: number;
}

export interface DashboardStats {
  today: StatBucket;
  week: StatBucket;
  month: StatBucket;
  last7Days: { day: string; count: number }[];
  pendingDrafts: number;
  outstandingBalance: number;
  recentReports: ReportListRow[];
}

// Revenue here reads reports.total directly — it's already the frozen,
// correct total for that report (subtotal/discount computed from
// price_snapshot at creation time), so no join back to the live test
// catalog is needed or wanted for historical accuracy.
export function getDashboardStats(db: Database.Database): DashboardStats {
  const countAndRevenue = (whereClause: string): StatBucket => {
    const row = db
      .prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
         FROM reports
         WHERE status = 'FINALIZED' AND ${whereClause}`
      )
      .get() as { count: number; revenue: number };
    return { count: row.count || 0, revenue: row.revenue || 0 };
  };

  const today = countAndRevenue("date(created_at) = date('now')");
  const week = countAndRevenue("date(created_at) >= date('now', '-6 days')");
  const month = countAndRevenue("strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");

  const last7Days = db
    .prepare(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM reports
       WHERE status = 'FINALIZED' AND date(created_at) >= date('now', '-6 days')
       GROUP BY date(created_at)
       ORDER BY day`
    )
    .all() as { day: string; count: number }[];

  const pendingDrafts = (db.prepare("SELECT COUNT(*) as n FROM reports WHERE status = 'DRAFT'").get() as { n: number }).n || 0;

  // Sums only the POSITIVE outstanding portion per report (via the scalar,
  // 2-argument form of max()) — an overpaid report should never offset and
  // hide genuinely outstanding balances elsewhere in the aggregate.
  const outstandingBalance =
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(MAX(reports.balance - COALESCE(p.paid_total, 0), 0)), 0) as total
           FROM reports
           LEFT JOIN (SELECT report_id, SUM(amount) as paid_total FROM payments GROUP BY report_id) p ON p.report_id = reports.id
           WHERE reports.status = 'FINALIZED'`
        )
        .get() as { total: number }
    ).total || 0;

  const recentReports = db
    .prepare(
      `SELECT reports.*, patients.full_name as patient_name, patients.patient_code, patients.phone as patient_phone, doctors.name as doctor_name
       FROM reports
       JOIN patients ON patients.id = reports.patient_id
       LEFT JOIN doctors ON doctors.id = reports.doctor_id
       ORDER BY reports.created_at DESC
       LIMIT 8`
    )
    .all() as ReportListRow[];

  return { today, week, month, last7Days, pendingDrafts, outstandingBalance, recentReports };
}
