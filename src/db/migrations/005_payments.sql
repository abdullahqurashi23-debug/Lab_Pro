-- A payment is its own append-only ledger entry rather than a mutation of
-- reports.paid/balance, specifically so a payment collected AFTER a report
-- is finalized never has to touch that locked row. "Outstanding balance"
-- for a finalized report is therefore always computed as
-- reports.balance - SUM(payments.amount WHERE payments.report_id = reports.id),
-- never stored directly.
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  recorded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_report_id ON payments(report_id);
