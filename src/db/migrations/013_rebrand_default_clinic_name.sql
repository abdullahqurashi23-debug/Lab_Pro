-- Migration 001's seed row hardcoded "LabPro Diagnostic Laboratory" as the
-- starting clinic name (both a brand new install running 001+this one back
-- to back, and any existing install that never changed it, still show
-- it). Only touches rows that still hold that exact original placeholder —
-- never a lab's own customized clinic name, which the WHERE clause leaves
-- untouched.
UPDATE clinic_settings SET clinic_name = 'LabCore Diagnostic Laboratory' WHERE clinic_name = 'LabPro Diagnostic Laboratory';
