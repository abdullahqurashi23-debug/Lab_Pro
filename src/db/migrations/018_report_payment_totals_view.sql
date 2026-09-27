-- The exact subquery "how much has been paid on each report, beyond the
-- amount recorded at registration" (payments table, summed per report_id)
-- was hand-copied into three repositories: testReport.ts, revenue.ts, and
-- dashboard.ts. A view keeps that logic in one place — a plain saved
-- query, not stored data — so it stays in sync everywhere it's joined
-- against, and any future rule change (e.g. excluding voided payments)
-- only needs to change here.
CREATE VIEW report_payment_totals AS
SELECT report_id, SUM(amount) as paid_total
FROM payments
GROUP BY report_id;
