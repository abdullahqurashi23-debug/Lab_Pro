import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// A minimal migration runner: numbered .sql files in ./migrations, tracked
// in a schema_migrations table so a future update to LabPro can add new
// migration files and every existing installation picks up exactly the
// ones it's missing — never re-running one, never losing data.
//
// Migration files are matched as `<number>_<name>.sql` (e.g. 001_init.sql,
// 002_add_patient_notes.sql) and applied in ascending numeric order.

interface MigrationFile {
  version: number;
  name: string;
  fullPath: string;
}

function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((filename) => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) return null;
      return {
        version: parseInt(match[1], 10),
        name: match[2],
        fullPath: path.join(migrationsDir, filename),
      };
    })
    .filter((m): m is MigrationFile => m !== null)
    .sort((a, b) => a.version - b.version);
}

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version
    )
  );

  const pending = loadMigrationFiles(migrationsDir).filter((m) => !applied.has(m.version));

  for (const migration of pending) {
    const sql = fs.readFileSync(migration.fullPath, 'utf-8');
    const applyOne = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name
      );
    });
    // PRAGMA foreign_keys is a documented no-op while a transaction is
    // open, so it has to be toggled out here, not inside a migration's own
    // SQL — confirmed directly: a migration that rebuilds a table (SQLite
    // can't ALTER a CHECK constraint in place, so widening one means
    // create-new/copy/drop-old/rename) fails with "FOREIGN KEY constraint
    // failed" on the DROP TABLE step if enforcement is still active,
    // even though the migration's own SQL includes its own
    // `PRAGMA foreign_keys = OFF` — that statement silently does nothing
    // from inside the transaction `db.transaction()` opens.
    db.pragma('foreign_keys = OFF');
    try {
      applyOne();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}
