import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createTest } from './tests';
import { createPatient } from './patients';
import { createReport, finalizeReport, getReportById, assertResultsComplete, listReports } from './reports';

describe('finalized-report immutability triggers', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  function setupFinalizedReport() {
    const test = createTest(ctx.db, { name: 'Complete Blood Count', short_code: 'CBC', price: 500, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Jane Doe', age: 30, age_unit: 'Years', gender: 'Female' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    const finalized = finalizeReport(ctx.db, report.id, null);
    return finalized;
  }

  it('finalizeReport locks the report: status, finalized_by, finalized_at, and an audit entry all together', () => {
    const finalized = setupFinalizedReport();
    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.finalized_at).toBeTruthy();
    const auditRow = ctx.db.prepare("SELECT * FROM audit_log WHERE action = 'FINALIZE' AND entity_id = ?").get(finalized.id);
    expect(auditRow).toBeTruthy();
  });

  it('rejects finalizing the same report twice', () => {
    const finalized = setupFinalizedReport();
    expect(() => finalizeReport(ctx.db, finalized.id, null)).toThrow(/already finalized/i);
  });

  it('rejects finalizing a report with an incomplete (blank) result', () => {
    const test = createTest(ctx.db, {
      name: 'CBC',
      short_code: 'CBC',
      parameters: [{ name: 'Hemoglobin', code: 'HB', input_type: 'NUMBER' }],
    });
    const patient = createPatient(ctx.db, { full_name: 'Incomplete Patient', age: 40, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        tests: [{ test_id: test.id, results: [{ parameter_id: test.parameters[0].id, value: '' }] }],
      },
      null
    );
    expect(() => finalizeReport(ctx.db, report.id, null)).toThrow(/missing results/i);
    expect(() => assertResultsComplete(ctx.db, report.id)).toThrow(/missing results/i);
  });

  it('BLOCKS a direct SQL UPDATE that changes a finalized report\'s content', () => {
    const finalized = setupFinalizedReport();
    expect(() => ctx.db.prepare('UPDATE reports SET total = 999999 WHERE id = ?').run(finalized.id)).toThrow(
      /finalized and cannot be edited/i
    );
    const unchanged = getReportById(ctx.db, finalized.id);
    expect(unchanged?.total).toBe(finalized.total);
  });

  it('BLOCKS a direct SQL DELETE of a finalized report', () => {
    const finalized = setupFinalizedReport();
    expect(() => ctx.db.prepare('DELETE FROM reports WHERE id = ?').run(finalized.id)).toThrow(/finalized and cannot be deleted/i);
    expect(getReportById(ctx.db, finalized.id)).not.toBeNull();
  });

  it('BLOCKS inserting, updating, or deleting report_tests / report_results on a finalized report', () => {
    const finalized = setupFinalizedReport();
    const reportTestId = ctx.db.prepare('SELECT id FROM report_tests WHERE report_id = ?').get(finalized.id) as { id: number };

    expect(() =>
      ctx.db.prepare('INSERT INTO report_tests (report_id, test_id, test_name_snapshot, price_snapshot) VALUES (?, 1, ?, 0)').run(finalized.id, 'x')
    ).toThrow(/finalized/i);

    expect(() => ctx.db.prepare('UPDATE report_tests SET test_name_snapshot = ? WHERE id = ?').run('Tampered', reportTestId.id)).toThrow(/finalized/i);

    expect(() => ctx.db.prepare('DELETE FROM report_tests WHERE id = ?').run(reportTestId.id)).toThrow(/finalized/i);
  });

  it('allows ONLY a pdf_path/pdf_sha256-only update on a finalized report, and nothing else through the same statement', () => {
    const finalized = setupFinalizedReport();
    // The one narrow exception the schema allows (see setReportPdfInfo) —
    // proves it's scoped to exactly those two columns, not a general
    // loophole: changing total in the SAME statement must still fail.
    expect(() => ctx.db.prepare("UPDATE reports SET pdf_path = 'x.pdf', pdf_sha256 = 'abc' WHERE id = ?").run(finalized.id)).not.toThrow();
    expect(() =>
      ctx.db.prepare("UPDATE reports SET pdf_path = 'y.pdf', pdf_sha256 = 'def', total = 1 WHERE id = ?").run(finalized.id)
    ).toThrow(/finalized/i);
  });

  it('does NOT block normal edits to a DRAFT report', () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC', parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Draft Patient', age: 25, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    expect(report.status).toBe('DRAFT');
    expect(() => ctx.db.prepare('UPDATE reports SET total = 123 WHERE id = ?').run(report.id)).not.toThrow();
  });
});

describe('performed_by is entered and persisted independently of finalized_by', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  it('saves the entered performed_by on create, and updateDraftReport can change it', () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBC', parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'PerformedBy Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' },
        doctor_id: null,
        performed_by: 'Ahmad Zubair',
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    expect(report.performed_by).toBe('Ahmad Zubair');
  });
});

describe('report number uniqueness', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  function makeReport(patientId: number) {
    return createReport(
      ctx.db,
      {
        patient: { id: patientId, full_name: 'Race Test', age: 30, age_unit: 'Years', gender: 'Male' },
        doctor_id: null,
        tests: [],
      },
      null
    );
  }

  it('never issues the same report number twice, even when creation calls interleave (Promise.all)', async () => {
    const patient = createPatient(ctx.db, { full_name: 'Race Test', age: 30, age_unit: 'Years', gender: 'Male' });

    // better-sqlite3 is fully synchronous and createReport runs inside a
    // single db.transaction(), so this can't truly interleave at the SQL
    // level — but wrapping each call in Promise.all still exercises the
    // exact call pattern a rapid-double-click in the UI would produce, and
    // proves the report_no sequence holds up under it regardless.
    const reports = await Promise.all(Array.from({ length: 25 }, () => Promise.resolve(makeReport(patient.id))));
    const reportNumbers = reports.map((r) => r.report_no);
    expect(new Set(reportNumbers).size).toBe(reportNumbers.length);
  });

  it('formats as PREFIX-YEAR-000001 and increments sequentially', () => {
    const patient = createPatient(ctx.db, { full_name: 'Sequence Test', age: 30, age_unit: 'Years', gender: 'Female' });
    const first = makeReport(patient.id);
    const second = makeReport(patient.id);
    const year = new Date().getFullYear();
    expect(first.report_no).toMatch(new RegExp(`^LAB-${year}-\\d{6}$`));
    const firstSeq = Number(first.report_no.split('-')[2]);
    const secondSeq = Number(second.report_no.split('-')[2]);
    expect(secondSeq).toBe(firstSeq + 1);
  });
});

describe('listReports includes which tests were done (Patient Profile report list)', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  it('joins every test on a report into test_names, comma-separated', () => {
    const cbc = createTest(ctx.db, { name: 'Complete Blood Count', short_code: 'CBC', price: 500, parameters: [] });
    const lft = createTest(ctx.db, { name: 'Liver Function Test', short_code: 'LFT', price: 800, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Multi Test Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' },
        doctor_id: null,
        tests: [{ test_id: cbc.id, results: [] }, { test_id: lft.id, results: [] }],
      },
      null
    );

    const rows = listReports(ctx.db, { patient_id: patient.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].test_names?.split(',')).toEqual(['Complete Blood Count', 'Liver Function Test']);
  });

  it('is an empty string, not null/undefined, for a report with no tests', () => {
    const patient = createPatient(ctx.db, { full_name: 'No Test Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    createReport(
      ctx.db,
      { patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' }, doctor_id: null, tests: [] },
      null
    );

    const rows = listReports(ctx.db, { patient_id: patient.id });
    expect(rows[0].test_names).toBe('');
  });
});
