// Every timestamp in the database is SQLite datetime('now') — UTC, formatted
// "YYYY-MM-DD HH:MM:SS" with no zone marker. These helpers convert one to
// the machine's local time for printed documents.

function parseUtc(ts: string): Date | null {
  const d = new Date(`${ts.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

// "2026-09-17"
export function localDate(ts: string | null | undefined): string {
  const d = ts ? parseUtc(ts) : null;
  if (!d) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-09-17 12:53 PM"
export function localDateTime(ts: string | null | undefined): string {
  const d = ts ? parseUtc(ts) : null;
  if (!d) return '—';
  const h = d.getHours() % 12 || 12;
  return `${localDate(ts)} ${pad(h)}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
