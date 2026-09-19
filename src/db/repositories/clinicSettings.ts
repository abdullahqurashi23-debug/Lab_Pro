import type Database from 'better-sqlite3';

export interface ClinicSettings {
  id: 1;
  clinic_name: string;
  address: string;
  phone: string;
  logo_path: string;
  header_note: string;
  footer_note: string;
  pathologist_name: string;
  // Full-width banner images, distinct from the small square `logo_path` —
  // only used in the "digital PDF" print mode (see src/print).
  header_image_path: string;
  footer_image_path: string;
  // Base folder for the permanent, hashed PDF copy written at finalize
  // time (see electron/reportArchive.ts) — empty string means "use the
  // default (Documents/LabPro Reports)".
  report_archive_folder: string;
  // Prepended to every generated report number (see generateReportNo in
  // reports.ts) — e.g. "LAB" -> "LAB-2026-000001".
  report_number_prefix: string;
  // Printed next to the pathologist's name/signature line, in both paper
  // and PDF modes (unlike header/footer, which are PDF-only).
  signature_image_path: string;
  // Base folder for automatic + manual database backups — empty string
  // means "use the default (Documents/LabPro Backups)".
  backup_folder: string;
}

export function getClinicSettings(db: Database.Database): ClinicSettings {
  return db.prepare('SELECT * FROM clinic_settings WHERE id = 1').get() as ClinicSettings;
}

export function updateClinicSettings(db: Database.Database, fields: Partial<ClinicSettings>): ClinicSettings {
  const current = getClinicSettings(db);
  const merged = { ...current, ...fields };
  db.prepare(
    `UPDATE clinic_settings SET
       clinic_name=?, address=?, phone=?, logo_path=?, header_note=?, footer_note=?,
       pathologist_name=?, header_image_path=?, footer_image_path=?, report_archive_folder=?,
       report_number_prefix=?, signature_image_path=?, backup_folder=?
     WHERE id = 1`
  ).run(
    merged.clinic_name,
    merged.address,
    merged.phone,
    merged.logo_path,
    merged.header_note,
    merged.footer_note,
    merged.pathologist_name,
    merged.header_image_path,
    merged.footer_image_path,
    merged.report_archive_folder,
    merged.report_number_prefix,
    merged.signature_image_path,
    merged.backup_folder
  );
  return getClinicSettings(db);
}
