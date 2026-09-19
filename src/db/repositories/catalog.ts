// Full test-catalog import/export as JSON — categories, tests, and every
// parameter, in one portable file. Distinct from the (older, flatter)
// Excel import/export in src/db/excel.ts, which only round-trips the flat
// test fields and can't carry parameters.

import type Database from 'better-sqlite3';
import { listCategories, createCategory } from './testCategories';
import { listTests, createTest } from './tests';
import type { NewTest, NewTestParameter, TestWithParameters } from './types';

export interface CatalogExport {
  exportedAt: string;
  categories: { name: string; sort_order: number }[];
  tests: (Omit<NewTest, 'category_id'> & { category_name: string | null })[];
}

function toExportedParameter(p: TestWithParameters['parameters'][number]): NewTestParameter {
  const { id: _id, test_id: _testId, ...rest } = p;
  return rest;
}

export function exportCatalogToJson(db: Database.Database): CatalogExport {
  const categories = listCategories(db).map((c) => ({ name: c.name, sort_order: c.sort_order }));
  const tests = listTests(db, true).map((t) => ({
    name: t.name,
    short_code: t.short_code,
    category_name: t.category_name,
    price: t.price,
    sample_type: t.sample_type,
    report_notes: t.report_notes,
    is_active: !!t.is_active,
    parameters: t.parameters.map(toExportedParameter),
  }));
  return { exportedAt: new Date().toISOString(), categories, tests };
}

export interface CatalogImportInput {
  categories: { name: string; sort_order?: number }[];
  tests: (Omit<NewTest, 'category_id'> & { category_name?: string | null })[];
}

export interface CatalogImportResult {
  categoriesCreated: number;
  testsInserted: number;
  testsSkipped: number;
  errors: string[];
}

export function importCatalogFromJson(db: Database.Database, data: CatalogImportInput): CatalogImportResult {
  const result: CatalogImportResult = { categoriesCreated: 0, testsInserted: 0, testsSkipped: 0, errors: [] };

  const txn = db.transaction(() => {
    const categoryByName = new Map(listCategories(db).map((c) => [c.name.toLowerCase(), c.id]));

    for (const cat of data.categories) {
      if (!categoryByName.has(cat.name.toLowerCase())) {
        const created = createCategory(db, { name: cat.name, sort_order: cat.sort_order });
        categoryByName.set(cat.name.toLowerCase(), created.id);
        result.categoriesCreated++;
      }
    }

    const existingCodes = new Set(listTests(db, true).map((t) => t.short_code.toLowerCase()));

    for (const t of data.tests) {
      if (existingCodes.has(t.short_code.toLowerCase())) {
        result.testsSkipped++;
        result.errors.push(`Skipped "${t.name}" — short code "${t.short_code}" already exists.`);
        continue;
      }
      let categoryId: number | null = null;
      if (t.category_name) {
        const existing = categoryByName.get(t.category_name.toLowerCase());
        if (existing) {
          categoryId = existing;
        } else {
          const created = createCategory(db, { name: t.category_name });
          categoryByName.set(t.category_name.toLowerCase(), created.id);
          categoryId = created.id;
          result.categoriesCreated++;
        }
      }
      try {
        createTest(db, { ...t, category_id: categoryId });
        existingCodes.add(t.short_code.toLowerCase());
        result.testsInserted++;
      } catch (err) {
        result.testsSkipped++;
        result.errors.push(err instanceof Error ? err.message : `Failed to import "${t.name}".`);
      }
    }
  });

  txn();
  return result;
}
