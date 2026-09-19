import type Database from 'better-sqlite3';
import type { NewTest, NewTestParameter, Test, TestParameter, TestWithParameters } from './types';

function getParametersForTest(db: Database.Database, testId: number): TestParameter[] {
  return db
    .prepare('SELECT * FROM test_parameters WHERE test_id = ? ORDER BY sort_order, id')
    .all(testId) as TestParameter[];
}

export function getTestById(db: Database.Database, id: number): TestWithParameters | undefined {
  const test = db
    .prepare(
      `SELECT tests.*, test_categories.name as category_name
       FROM tests
       LEFT JOIN test_categories ON test_categories.id = tests.category_id
       WHERE tests.id = ?`
    )
    .get(id) as (Test & { category_name: string | null }) | undefined;
  if (!test) return undefined;
  return { ...test, parameters: getParametersForTest(db, id) };
}

export function listTests(db: Database.Database, includeInactive = false): TestWithParameters[] {
  const query = `
    SELECT tests.*, test_categories.name as category_name
    FROM tests
    LEFT JOIN test_categories ON test_categories.id = tests.category_id
    ${includeInactive ? '' : 'WHERE tests.is_active = 1'}
    ORDER BY test_categories.sort_order, tests.name
  `;
  const rows = db.prepare(query).all() as (Test & { category_name: string | null })[];
  return rows.map((row) => ({ ...row, parameters: getParametersForTest(db, row.id) }));
}

function assertUnique(db: Database.Database, name: string, shortCode: string, excludeId?: number) {
  const nameClash = db
    .prepare('SELECT id, name FROM tests WHERE LOWER(name) = LOWER(?) AND id != ?')
    .get(name, excludeId ?? -1) as { id: number; name: string } | undefined;
  if (nameClash) throw new Error(`A test named "${nameClash.name}" already exists.`);
  const codeClash = db
    .prepare('SELECT id, short_code FROM tests WHERE LOWER(short_code) = LOWER(?) AND id != ?')
    .get(shortCode, excludeId ?? -1) as { id: number; short_code: string } | undefined;
  if (codeClash) throw new Error(`Short code "${codeClash.short_code}" is already used by another test.`);
}

function assertUniqueParamCodes(parameters: NewTestParameter[]) {
  const seen = new Map<string, string>();
  for (const p of parameters) {
    const code = (p.code || '').trim();
    if (!code) continue;
    const key = code.toLowerCase();
    const clash = seen.get(key);
    if (clash) throw new Error(`Parameter code "${code}" is used more than once in this test (also on "${clash}").`);
    seen.set(key, p.name);
  }
}

function insertParameters(db: Database.Database, testId: number, parameters: NewTestParameter[]) {
  assertUniqueParamCodes(parameters);
  const insert = db.prepare(
    `INSERT INTO test_parameters
       (test_id, name, code, unit, input_type, dropdown_options, formula,
        ref_male_low, ref_male_high, ref_female_low, ref_female_high,
        ref_child_low, ref_child_high, ref_text, critical_low, critical_high,
        decimals, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  parameters.forEach((p, index) => {
    insert.run(
      testId,
      p.name,
      (p.code || '').trim() || null,
      p.unit || '',
      p.input_type || 'NUMBER',
      p.dropdown_options || '',
      p.formula || '',
      p.ref_male_low ?? null,
      p.ref_male_high ?? null,
      p.ref_female_low ?? null,
      p.ref_female_high ?? null,
      p.ref_child_low ?? null,
      p.ref_child_high ?? null,
      p.ref_text || '',
      p.critical_low ?? null,
      p.critical_high ?? null,
      p.decimals ?? 2,
      p.sort_order ?? index
    );
  });
}

export function createTest(db: Database.Database, input: NewTest): TestWithParameters {
  assertUnique(db, input.name, input.short_code);
  const txn = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO tests (name, short_code, category_id, price, sample_type, report_notes, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.name,
        input.short_code,
        input.category_id ?? null,
        input.price ?? 0,
        input.sample_type || '',
        input.report_notes || '',
        input.is_active === false ? 0 : 1
      );
    const testId = info.lastInsertRowid as number;
    if (input.parameters && input.parameters.length > 0) {
      insertParameters(db, testId, input.parameters);
    }
    return testId;
  });
  const testId = txn();
  return getTestById(db, testId) as TestWithParameters;
}

// Updates a test's parameter list in place: rows whose id matches an
// existing parameter are UPDATEd (never deleted+reinserted), new entries
// are INSERTed, and entries dropped from the list are DELETEd — but ONLY
// if they have no recorded report_results. report_results.parameter_id is
// a real foreign key with no ON DELETE clause, so deleting a row it points
// at would crash with a constraint violation; removing a parameter that
// already has results is refused with a clear error instead, matching how
// deleteTest() refuses to delete a test that's in use.
function syncParameters(db: Database.Database, testId: number, parameters: NewTestParameter[]) {
  assertUniqueParamCodes(parameters);

  const existingIds = new Set(
    (db.prepare('SELECT id FROM test_parameters WHERE test_id = ?').all(testId) as { id: number }[]).map((r) => r.id)
  );
  const keptIds = new Set(
    parameters.filter((p): p is NewTestParameter & { id: number } => p.id != null && existingIds.has(p.id)).map((p) => p.id)
  );
  const removedIds = [...existingIds].filter((existingId) => !keptIds.has(existingId));

  if (removedIds.length > 0) {
    const placeholders = removedIds.map(() => '?').join(',');
    const inUse = db
      .prepare(
        `SELECT test_parameters.name, COUNT(report_results.id) as n
         FROM test_parameters
         LEFT JOIN report_results ON report_results.parameter_id = test_parameters.id
         WHERE test_parameters.id IN (${placeholders})
         GROUP BY test_parameters.id
         HAVING n > 0`
      )
      .all(...removedIds) as { name: string; n: number }[];
    if (inUse.length > 0) {
      const names = inUse.map((u) => `"${u.name}"`).join(', ');
      throw new Error(
        `Cannot remove parameter(s) ${names} — they already have results recorded in a report. Deactivate the test instead of removing a parameter that's in use.`
      );
    }
    db.prepare(`DELETE FROM test_parameters WHERE id IN (${placeholders})`).run(...removedIds);
  }

  const update = db.prepare(
    `UPDATE test_parameters SET
       name=?, code=?, unit=?, input_type=?, dropdown_options=?, formula=?,
       ref_male_low=?, ref_male_high=?, ref_female_low=?, ref_female_high=?,
       ref_child_low=?, ref_child_high=?, ref_text=?, critical_low=?, critical_high=?,
       decimals=?, sort_order=?
     WHERE id = ?`
  );
  const insert = db.prepare(
    `INSERT INTO test_parameters
       (test_id, name, code, unit, input_type, dropdown_options, formula,
        ref_male_low, ref_male_high, ref_female_low, ref_female_high,
        ref_child_low, ref_child_high, ref_text, critical_low, critical_high,
        decimals, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  parameters.forEach((p, index) => {
    const values = [
      p.name,
      (p.code || '').trim() || null,
      p.unit || '',
      p.input_type || 'NUMBER',
      p.dropdown_options || '',
      p.formula || '',
      p.ref_male_low ?? null,
      p.ref_male_high ?? null,
      p.ref_female_low ?? null,
      p.ref_female_high ?? null,
      p.ref_child_low ?? null,
      p.ref_child_high ?? null,
      p.ref_text || '',
      p.critical_low ?? null,
      p.critical_high ?? null,
      p.decimals ?? 2,
      p.sort_order ?? index,
    ] as const;

    if (p.id != null && keptIds.has(p.id)) {
      update.run(...values, p.id);
    } else {
      insert.run(testId, ...values);
    }
  });
}

export function updateTest(db: Database.Database, id: number, input: NewTest): TestWithParameters {
  assertUnique(db, input.name, input.short_code, id);
  const txn = db.transaction(() => {
    db.prepare(
      'UPDATE tests SET name = ?, short_code = ?, category_id = ?, price = ?, sample_type = ?, report_notes = ?, is_active = ? WHERE id = ?'
    ).run(
      input.name,
      input.short_code,
      input.category_id ?? null,
      input.price ?? 0,
      input.sample_type || '',
      input.report_notes || '',
      input.is_active === false ? 0 : 1,
      id
    );
    if (input.parameters) {
      syncParameters(db, id, input.parameters);
    }
  });
  txn();
  return getTestById(db, id) as TestWithParameters;
}

export function deactivateTest(db: Database.Database, id: number): TestWithParameters {
  db.prepare('UPDATE tests SET is_active = 0 WHERE id = ?').run(id);
  return getTestById(db, id) as TestWithParameters;
}

export function activateTest(db: Database.Database, id: number): TestWithParameters {
  db.prepare('UPDATE tests SET is_active = 1 WHERE id = ?').run(id);
  return getTestById(db, id) as TestWithParameters;
}

export function deleteTest(db: Database.Database, id: number): { deleted: boolean } {
  const test = getTestById(db, id);
  if (!test) return { deleted: false };
  const usage = db.prepare('SELECT COUNT(*) as n FROM report_tests WHERE test_id = ?').get(id) as { n: number };
  if (usage.n > 0) {
    throw new Error(
      `Cannot delete "${test.name}" — it is used in ${usage.n} report(s). Deactivate it instead so historical records stay intact.`
    );
  }
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM test_parameters WHERE test_id = ?').run(id);
    db.prepare('DELETE FROM tests WHERE id = ?').run(id);
  });
  txn();
  return { deleted: true };
}
