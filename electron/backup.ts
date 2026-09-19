// Database backup/restore. Backups use better-sqlite3's own .backup() API
// (not a raw file copy) — it's safe to call while the app is running and
// writes a single consistent snapshot even in WAL mode, where the live
// "labpro.db" file alone is not a complete picture without its -wal
// sidecar. Restoring, by contrast, closes the live connection first and
// replaces the plain file directly, then relaunches the whole app so every
// in-memory cache (main process globals, the renderer's React state) starts
// completely fresh against the restored data.
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { BackupFileInfo } from '../src/db/repositories/types';

const PREFIX = {
  auto: 'labpro-auto',
  manual: 'labpro-manual',
  'pre-restore': 'labpro-prerestore',
} as const;

// Second-precision alone isn't enough — two backups triggered within the
// same second (e.g. a double-clicked "Backup Now", or the auto-backup and
// a manual one landing together) would otherwise get an identical filename
// and the second would silently overwrite the first. Millisecond precision
// plus a short random suffix makes a collision practically impossible.
function timestamp(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-'); // 2026-09-19T00-54-16-123Z
  const rand = Math.random().toString(36).slice(2, 6);
  return `${iso}-${rand}`;
}

export async function runBackup(db: Database.Database, folder: string, kind: keyof typeof PREFIX): Promise<BackupFileInfo> {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  const filename = `${PREFIX[kind]}-${timestamp()}.db`;
  const destPath = path.join(folder, filename);
  await db.backup(destPath);
  const stat = fs.statSync(destPath);
  return { name: filename, path: destPath, sizeBytes: stat.size, createdAt: new Date(stat.mtimeMs).toISOString(), kind };
}

// Only ever prunes automatic backups — a manual "Backup Now" or a
// pre-restore safety snapshot is a deliberate, named event the user (or
// the restore flow) chose to keep, not part of the rotating history.
export function pruneAutoBackups(folder: string, keep: number): void {
  if (!fs.existsSync(folder)) return;
  const files = fs
    .readdirSync(folder)
    .filter((f) => f.startsWith(`${PREFIX.auto}-`) && f.endsWith('.db'))
    .map((f) => {
      const fullPath = path.join(folder, f);
      return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const f of files.slice(keep)) fs.unlinkSync(f.fullPath);
}

export function listBackups(folder: string): BackupFileInfo[] {
  if (!fs.existsSync(folder)) return [];
  const kindOf = (filename: string): BackupFileInfo['kind'] => {
    if (filename.startsWith(`${PREFIX.auto}-`)) return 'auto';
    if (filename.startsWith(`${PREFIX.manual}-`)) return 'manual';
    return 'pre-restore';
  };
  return fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const fullPath = path.join(folder, f);
      const stat = fs.statSync(fullPath);
      return { name: f, path: fullPath, sizeBytes: stat.size, createdAt: new Date(stat.mtimeMs).toISOString(), kind: kindOf(f) };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Replaces the live database file with a chosen backup's contents. Must be
// called AFTER the live db connection has been closed (WAL sidecar files
// need to not exist / be stale once we overwrite the main file, or the
// next open would try to replay a WAL that no longer matches).
export function replaceLiveDatabase(liveDbPath: string, backupPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = liveDbPath + suffix;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
  fs.copyFileSync(backupPath, liveDbPath);
}
