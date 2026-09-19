import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createTest } from './tests';
import { createPatient } from './patients';
import { createReport } from './reports';
import { getRevenuePeriodReport } from './revenue';

describe('revenue totals — daily / weekly / monthly', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  function finalizedReportOnDay(daysAgo: number, price: number) {
    const test = createTest(ctx.db, { name: `Test ${Math.random()}`, short_code: `T${Math.random().toString(36).slice(2, 8)}`, price, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Revenue Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    ctx.db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_at = ?, created_at = ? WHERE id = ?").run(date, date, report.id);
    return report;
  }

  function draftReport(price: number) {
    const test = createTest(ctx.db, { name: `Draft Test ${Math.random()}`, short_code: `D${Math.random().toString(36).slice(2, 8)}`, price, parameters: [] });
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

  it('daily: counts only today, excludes yesterday and drafts', () => {
    finalizedReportOnDay(0, 500);
    finalizedReportOnDay(0, 300);
    finalizedReportOnDay(1, 1000); // yesterday — must not count as "today"
    draftReport(9999); // draft — must never count as revenue

    const daily = getRevenuePeriodReport(ctx.db, { granularity: 'daily' });
    expect(daily.current.count).toBe(2);
    expect(daily.current.revenue).toBe(800);
    expect(daily.previous.count).toBe(1);
    expect(daily.previous.revenue).toBe(1000);
  });

  it('weekly: includes the last 7 days, excludes something from 10 days ago', () => {
    finalizedReportOnDay(0, 100);
    finalizedReportOnDay(3, 200);
    finalizedReportOnDay(6, 300);
    finalizedReportOnDay(10, 5000); // outside this week

    const weekly = getRevenuePeriodReport(ctx.db, { granularity: 'weekly' });
    expect(weekly.current.count).toBe(3);
    expect(weekly.current.revenue).toBe(600);
  });

  it('monthly: includes everything so far this calendar month', () => {
    finalizedReportOnDay(0, 150);
    finalizedReportOnDay(2, 250);

    const monthly = getRevenuePeriodReport(ctx.db, { granularity: 'monthly' });
    expect(monthly.current.count).toBeGreaterThanOrEqual(2);
    expect(monthly.current.revenue).toBeGreaterThanOrEqual(400);
  });

  it('custom range: matches an explicit from/to window and computes an equal-length previous period', () => {
    finalizedReportOnDay(1, 400);
    finalizedReportOnDay(5, 600);
    finalizedReportOnDay(9, 99999); // outside the requested range

    const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() - 0 * 86400000).toISOString().slice(0, 10);
    const custom = getRevenuePeriodReport(ctx.db, { granularity: 'custom', from, to });
    expect(custom.current.count).toBe(2);
    expect(custom.current.revenue).toBe(1000);
  });

  it('never counts a draft report toward revenue at any granularity', () => {
    draftReport(123456);
    for (const granularity of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      const report = getRevenuePeriodReport(ctx.db, { granularity });
      expect(report.current.revenue).toBe(0);
      expect(report.current.count).toBe(0);
    }
  });

  it('tracks discounts given within the period', () => {
    const test = createTest(ctx.db, { name: 'Discount Test', short_code: 'DISC', price: 1000, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Discount Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      {
        patient: { id: patient.id, full_name: patient.full_name, age: patient.age, age_unit: patient.age_unit, gender: patient.gender },
        doctor_id: null,
        discount: 200,
        tests: [{ test_id: test.id, results: [] }],
      },
      null
    );
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ');
    ctx.db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_at = ?, created_at = ? WHERE id = ?").run(today, today, report.id);

    const daily = getRevenuePeriodReport(ctx.db, { granularity: 'daily' });
    expect(daily.current.discounts).toBe(200);
    expect(daily.current.revenue).toBe(800); // total is post-discount
  });
});
