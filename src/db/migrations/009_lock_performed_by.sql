-- Real gap found in a fresh audit: prevent_finalized_report_update (see
-- 004_finalize_archive.sql) lists every column that must stay frozen on a
-- finalized report by name. `performed_by` (008_performed_by.sql) was
-- added after that trigger was written and was never added to its list —
-- meaning a direct SQL UPDATE touching only performed_by on an already
-- finalized report silently succeeded, completely bypassing the lock this
-- trigger exists to enforce. Verified with a failing test before this fix.
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
  NEW.performed_by IS NOT OLD.performed_by OR
  NEW.created_by IS NOT OLD.created_by OR
  NEW.finalized_by IS NOT OLD.finalized_by OR
  NEW.finalized_at IS NOT OLD.finalized_at OR
  NEW.amends_report_id IS NOT OLD.amends_report_id OR
  NEW.created_at IS NOT OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'This report is finalized and cannot be edited.');
END;
