// Where the permanent, hashed PDF copy of a finalized report gets written:
// {baseFolder}/YYYY/MM-Month/REPORTNO_PatientName.pdf. Zero Electron
// dependencies except the default-folder fallback, so this stays trivially
// testable.
import path from 'path';

// Filesystem-unsafe on Windows (\ / : * ? " < > |) — stripped rather than
// replaced with a look-alike, since this app also targets Windows and a
// path separator smuggled into a filename would silently create the wrong
// directory structure instead of erroring.
function sanitizeFilenamePart(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

export interface ArchivableReport {
  report_no: string;
  patient_name: string;
  finalized_at: string | null;
}

export function buildArchivePath(baseFolder: string, defaultBaseFolder: string, report: ArchivableReport): string {
  const base = baseFolder && baseFolder.trim() ? baseFolder.trim() : defaultBaseFolder;
  // finalized_at is a SQLite `datetime('now')` string ("YYYY-MM-DD HH:MM:SS",
  // UTC, no offset) — swapping the space for "T" makes it a format Date can
  // parse; falling back to "now" only covers a defensive edge case (a null
  // finalized_at should never happen by the time this is called).
  const date = report.finalized_at ? new Date(report.finalized_at.replace(' ', 'T')) : new Date();
  const year = String(date.getFullYear());
  const monthNum = String(date.getMonth() + 1).padStart(2, '0');
  const monthName = date.toLocaleString('en-US', { month: 'long' });
  const folder = path.join(base, year, `${monthNum}-${monthName}`);
  const filename = `${sanitizeFilenamePart(report.report_no)}_${sanitizeFilenamePart(report.patient_name)}.pdf`;
  return path.join(folder, filename);
}
