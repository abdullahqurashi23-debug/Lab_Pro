-- Report archiving: a configurable folder for the permanent PDF copy
-- generated at finalize time, plus a refinement of the immutability
-- trigger to allow exactly one narrow exception.
ALTER TABLE clinic_settings ADD COLUMN report_archive_folder TEXT DEFAULT '';

-- The original prevent_finalized_report_update trigger blocked EVERY
-- update on a finalized row. That's almost right, but PDF generation is
-- asynchronous (a hidden BrowserWindow render + printToPDF call) and
-- can't happen inside the same synchronous transaction that flips status
-- to FINALIZED. So the app finalizes first (status+finalized_by/at+audit,
-- all in one transaction — see finalizeReport), then generates the PDF,
-- then needs a SECOND write to attach pdf_path/pdf_sha256 to the
-- now-finalized row. This refined trigger allows ONLY that: an update
-- that touches pdf_path/pdf_sha256 and nothing else still succeeds; an
-- update that changes any actual report content (status, totals, notes,
-- patient/doctor linkage, etc.) is still unconditionally rejected, exactly
-- as before.
DROP TRIGGER IF EXISTS prevent_finalized_report_update;
CREATE TRIGGER prevent_finalized_report_update
BEFORE UPDATE ON reports
FOR EACH ROW
WHEN OLD.status = 'FINALIZED' AND (
  NEW.status IS NOT OLD.status OR
  NEW.report_no IS NOT OLD.report_no OR
  NEW.patient_id IS NOT OLD.patient_id OR
  NEW.doctor_id IS NOT OLD.doctor_id OR
  NEW.subtotal IS NOT OLD.subtotal OR
  NEW.discount IS NOT OLD.discount OR
  NEW.total IS NOT OLD.total OR
  NEW.paid IS NOT OLD.paid OR
  NEW.balance IS NOT OLD.balance OR
  NEW.payment_method IS NOT OLD.payment_method OR
  NEW.notes IS NOT OLD.notes OR
  NEW.created_by IS NOT OLD.created_by OR
  NEW.finalized_by IS NOT OLD.finalized_by OR
  NEW.finalized_at IS NOT OLD.finalized_at OR
  NEW.amends_report_id IS NOT OLD.amends_report_id OR
  NEW.created_at IS NOT OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized and cannot be edited.');
END;
