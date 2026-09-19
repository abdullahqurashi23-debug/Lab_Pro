import type Database from 'better-sqlite3';
import type { Doctor } from './types';

export function listDoctors(db: Database.Database): Doctor[] {
  return db.prepare('SELECT * FROM doctors ORDER BY name').all() as Doctor[];
}

export function getDoctorById(db: Database.Database, id: number): Doctor | undefined {
  return db.prepare('SELECT * FROM doctors WHERE id = ?').get(id) as Doctor | undefined;
}

export function createDoctor(db: Database.Database, input: { name: string; clinic?: string; phone?: string }): Doctor {
  const info = db
    .prepare('INSERT INTO doctors (name, clinic, phone) VALUES (?, ?, ?)')
    .run(input.name, input.clinic || '', input.phone || '');
  return getDoctorById(db, info.lastInsertRowid as number) as Doctor;
}

export function updateDoctor(
  db: Database.Database,
  id: number,
  input: { name: string; clinic?: string; phone?: string }
): Doctor {
  db.prepare('UPDATE doctors SET name = ?, clinic = ?, phone = ? WHERE id = ?').run(
    input.name,
    input.clinic || '',
    input.phone || '',
    id
  );
  return getDoctorById(db, id) as Doctor;
}

export function deleteDoctor(db: Database.Database, id: number): { deleted: boolean } {
  const doctor = getDoctorById(db, id);
  if (!doctor) return { deleted: false };
  const usage = db.prepare('SELECT COUNT(*) as n FROM reports WHERE doctor_id = ?').get(id) as { n: number };
  if (usage.n > 0) {
    throw new Error(`Cannot delete "${doctor.name}" — they are the referring doctor on ${usage.n} report(s).`);
  }
  db.prepare('DELETE FROM doctors WHERE id = ?').run(id);
  return { deleted: true };
}
