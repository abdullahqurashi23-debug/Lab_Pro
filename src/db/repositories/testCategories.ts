import type Database from 'better-sqlite3';
import type { TestCategory } from './types';

export function listCategories(db: Database.Database): TestCategory[] {
  return db.prepare('SELECT * FROM test_categories ORDER BY sort_order, name').all() as TestCategory[];
}

export function getCategoryById(db: Database.Database, id: number): TestCategory | undefined {
  return db.prepare('SELECT * FROM test_categories WHERE id = ?').get(id) as TestCategory | undefined;
}

export function createCategory(db: Database.Database, input: { name: string; sort_order?: number }): TestCategory {
  const info = db
    .prepare('INSERT INTO test_categories (name, sort_order) VALUES (?, ?)')
    .run(input.name, input.sort_order ?? 0);
  return getCategoryById(db, info.lastInsertRowid as number) as TestCategory;
}

export function updateCategory(
  db: Database.Database,
  id: number,
  input: { name: string; sort_order?: number }
): TestCategory {
  db.prepare('UPDATE test_categories SET name = ?, sort_order = ? WHERE id = ?').run(
    input.name,
    input.sort_order ?? 0,
    id
  );
  return getCategoryById(db, id) as TestCategory;
}

// Sets sort_order to match the given order of ids (0, 1, 2, ...) — the
// drag-to-reorder UI sends the full list every time it changes.
export function reorderCategories(db: Database.Database, orderedIds: number[]): TestCategory[] {
  const update = db.prepare('UPDATE test_categories SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  txn();
  return listCategories(db);
}

export function deleteCategory(db: Database.Database, id: number): { deleted: boolean } {
  const category = getCategoryById(db, id);
  if (!category) return { deleted: false };
  const usage = db.prepare('SELECT COUNT(*) as n FROM tests WHERE category_id = ?').get(id) as { n: number };
  if (usage.n > 0) {
    throw new Error(`Cannot delete "${category.name}" — ${usage.n} test(s) still use this category.`);
  }
  db.prepare('DELETE FROM test_categories WHERE id = ?').run(id);
  return { deleted: true };
}
