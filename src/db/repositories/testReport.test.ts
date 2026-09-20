import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createTest } from './tests';
import { createPatient } from './patients';
import { createReport } from './reports';
import { getTestReportForPeriod } from './testReport';

describe('test report — daily / weekly / monthly register', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  function finalizedReportOnDay(daysAgo: number, opts: { price: number; discount?: number; testCount?: number }) {
    const testIds = Array.from({ length: opts.testCount ?? 1 }, (_, i) =>
      createTest(ctx.db, {
        name: `Test ${Math.random()}-${i}`,
        short_code: `T${Math.random().toString(36).slice(2, 8)}`,
        price: opts.price,
        parameters: [],
      }).id
    );
    const patient = createPatient(ctx.db, { full_name: 'Register Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        discount: opts.discount || 0,
        tests: testIds.map((id) => ({ test_id: id, results: [] })),
      },
      null
    );
    const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    ctx.db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_at = ?, created_at = ? WHERE id = ?").run(date, date, report.id);
    return report;
  }

  function draftReport(price: number) {
    const test = createTest(ctx.db, { name: `Draft ${Math.random()}`, short_code: `D${Math.random().toString(36).slice(2, 8)}`, price, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Draft Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    return createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
  }

  it('daily: lists only today\'s finalized reports, excludes yesterday and drafts', () => {
    finalizedReportOnDay(0, { price: 500 });
    finalizedReportOnDay(1, { price: 1000 }); // yesterday
    draftReport(9999); // draft — must never appear

    const result = getTestReportForPeriod(ctx.db, { granularity: 'daily' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].subtotal).toBe(500);
    expect(result.totals.subtotal).toBe(500);
  });

  it('one row per report, with every test on that report joined into test_names', () => {
    finalizedReportOnDay(0, { price: 300, testCount: 3 });

    const result = getTestReportForPeriod(ctx.db, { granularity: 'daily' });
    expect(result.rows).toHaveLength(1);
    const names = result.rows[0].test_names.split(',');
    expect(names).toHaveLength(3);
  });

  it('totals sum subtotal, discount, and total across every row in the period', () => {
    finalizedReportOnDay(0, { price: 1000, discount: 200 });
    finalizedReportOnDay(0, { price: 500, discount: 0 });

    const result = getTestReportForPeriod(ctx.db, { granularity: 'daily' });
    expect(result.totals.subtotal).toBe(1500);
    expect(result.totals.discount).toBe(200);
    expect(result.totals.total).toBe(1300);
  });

  it('weekly includes the last 7 days, excludes something from 10 days ago', () => {
    finalizedReportOnDay(0, { price: 100 });
    finalizedReportOnDay(6, { price: 200 });
    finalizedReportOnDay(10, { price: 5000 });

    const result = getTestReportForPeriod(ctx.db, { granularity: 'weekly' });
    expect(result.rows).toHaveLength(2);
    expect(result.totals.subtotal).toBe(300);
  });

  it('monthly includes everything so far this calendar month', () => {
    finalizedReportOnDay(0, { price: 150 });
    finalizedReportOnDay(2, { price: 250 });

    const result = getTestReportForPeriod(ctx.db, { granularity: 'monthly' });
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.totals.subtotal).toBeGreaterThanOrEqual(400);
  });

  it('never includes a draft report at any granularity', () => {
    draftReport(123456);
    for (const granularity of ['daily', 'weekly', 'monthly'] as const) {
      const result = getTestReportForPeriod(ctx.db, { granularity });
      expect(result.rows).toHaveLength(0);
    }
  });
});
