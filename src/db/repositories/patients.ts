import type Database from 'better-sqlite3';
import type { Patient, PatientParameterPoint, PatientTrendParameter, ResultFlag } from './types';

export function getPatientById(db: Database.Database, id: number): Patient | undefined {
  return db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as Patient | undefined;
}

export function searchPatients(db: Database.Database, query: string): Patient[] {
  if (!query.trim()) {
    return db.prepare('SELECT * FROM patients ORDER BY full_name LIMIT 200').all() as Patient[];
  }
  const q = `%${query.trim()}%`;
  return db
    .prepare(
      `SELECT * FROM patients
       WHERE full_name LIKE ? OR phone LIKE ? OR patient_code LIKE ?
       ORDER BY full_name
       LIMIT 50`
    )
    .all(q, q, q) as Patient[];
}

export interface NewPatientInput {
  title?: string;
  full_name: string;
  age: number | null;
  age_unit: 'Years' | 'Months' | 'Days';
  gender: 'Male' | 'Female' | 'Other' | null;
  phone?: string;
  address?: string;
}

export function createPatient(db: Database.Database, input: NewPatientInput): Patient {
  const info = db
    .prepare(
      'INSERT INTO patients (title, full_name, age, age_unit, gender, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      input.title || '',
      input.full_name,
      input.age,
      input.age_unit || 'Years',
      input.gender,
      input.phone || '',
      input.address || ''
    );
  return getPatientById(db, info.lastInsertRowid as number) as Patient;
}

export interface PatientWithStats extends Patient {
  report_count: number;
  last_visit: string | null;
}

export function listPatientsWithStats(db: Database.Database, search?: string): PatientWithStats[] {
  let query = `
    SELECT patients.*, COUNT(reports.id) as report_count, MAX(reports.created_at) as last_visit
    FROM patients
    LEFT JOIN reports ON reports.patient_id = patients.id
  `;
  const params: string[] = [];
  if (search && search.trim()) {
    query += ' WHERE patients.full_name LIKE ? OR patients.phone LIKE ? OR patients.patient_code LIKE ?';
    const q = `%${search.trim()}%`;
    params.push(q, q, q);
  }
  query += ' GROUP BY patients.id ORDER BY patients.full_name';
  return db.prepare(query).all(...params) as PatientWithStats[];
}

// A patient is considered a "child" for reference-range purposes if their
// age is recorded in Months/Days, or in Years but under 18.
export function isChildPatient(patient: Pick<Patient, 'age' | 'age_unit'>): boolean {
  if (patient.age == null) return false;
  if (patient.age_unit !== 'Years') return true;
  return patient.age < 18;
}

// Surfaces a WARNING (not a hard block — the caller decides whether to
// proceed) when a new patient being entered shares both a name and a phone
// number with someone already on file, since that combination is a much
// stronger signal of an actual duplicate than either field alone (many
// patients legitimately share a name, or a phone number within a family).
export function findDuplicatePatient(db: Database.Database, fullName: string, phone: string): Patient | undefined {
  const name = fullName.trim();
  const ph = phone.trim();
  if (!name || !ph) return undefined;
  return db
    .prepare('SELECT * FROM patients WHERE LOWER(full_name) = LOWER(?) AND phone = ? LIMIT 1')
    .get(name, ph) as Patient | undefined;
}

// Which of this patient's recorded results are actually plottable as a
// trend — i.e. ever had a numeric value. Filtering happens in JS rather
// than SQL because "is this string parseable as a number" is exactly the
// same check computeFlag() already relies on elsewhere, and SQLite's
// implicit numeric coercion on arbitrary TEXT isn't reliable enough to
// trust for this.
export function listPatientTrendableParameters(db: Database.Database, patientId: number): PatientTrendParameter[] {
  const rows = db
    .prepare(
      `SELECT rr.parameter_name_snapshot as name, rr.unit_snapshot as unit, rr.value as value
       FROM report_results rr
       JOIN report_tests rt ON rt.id = rr.report_test_id
       JOIN reports r ON r.id = rt.report_id
       WHERE r.patient_id = ? AND r.status = 'FINALIZED'`
    )
    .all(patientId) as { name: string; unit: string; value: string }[];

  const seen = new Map<string, string>();
  for (const row of rows) {
    if (seen.has(row.name)) continue;
    if (Number.isFinite(parseFloat(row.value))) seen.set(row.name, row.unit);
  }
  return Array.from(seen.entries())
    .map(([name, unit]) => ({ name, unit }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The actual over-time series for one chosen parameter, oldest first —
// ready to feed straight into a line chart.
export function getPatientParameterHistory(db: Database.Database, patientId: number, parameterName: string): PatientParameterPoint[] {
  const rows = db
    .prepare(
      `SELECT rr.value as value, rr.unit_snapshot as unit, rr.flag as flag,
              r.finalized_at as finalized_at, r.created_at as created_at, r.report_no as report_no
       FROM report_results rr
       JOIN report_tests rt ON rt.id = rr.report_test_id
       JOIN reports r ON r.id = rt.report_id
       WHERE r.patient_id = ? AND r.status = 'FINALIZED' AND rr.parameter_name_snapshot = ?
       ORDER BY COALESCE(r.finalized_at, r.created_at) ASC`
    )
    .all(patientId, parameterName) as {
    value: string;
    unit: string;
    flag: ResultFlag;
    finalized_at: string | null;
    created_at: string;
    report_no: string;
  }[];

  return rows
    .map((r) => ({
      date: (r.finalized_at || r.created_at).slice(0, 10),
      value: parseFloat(r.value),
      unit: r.unit,
      flag: r.flag,
      report_no: r.report_no,
    }))
    .filter((p) => Number.isFinite(p.value));
}
