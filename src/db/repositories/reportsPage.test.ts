import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createTest } from './tests';
import { createPatient } from './patients';
import { createReport, finalizeReport, listReportsPage, getReportById, updateDraftReport } from './reports';
import { recordPayment } from './payments';

describe('listReportsPage — search, filter, sort, pagination', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  function makeFinalized(patientName: string, phone: string, testName: string, total: number) {
    const test = createTest(ctx.db, { name: testName, short_code: `S${Math.random().toString(36).slice(2, 8)}`, price: total, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: patientName, age: 30, age_unit: 'Years', gender: 'Male', phone });
    const report = createReport(
      ctx.db,
      { patient: { id: patient.id, full_name: patientName, age: 30, age_unit: 'Years', gender: 'Male' }, doctor_id: null, tests: [{ test_id: test.id, results: [] }] },
      null
    );
    return finalizeReport(ctx.db, report.id, null);
  }

  it('search matches by report number, patient name, phone, or test name', () => {
    const r1 = makeFinalized('Alice Smith', '0700111222', 'Complete Blood Count', 500);
    makeFinalized('Bob Jones', '0700333444', 'Lipid Profile', 800);

    expect(listReportsPage(ctx.db, { search: r1.report_no }).total).toBe(1);
    expect(listReportsPage(ctx.db, { search: 'Alice' }).total).toBe(1);
    expect(listReportsPage(ctx.db, { search: '0700333444' }).total).toBe(1);
    expect(listReportsPage(ctx.db, { search: 'Lipid' }).total).toBe(1);
    expect(listReportsPage(ctx.db, { search: 'nonexistent' }).total).toBe(0);
  });

  it('search is case-insensitive and matches partial words', () => {
    makeFinalized('Alice Smith', '0700111222', 'Complete Blood Count', 500);
    expect(listReportsPage(ctx.db, { search: 'alice' }).total).toBe(1); // lowercase
    expect(listReportsPage(ctx.db, { search: 'ALICE' }).total).toBe(1); // uppercase
    expect(listReportsPage(ctx.db, { search: 'ali' }).total).toBe(1); // partial word
    expect(listReportsPage(ctx.db, { search: 'smith' }).total).toBe(1); // partial, different case
  });

  it('sorts by total ascending/descending correctly', () => {
    makeFinalized('P1', '1', 'T1', 100);
    makeFinalized('P2', '2', 'T2', 500);
    makeFinalized('P3', '3', 'T3', 300);

    const asc = listReportsPage(ctx.db, { sortKey: 'total', sortDir: 'asc' });
    expect(asc.rows.map((r) => r.total)).toEqual([100, 300, 500]);
    const desc = listReportsPage(ctx.db, { sortKey: 'total', sortDir: 'desc' });
    expect(desc.rows.map((r) => r.total)).toEqual([500, 300, 100]);
  });

  it('paginates without gaps or overlaps', () => {
    for (let i = 0; i < 5; i++) makeFinalized(`Patient ${i}`, String(i), `Test ${i}`, 100);

    const page1 = listReportsPage(ctx.db, { page: 1, pageSize: 2, sortKey: 'created_at', sortDir: 'asc' });
    const page2 = listReportsPage(ctx.db, { page: 2, pageSize: 2, sortKey: 'created_at', sortDir: 'asc' });
    const page3 = listReportsPage(ctx.db, { page: 3, pageSize: 2, sortKey: 'created_at', sortDir: 'asc' });

    expect(page1.total).toBe(5);
    const allIds = [...page1.rows, ...page2.rows, ...page3.rows].map((r) => r.id);
    expect(new Set(allIds).size).toBe(5);
  });
});

describe('payments ledger', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  it('recording a payment reduces outstanding_balance without touching the locked reports row', () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC', price: 1000, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Payer', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      { patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' }, doctor_id: null, paid: 400, tests: [{ test_id: test.id, results: [] }] },
      null
    );
    const finalized = finalizeReport(ctx.db, report.id, null);
    expect(finalized.outstanding_balance).toBe(600);

    const before = ctx.db.prepare('SELECT total, balance, paid, status FROM reports WHERE id = ?').get(finalized.id);
    recordPayment(ctx.db, finalized.id, { amount: 600, method: 'Cash' }, null);
    const after = ctx.db.prepare('SELECT total, balance, paid, status FROM reports WHERE id = ?').get(finalized.id);
    expect(after).toEqual(before); // the finalized row itself never changes

    const reloaded = getReportById(ctx.db, finalized.id);
    expect(reloaded?.outstanding_balance).toBe(0);
    expect(reloaded?.payments).toHaveLength(1);
  });

  it('never reports a negative outstanding_balance when payments exceed what was owed', () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC', price: 1000, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Overpayer', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      { patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' }, doctor_id: null, paid: 0, tests: [{ test_id: test.id, results: [] }] },
      null
    );
    const finalized = finalizeReport(ctx.db, report.id, null);
    expect(finalized.outstanding_balance).toBe(1000);

    // A payment larger than what's actually owed (patient overpays, or a
    // correction overshoots) must never leave the derived "still owed"
    // figure negative — the raw payments ledger itself is untouched.
    recordPayment(ctx.db, finalized.id, { amount: 1500, method: 'Cash' }, null);
    const reloaded = getReportById(ctx.db, finalized.id);
    expect(reloaded?.outstanding_balance).toBe(0);
  });
});

describe('billing math never goes negative', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  it('clamps balance to 0 instead of negative when paid exceeds total (overpayment at creation)', () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC', price: 500, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Overpayer', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' },
        doctor_id: null,
        paid: 800, // more than the 500 subtotal
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    expect(report.total).toBe(500);
    expect(report.paid).toBe(800); // the amount actually collected is preserved exactly
    expect(report.balance).toBe(0); // never negative
  });

  it('clamps discount to the subtotal on create, so Gross - Discount = Net always holds exactly', () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC2', price: 500, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Over-discounted', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' },
        doctor_id: null,
        discount: 5000, // far more than the 500 subtotal
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    expect(report.subtotal).toBe(500);
    expect(report.discount).toBe(500); // clamped down to the subtotal, not stored as 5000
    expect(report.total).toBe(0);
    expect(report.subtotal - report.discount).toBe(report.total); // the identity holds exactly
  });

  it('clamps discount to the subtotal on updateDraftReport too', () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC3', price: 300, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Edited Discount', age: 30, age_unit: 'Years', gender: 'Male' });
    const draft = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' },
        doctor_id: null,
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    const updated = updateDraftReport(ctx.db, draft.id, {
      patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' },
      doctor_id: null,
      discount: 9999,
      tests: [{ test_id: test.id, results: [] }],
    });
    expect(updated.subtotal).toBe(300);
    expect(updated.discount).toBe(300);
    expect(updated.total).toBe(0);
  });
});
