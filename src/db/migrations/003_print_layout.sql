-- Adds what the print system needs beyond the generic clinic identity:
-- a pathologist name/signature line, two optional full-width banner images
-- (distinct from the small square `logo_path`) used only in the "digital
-- PDF" print mode, and a free-text notes field on each report.
ALTER TABLE clinic_settings ADD COLUMN pathologist_name TEXT DEFAULT '';
ALTER TABLE clinic_settings ADD COLUMN header_image_path TEXT DEFAULT '';
ALTER TABLE clinic_settings ADD COLUMN footer_image_path TEXT DEFAULT '';

ALTER TABLE reports ADD COLUMN notes TEXT DEFAULT '';
