-- Adds a short, formula-friendly identifier to each test parameter
-- (e.g. "TC", "HDL", "TG") distinct from its display name ("Total
-- Cholesterol"). FORMULA-type parameters reference these codes:
-- LDL Cholesterol's formula becomes "TC - HDL - (TG / 5)" instead of the
-- unwieldy "total_cholesterol - hdl_cholesterol - (triglycerides / 5)".
--
-- Nullable on purpose (not DEFAULT ''), matching the same NULL-vs-empty
-- reasoning as patients.patient_code in 001_init.sql: a partial unique
-- index below must let many parameters share "no code yet" without
-- colliding, since SQLite treats multiple NULLs in a UNIQUE index as
-- non-conflicting but multiple empty strings would collide.
ALTER TABLE test_parameters ADD COLUMN code TEXT;

-- Best-effort backfill for rows created before this column existed, so
-- nothing is left silently blank. This is a mechanical default (uppercased,
-- non-alphanumeric characters stripped) — not a real abbreviation — and is
-- expected to be tidied up by hand from the Test Catalog editor.
UPDATE test_parameters
SET code = UPPER(
  REPLACE(REPLACE(REPLACE(REPLACE(name, ' ', ''), '-', ''), '.', ''), '/', '')
)
WHERE code IS NULL;

-- A formula can only unambiguously reference a code once per test.
-- Case-insensitive and only enforced where a code is actually set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_parameters_test_code
  ON test_parameters(test_id, code COLLATE NOCASE)
  WHERE code IS NOT NULL AND code != '';
