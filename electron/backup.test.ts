import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createTestDb } from '../src/db/testUtils';
import { createPatient } from '../src/db/repositories/patients';
import { checkIntegrity } from '../src/db/db';
import { runBackup, pruneAutoBackups, listBackups, replaceLiveDatabase } from './backup';

describe('backup / restore', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let backupFolder: string;

  beforeEach(() => {
    ctx = createTestDb();
    backupFolder = path.join(path.dirname(ctx.dbPath), 'backups');
  });
  afterEach(() => ctx.cleanup());

  it('runBackup produces a real, independently-openable SQLite file containing the live data', async () => {
    createPatient(ctx.db, { full_name: 'Backup Test Patient', age: 40, age_unit: 'Years', gender: 'Male' });
    const info = await runBackup(ctx.db, backupFolder, 'manual');
    expect(fs.existsSync(info.path)).toBe(true);

    const reopened = new Database(info.path, { readonly: true });
    const row = reopened.prepare("SELECT full_name FROM patients WHERE full_name = 'Backup Test Patient'").get();
    expect(row).toBeTruthy();
    reopened.close();
  });

  it('pruneAutoBackups keeps only the N most recent AUTOMATIC backups, and never touches manual/pre-restore ones', async () => {
    await runBackup(ctx.db, backupFolder, 'manual');
    for (let i = 0; i < 5; i++) {
      await runBackup(ctx.db, backupFolder, 'auto');
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(listBackups(backupFolder).filter((b) => b.kind === 'auto')).toHaveLength(5);

    pruneAutoBackups(backupFolder, 3);

    const remaining = listBackups(backupFolder);
    expect(remaining.filter((b) => b.kind === 'auto')).toHaveLength(3);
    expect(remaining.filter((b) => b.kind === 'manual')).toHaveLength(1);
  });

  it('replaceLiveDatabase restores a prior snapshot, reverting anything changed after it was taken', async () => {
    createPatient(ctx.db, { full_name: 'Before Snapshot', age: 30, age_unit: 'Years', gender: 'Female' });
    const snapshot = await runBackup(ctx.db, backupFolder, 'pre-restore');

    createPatient(ctx.db, { full_name: 'After Snapshot — Should Vanish', age: 30, age_unit: 'Years', gender: 'Female' });
    ctx.db.close();

    replaceLiveDatabase(ctx.dbPath, snapshot.path);

    const restored = new Database(ctx.dbPath);
    const names = restored.prepare('SELECT full_name FROM patients ORDER BY id').all() as { full_name: string }[];
    expect(names.map((r) => r.full_name)).toEqual(['Before Snapshot']);
    restored.close();
  });

  it('checkIntegrity reports ok on a healthy database and detects real corruption', () => {
    expect(checkIntegrity(ctx.db).ok).toBe(true);

    // Inject real garbage bytes into a copy and confirm it's actually
    // detected, not just assumed — mirrors what a failing disk or a bad
    // shutdown could produce.
    ctx.db.close();
    const corruptPath = ctx.dbPath + '.corrupt';
    fs.copyFileSync(ctx.dbPath, corruptPath);
    const fd = fs.openSync(corruptPath, 'r+');
    fs.writeSync(fd, Buffer.alloc(4096, 0xff), 0, 4096, 100);
    fs.closeSync(fd);

    const corruptDb = new Database(corruptPath);
    const result = checkIntegrity(corruptDb);
    expect(result.ok).toBe(false);
    expect(result.details.length).toBeGreaterThan(0);
    corruptDb.close();
  });
});
