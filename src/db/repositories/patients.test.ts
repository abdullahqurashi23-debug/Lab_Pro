import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createPatient, findDuplicatePatient, getPatientById } from './patients';
import { createReport } from './reports';

describe('patients', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  describe('gender', () => {
    it('accepts Male, Female, and Other', () => {
      expect(createPatient(ctx.db, { full_name: 'A', age: 1, age_unit: 'Years', gender: 'Male' }).gender).toBe('Male');
      expect(createPatient(ctx.db, { full_name: 'B', age: 1, age_unit: 'Years', gender: 'Female' }).gender).toBe('Female');
      expect(createPatient(ctx.db, { full_name: 'C', age: 1, age_unit: 'Years', gender: 'Other' }).gender).toBe('Other');
    });

    it('still rejects a value outside the allowed set at the database level', () => {
      expect(() => ctx.db.prepare("INSERT INTO patients (full_name, gender) VALUES ('X', 'Alien')").run()).toThrow(/CHECK constraint/i);
    });
  });

  describe('findDuplicatePatient', () => {
    it('matches on exact name AND phone together', () => {
      createPatient(ctx.db, { full_name: 'Alice Payer', age: 40, age_unit: 'Years', gender: 'Female', phone: '0700000001' });
      const match = findDuplicatePatient(ctx.db, 'Alice Payer', '0700000001');
      expect(match?.full_name).toBe('Alice Payer');
    });

    it('does NOT match on name alone or phone alone', () => {
      createPatient(ctx.db, { full_name: 'Alice Payer', age: 40, age_unit: 'Years', gender: 'Female', phone: '0700000001' });
      expect(findDuplicatePatient(ctx.db, 'Alice Payer', '0799999999')).toBeUndefined();
      expect(findDuplicatePatient(ctx.db, 'Someone Else', '0700000001')).toBeUndefined();
    });
  });

  describe('saved patient details are locked', () => {
    it('BLOCKS changing name, age, gender or contact details with direct SQL', () => {
      const p = createPatient(ctx.db, { full_name: 'Locked Name', age: 20, age_unit: 'Years', gender: 'Male', phone: '111' });
      expect(() => ctx.db.prepare("UPDATE patients SET full_name = 'Changed' WHERE id = ?").run(p.id)).toThrow(/locked/i);
      expect(() => ctx.db.prepare('UPDATE patients SET age = 99 WHERE id = ?').run(p.id)).toThrow(/locked/i);
      expect(() => ctx.db.prepare("UPDATE patients SET gender = 'Female' WHERE id = ?").run(p.id)).toThrow(/locked/i);
      expect(() => ctx.db.prepare("UPDATE patients SET phone = '222' WHERE id = ?").run(p.id)).toThrow(/locked/i);
      expect(getPatientById(ctx.db, p.id)?.full_name).toBe('Locked Name');
    });

    it('saves the chosen title and locks it with the other details', () => {
      const p = createPatient(ctx.db, { title: 'Mrs.', full_name: 'Titled', age: 40, age_unit: 'Years', gender: 'Female' });
      expect(p.title).toBe('Mrs.');
      expect(() => ctx.db.prepare("UPDATE patients SET title = 'Miss' WHERE id = ?").run(p.id)).toThrow(/locked/i);
    });

    it('still assigns a patient code to every new patient', () => {
      const p = createPatient(ctx.db, { full_name: 'Coded', age: 20, age_unit: 'Years', gender: 'Male' });
      expect(p.patient_code).toMatch(/^P-\d{6}$/);
    });
  });

  describe('createReport with an existing patient id', () => {
    it('uses the saved patient exactly as stored and ignores edited details', () => {
      const original = createPatient(ctx.db, { full_name: 'Stored Name', age: 31, age_unit: 'Years', gender: 'Male', phone: '0722000333' });
      const report = createReport(
        ctx.db,
        {
          patient: { id: original.id, full_name: 'Tampered Name', age: 99, age_unit: 'Years', gender: 'Female' },
          doctor_id: null,
          tests: [],
        },
        null
      );
      const after = getPatientById(ctx.db, original.id);
      expect(after?.full_name).toBe('Stored Name');
      expect(after?.age).toBe(31);
      expect(report.patient_id).toBe(original.id);
    });
  });
});