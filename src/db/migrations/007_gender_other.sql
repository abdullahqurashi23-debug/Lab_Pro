-- Widen patients.gender to also allow 'Other'. SQLite can't ALTER a CHECK
-- constraint in place, so this rebuilds the table (the officially
-- documented way to do this): create the new shape, copy every row
-- across (preserving id, so AUTOINCREMENT continues correctly and every
-- reports.patient_id foreign key still resolves), drop the old table,
-- rename, then recreate the trigger and indexes that pointed at it.
-- (foreign_keys is toggled off/on around this migration by migrate.ts
-- itself, not here — PRAGMA foreign_keys is a no-op inside a transaction.)

CREATE TABLE patients_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_code TEXT UNIQUE,
  full_name TEXT NOT NULL,
  age INTEGER,
  age_unit TEXT NOT NULL DEFAULT 'Years' CHECK (age_unit IN ('Years', 'Months', 'Days')),
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO patients_new (id, patient_code, full_name, age, age_unit, gender, phone, address, created_at)
SELECT id, patient_code, full_name, age, age_unit, gender, phone, address, created_at FROM patients;

DROP TABLE patients;
ALTER TABLE patients_new RENAME TO patients;

CREATE TRIGGER IF NOT EXISTS set_patient_code
AFTER INSERT ON patients
FOR EACH ROW
WHEN NEW.patient_code IS NULL
BEGIN
  UPDATE patients SET patient_code = 'P-' || substr('000000' || NEW.id, -6, 6) WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
