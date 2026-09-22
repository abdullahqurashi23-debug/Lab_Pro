import type Database from 'better-sqlite3';
import type { Technician } from './types';

export function listTechnicians(db: Database.Database): Technician[] {
  return db.prepare('SELECT * FROM technicians ORDER BY name').all() as Technician[];
}

export function getTechnicianById(db: Database.Database, id: number): Technician | undefined {
  return db.prepare('SELECT * FROM technicians WHERE id = ?').get(id) as Technician | undefined;
}

export function createTechnician(db: Database.Database, input: { name: string }): Technician {
  const info = db.prepare('INSERT INTO technicians (name) VALUES (?)').run(input.name);
  return getTechnicianById(db, info.lastInsertRowid as number) as Technician;
}

export function deleteTechnician(db: Database.Database, id: number): { deleted: boolean } {
  const tech = getTechnicianById(db, id);
  if (!tech) return { deleted: false };
  // performed_by on reports is a plain snapshot string (see migration
  // 011), not a foreign key — usage is checked by name, same reasoning as
  // deleteDoctor checking doctor_id, just without a column to join on.
  const usage = db.prepare('SELECT COUNT(*) as n FROM reports WHERE performed_by = ?').get(tech.name) as { n: number };
  if (usage.n > 0) {
    throw new Error(`Cannot delete "${tech.name}" — they are recorded as having performed ${usage.n} report(s).`);
  }
  db.prepare('DELETE FROM technicians WHERE id = ?').run(id);
  return { deleted: true };
}
