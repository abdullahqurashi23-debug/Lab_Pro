-- Report numbering prefix, pathologist signature image, and the folder
-- automatic/manual database backups are written to.
ALTER TABLE clinic_settings ADD COLUMN report_number_prefix TEXT DEFAULT 'LAB';
ALTER TABLE clinic_settings ADD COLUMN signature_image_path TEXT DEFAULT '';
ALTER TABLE clinic_settings ADD COLUMN backup_folder TEXT DEFAULT '';
