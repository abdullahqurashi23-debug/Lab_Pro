import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createTest } from './tests';
import { createPatient } from './patients';
import { createReport } from './reports';
import { getRevenuePeriodReport, resolvePeriod } from './revenue';

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

  it('daily: counts only today (drafts included), excludes yesterday', () => {
    finalizedReportOnDay(0, 500);
    finalizedReportOnDay(0, 300);
    finalizedReportOnDay(1, 1000); // yesterday — must not count as "today"
    draftReport(9999); // saved today as a draft — still counts

    const daily = getRevenuePeriodReport(ctx.db, { granularity: 'daily' });
    expect(daily.current.count).toBe(3);
    expect(daily.current.revenue).toBe(10799);
    expect(daily.previous.count).toBe(1);
    expect(daily.previous.revenue).toBe(1000);
  });

  it('weekly: is the current Monday-Sunday calendar week, not a rolling 7 days', () => {
    // "3 days ago" and "6 days ago" are deliberately NOT used here — which
    // calendar week they fall in depends on which day of the week the
    // test happens to run, so asserting on them would make this test flaky.
    // Today is always in the current week; 8+ days ago never can be
    // (a week is at most 7 days), regardless of today's weekday.
    finalizedReportOnDay(0, 100);
    finalizedReportOnDay(8, 5000); // last week or earlier, whatever today is

    const weekly = getRevenuePeriodReport(ctx.db, { granularity: 'weekly' });
    expect(weekly.current.count).toBe(1);
    expect(weekly.current.revenue).toBe(100);
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

  it('counts a draft report toward revenue at every granularity', () => {
    draftReport(123456);
    for (const granularity of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      const report = getRevenuePeriodReport(ctx.db, { granularity });
      expect(report.current.revenue).toBe(123456);
      expect(report.current.count).toBe(1);
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

describe('weekly period is a real Monday-Sunday calendar week, not a rolling 7 days', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  // Parsed as UTC — resolvePeriod's dates come from SQLite's own UTC
  // date('now'), so comparing them via a UTC-anchored Date avoids the test
  // itself drifting a day depending on the machine's local timezone.
  function dayOfWeekUTC(isoDate: string): number {
    return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  }

  it("this week's start always falls on a Monday, whatever day the test happens to run", () => {
    const period = resolvePeriod(ctx.db, { granularity: 'weekly' });
    expect(dayOfWeekUTC(period.from)).toBe(1); // 0=Sunday, 1=Monday
  });

  it('the previous week is a full, non-overlapping 7-day Monday-Sunday span immediately before this week', () => {
    const period = resolvePeriod(ctx.db, { granularity: 'weekly' });
    expect(dayOfWeekUTC(period.prevFrom)).toBe(1); // Monday
    expect(dayOfWeekUTC(period.prevTo)).toBe(0); // Sunday
    const spanDays = (new Date(`${period.prevTo}T00:00:00Z`).getTime() - new Date(`${period.prevFrom}T00:00:00Z`).getTime()) / 86400000 + 1;
    expect(spanDays).toBe(7);
    const gapDays = (new Date(`${period.from}T00:00:00Z`).getTime() - new Date(`${period.prevTo}T00:00:00Z`).getTime()) / 86400000;
    expect(gapDays).toBe(1); // immediately adjacent, no gap or overlap
  });

  it('a report from exactly 8 days ago (definitely last week or earlier) is excluded from "weekly"', () => {
    const test = createTest(ctx.db, { name: 'Old Week Test', short_code: 'OLDW', price: 999, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Old Week Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    const report = createReport(
      ctx.db,
      { patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' }, doctor_id: null, tests: [{ test_id: test.id, results: [] }] },
      null
    );
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    ctx.db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_at = ?, created_at = ? WHERE id = ?").run(eightDaysAgo, eightDaysAgo, report.id);

    const weekly = getRevenuePeriodReport(ctx.db, { granularity: 'weekly' });
    expect(weekly.current.revenue).toBe(0);
    expect(weekly.current.count).toBe(0);
  });
});

describe('breakdown tables and the day-by-day trend sum back to the period total', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  it('byPaymentMethod, byDoctor, and byCategory each sum exactly to current.revenue', () => {
    const test1 = createTest(ctx.db, { name: 'CBC', short_code: 'CBCX', price: 500, parameters: [] });
    const test2 = createTest(ctx.db, { name: 'LFT', short_code: 'LFTX', price: 700, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Breakdown Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (const [testId, method] of [[test1.id, 'Cash'], [test2.id, 'Card']] as const) {
      const r = createReport(
        ctx.db,
        {
          patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' },
          doctor_id: null,
          payment_method: method,
          tests: [{ test_id: testId, results: [] }],
        },
        null
      );
      ctx.db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_at = ?, created_at = ? WHERE id = ?").run(today, today, r.id);
    }

    const report = getRevenuePeriodReport(ctx.db, { granularity: 'daily' });
    const sum = (rows: { revenue: number }[]) => rows.reduce((s, r) => s + r.revenue, 0);
    expect(sum(report.byPaymentMethod)).toBe(report.current.revenue);
    expect(sum(report.byDoctor)).toBe(report.current.revenue);
    // byCategory/byTest are gross per-test-line revenue (no principled way
    // to attribute a report-level discount back to one test), so they sum
    // to the pre-discount subtotal, not the post-discount total — verified
    // against price_snapshot directly rather than current.revenue.
    expect(sum(report.byCategory)).toBe(500 + 700);
  });

  it("for a custom range, the day-by-day trend sums exactly to current.revenue (trend is NOT a wider window for custom)", () => {
    const test = createTest(ctx.db, { name: 'CBC', short_code: 'CBCY', price: 400, parameters: [] });
    const patient = createPatient(ctx.db, { full_name: 'Trend Patient', age: 30, age_unit: 'Years', gender: 'Male' });
    const today = new Date().toISOString().slice(0, 10);
    const r = createReport(
      ctx.db,
      { patient: { id: patient.id, full_name: patient.full_name, age: 30, age_unit: 'Years', gender: 'Male' }, doctor_id: null, tests: [{ test_id: test.id, results: [] }] },
      null
    );
    ctx.db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_at = ?, created_at = ? WHERE id = ?").run(`${today} 10:00:00`, `${today} 10:00:00`, r.id);

    const report = getRevenuePeriodReport(ctx.db, { granularity: 'custom', from: today, to: today });
    const trendSum = report.trend.reduce((s, t) => s + t.revenue, 0);
    expect(trendSum).toBe(report.current.revenue);
    expect(report.current.revenue).toBe(400);
  });
});
