// Shared test-only helpers — not itself a test file (no .test.ts suffix),
// so Vitest won't try to run it as a suite.
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runMigrations } from './migrate';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// A real on-disk file (not :memory:) — some behavior under test (WAL mode,
// backup/restore, closing and reopening a connection) only means anything
// against a real file, and using the exact same migrations directory the
// app itself uses means these tests exercise the actual shipped schema.
export function createTestDb(): { db: Database.Database; dbPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labpro-test-'));
  const dbPath = path.join(dir, 'labpro.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db, MIGRATIONS_DIR);
  return {
    db,
    dbPath,
    cleanup: () => {
      try {
        db.close();
      } catch {
        // already closed by the test (e.g. simulating a restore) — fine.
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
