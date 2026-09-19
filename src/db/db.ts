import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrate';

let db: Database.Database | null = null;

export function getDbPath(userDataPath?: string): string {
  const dataDir = userDataPath || path.join(__dirname, '..', '..', '..', 'data');
  return path.join(dataDir, 'labpro.db');
}

/**
 * Opens (creating if necessary) the single SQLite file that holds all lab
 * data, applies any pending migrations, and tunes pragmas for a desktop
 * single-writer workload.
 *
 * userDataPath: pass Electron's app.getPath('userData') in production.
 * In plain Node (the seed script) a local ./data folder is used instead.
 */
export function getDb(userDataPath?: string): Database.Database {
  if (db) return db;

  const dataDir = userDataPath || path.join(__dirname, '..', '..', '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'labpro.db');
  db = new Database(dbPath);

  // WAL lets readers (e.g. the dashboard) run concurrently with writes;
  // NORMAL synchronous is the standard safe pairing with WAL — full
  // durability on power loss for committed transactions, without paying
  // for an fsync on every single statement.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db, path.join(__dirname, 'migrations'));

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export interface IntegrityCheckResult {
  ok: boolean;
  details: string;
}

// PRAGMA integrity_check returns a single row {ok: 'ok'} when the database
// file is structurally sound, or one row per problem found otherwise —
// checked at every startup so corruption (a bad shutdown, a failing disk, a
// tampered file) surfaces immediately instead of as a much more confusing
// failure deep inside some unrelated query weeks later.
//
// Severe corruption can make SQLite throw instead of returning rows at all
// (confirmed directly: injecting garbage bytes into a real file made
// better-sqlite3 raise SQLITE_CORRUPT from the pragma call itself) — so a
// thrown error is caught and treated as "not ok" too, not left to crash
// whoever called this.
export function checkIntegrity(database: Database.Database): IntegrityCheckResult {
  try {
    const rows = database.pragma('integrity_check') as { integrity_check: string }[];
    const ok = rows.length === 1 && rows[0].integrity_check === 'ok';
    return { ok, details: ok ? 'ok' : rows.map((r) => r.integrity_check).join('\n') };
  } catch (err) {
    return { ok: false, details: err instanceof Error ? err.message : String(err) };
  }
}
