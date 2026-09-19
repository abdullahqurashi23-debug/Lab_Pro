import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createPatient, updatePatient, findDuplicatePatient, getPatientById } from './patients';
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

  describe('updatePatient', () => {
    it('updates the fields provided', () => {
      const p = createPatient(ctx.db, { full_name: 'Old Name', age: 20, age_unit: 'Years', gender: 'Male', phone: '111' });
      const updated = updatePatient(ctx.db, p.id, { full_name: 'New Name', age: 21, age_unit: 'Years', gender: 'Male', phone: '111' });
      expect(updated.full_name).toBe('New Name');
      expect(updated.age).toBe(21);
    });

    it('preserves phone/address when the caller omits them, rather than blanking them out', () => {
      const p = createPatient(ctx.db, { full_name: 'Has Phone', age: 20, age_unit: 'Years', gender: 'Male', phone: '0700123456', address: '123 Main St' });
      // Deliberately not passing phone/address at all.
      const updated = updatePatient(ctx.db, p.id, { full_name: 'Has Phone Updated', age: 20, age_unit: 'Years', gender: 'Male' });
      expect(updated.phone).toBe('0700123456');
      expect(updated.address).toBe('123 Main St');
    });

    it('still allows explicitly clearing phone/address with an empty string', () => {
      const p = createPatient(ctx.db, { full_name: 'Clear Me', age: 20, age_unit: 'Years', gender: 'Male', phone: '0700123456' });
      const updated = updatePatient(ctx.db, p.id, { full_name: 'Clear Me', age: 20, age_unit: 'Years', gender: 'Male', phone: '' });
      expect(updated.phone).toBe('');
    });
  });

  describe('createReport with an existing patient id', () => {
    it('applies edits to the existing patient on the very first save, not just later ones', () => {
      const original = createPatient(ctx.db, { full_name: 'Typo Nam', age: 31, age_unit: 'Years', gender: 'Male', phone: '0722000333' });
      const report = createReport(
        ctx.db,
        {
          patient: { id: original.id, full_name: 'Typo Name Corrected', age: 32, age_unit: 'Years', gender: 'Male' },
          doctor_id: null,
          tests: [],
        },
        null
      );
      const updated = getPatientById(ctx.db, original.id);
      expect(updated?.full_name).toBe('Typo Name Corrected');
      expect(updated?.age).toBe(32);
      expect(report.patient_id).toBe(original.id); // same patient row, not a duplicate
    });
  });
});
