import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createTechnician, listTechnicians, deleteTechnician } from './technicians';
import { createTest } from './tests';
import { createPatient } from './patients';
import { createReport } from './reports';

describe('technicians — saved "Performed By" list', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  it('creates and lists technicians alphabetically', () => {
    createTechnician(ctx.db, { name: 'Zubair' });
    createTechnician(ctx.db, { name: 'Amina' });
    const rows = listTechnicians(ctx.db);
    expect(rows.map((t) => t.name)).toEqual(['Amina', 'Zubair']);
  });

  it('blocks deleting a technician recorded as having performed a report', () => {
    const tech = createTechnician(ctx.db, { name: 'Bilal' });
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC', price: 100, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        performed_by: tech.name,
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );

    expect(() => deleteTechnician(ctx.db, tech.id)).toThrow(/recorded as having performed/i);
  });

  it('allows deleting a technician never referenced by any report', () => {
    const tech = createTechnician(ctx.db, { name: 'Unused' });
    expect(deleteTechnician(ctx.db, tech.id)).toEqual({ deleted: true });
    expect(listTechnicians(ctx.db)).toHaveLength(0);
  });
});
