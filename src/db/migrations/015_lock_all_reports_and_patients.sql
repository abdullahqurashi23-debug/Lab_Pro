-- Once a patient or report is saved it is part of the permanent record:
-- nothing may delete it, draft or not. Previously only FINALIZED reports
-- were protected, so a registered (and possibly paid) patient could vanish
-- by deleting the draft before it was finalized. These triggers replace
-- that finalized-only rule with a blanket one at the database level, so no
-- code path or direct SQL can remove a record.

DROP TRIGGER IF EXISTS prevent_finalized_report_delete;

CREATE TRIGGER IF NOT EXISTS prevent_report_delete
BEFORE DELETE ON reports
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Reports are permanent and cannot be deleted.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_patient_delete
BEFORE DELETE ON patients
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Patients are permanent and cannot be deleted.');
END;
