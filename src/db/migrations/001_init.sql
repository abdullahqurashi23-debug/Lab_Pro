-- LabPro initial schema.
-- SQLite database, embedded in the app, no external server needed.

PRAGMA foreign_keys = ON;

-- ============================================================
-- Config tables
-- ============================================================

-- Clinic identity used on the print header — separate from `settings`
-- below because it's a fixed, known shape the UI edits as a form.
CREATE TABLE IF NOT EXISTS clinic_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- singleton row
  clinic_name TEXT NOT NULL DEFAULT 'LabPro Diagnostic Laboratory',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  logo_path TEXT DEFAULT '',
  header_note TEXT DEFAULT '',
  footer_note TEXT DEFAULT ''
);

-- Free-form app configuration that doesn't warrant its own column/table
-- (feature flags, small preferences). Deliberately generic key/value.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ============================================================
-- Accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'TECHNICIAN', 'RECEPTION')),
  is_active INTEGER NOT NULL DEFAULT 1,
  -- Not in the original spec list, but required to implement "force
  -- password change on first login" for the seeded admin account.
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- People
-- ============================================================

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Nullable (not DEFAULT ''): SQLite treats multiple NULLs in a UNIQUE
  -- column as non-conflicting, so every insert can leave this NULL and
  -- let the AFTER INSERT trigger below fill it in from the new id
  -- without ever risking a transient UNIQUE collision.
  patient_code TEXT UNIQUE,
  full_name TEXT NOT NULL,
  age INTEGER,
  age_unit TEXT NOT NULL DEFAULT 'Years' CHECK (age_unit IN ('Years', 'Months', 'Days')),
  gender TEXT CHECK (gender IN ('Male', 'Female')),
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS set_patient_code
AFTER INSERT ON patients
FOR EACH ROW
WHEN NEW.patient_code IS NULL
BEGIN
  UPDATE patients SET patient_code = 'P-' || substr('000000' || NEW.id, -6, 6) WHERE id = NEW.id;
END;

-- "Referred By" doctor.
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  clinic TEXT DEFAULT '',
  phone TEXT DEFAULT ''
);

-- ============================================================
-- Test catalog — a test can have many parameters (e.g. "CBC" has
-- Hemoglobin, WBC, Platelets, ...), each with its own unit, reference
-- ranges, and input type.
-- ============================================================

CREATE TABLE IF NOT EXISTS test_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  category_id INTEGER REFERENCES test_categories(id),
  price REAL NOT NULL DEFAULT 0,
  sample_type TEXT DEFAULT '',
  report_notes TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Case-insensitive uniqueness: "CBC" and "cbc" are the same test.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tests_name_lower ON tests(LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_tests_short_code_lower ON tests(LOWER(short_code));

CREATE TABLE IF NOT EXISTS test_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id),
  name TEXT NOT NULL,
  unit TEXT DEFAULT '',
  input_type TEXT NOT NULL DEFAULT 'NUMBER' CHECK (input_type IN ('NUMBER', 'TEXT', 'DROPDOWN', 'FORMULA')),
  -- JSON array of strings, e.g. ["Positive","Negative"] — only meaningful
  -- when input_type = 'DROPDOWN'.
  dropdown_options TEXT DEFAULT '',
  -- An arithmetic expression referencing sibling parameter names, e.g.
  -- "cholesterol - hdl - (triglycerides / 5)" — only meaningful when
  -- input_type = 'FORMULA'. Evaluated by src/db/formula.ts, never eval().
  formula TEXT DEFAULT '',
  ref_male_low REAL,
  ref_male_high REAL,
  ref_female_low REAL,
  ref_female_high REAL,
  ref_child_low REAL,
  ref_child_high REAL,
  -- Free-text reference description for non-numeric parameters
  -- (e.g. "Negative", "Straw-colored, Clear").
  ref_text TEXT DEFAULT '',
  critical_low REAL,
  critical_high REAL,
  decimals INTEGER NOT NULL DEFAULT 2,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- Reports — a report has many report_tests (line items), each of which
-- has many report_results (one per parameter of that test). Every
-- display field is snapshotted at creation time so editing the catalog
-- later can never change what an already-created report shows.
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_no TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER REFERENCES doctors(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  finalized_by INTEGER REFERENCES users(id),
  finalized_at TEXT,
  pdf_path TEXT DEFAULT '',
  pdf_sha256 TEXT DEFAULT '',
  -- Points at the original report when this one is an amended reissue,
  -- so amendment history stays traceable even though the original stays
  -- frozen and locked forever.
  amends_report_id INTEGER REFERENCES reports(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  test_id INTEGER NOT NULL REFERENCES tests(id),
  test_name_snapshot TEXT NOT NULL,
  price_snapshot REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS report_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_test_id INTEGER NOT NULL REFERENCES report_tests(id),
  parameter_id INTEGER REFERENCES test_parameters(id),
  parameter_name_snapshot TEXT NOT NULL,
  unit_snapshot TEXT DEFAULT '',
  ref_range_snapshot TEXT DEFAULT '',
  value TEXT DEFAULT '',
  flag TEXT NOT NULL DEFAULT 'NORMAL' CHECK (flag IN ('NORMAL', 'HIGH', 'LOW', 'CRITICAL'))
);

-- ============================================================
-- Audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details_json TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes for fast search
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_reports_report_no ON reports(report_no);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_patient_id ON reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_doctor_id ON reports(doctor_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_report_tests_report_id ON report_tests(report_id);
CREATE INDEX IF NOT EXISTS idx_report_results_report_test_id ON report_results(report_test_id);
CREATE INDEX IF NOT EXISTS idx_test_parameters_test_id ON test_parameters(test_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);

-- ============================================================
-- IMMUTABILITY ENFORCEMENT — the most important rule in this app.
-- These triggers are a second line of defense that lives INSIDE the
-- database file itself. Even if a bug in the app code (or someone
-- editing the .db file with another tool) tries to change or delete a
-- finalized report, SQLite itself will refuse and raise an error. The
-- application code must ALSO check status before allowing edits — this
-- is a backup, not a replacement for that check.
-- ============================================================

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_update
BEFORE UPDATE ON reports
FOR EACH ROW
WHEN OLD.status = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized and cannot be edited.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_delete
BEFORE DELETE ON reports
FOR EACH ROW
WHEN OLD.status = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized and cannot be deleted.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_tests_insert
BEFORE INSERT ON report_tests
FOR EACH ROW
WHEN (SELECT status FROM reports WHERE id = NEW.report_id) = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized; no new tests can be added.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_tests_update
BEFORE UPDATE ON report_tests
FOR EACH ROW
WHEN (SELECT status FROM reports WHERE id = OLD.report_id) = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized; its tests cannot be edited.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_tests_delete
BEFORE DELETE ON report_tests
FOR EACH ROW
WHEN (SELECT status FROM reports WHERE id = OLD.report_id) = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized; its tests cannot be deleted.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_results_insert
BEFORE INSERT ON report_results
FOR EACH ROW
WHEN (
  SELECT status FROM reports
  WHERE id = (SELECT report_id FROM report_tests WHERE id = NEW.report_test_id)
) = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized; no new results can be added.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_results_update
BEFORE UPDATE ON report_results
FOR EACH ROW
WHEN (
  SELECT status FROM reports
  WHERE id = (SELECT report_id FROM report_tests WHERE id = OLD.report_test_id)
) = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized; its results cannot be edited.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_finalized_report_results_delete
BEFORE DELETE ON report_results
FOR EACH ROW
WHEN (
  SELECT status FROM reports
  WHERE id = (SELECT report_id FROM report_tests WHERE id = OLD.report_test_id)
) = 'FINALIZED'
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized; its results cannot be deleted.');
END;

-- Seed the singleton rows if they don't exist yet.
INSERT OR IGNORE INTO clinic_settings (id, clinic_name, address, phone)
VALUES (1, 'LabPro Diagnostic Laboratory', '', '');
