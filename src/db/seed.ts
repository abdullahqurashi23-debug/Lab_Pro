// Seeds a fresh database with: the default admin account, 10 test
// categories, and 50 common tests (with parameters, units, and reference
// ranges). Safe to run more than once — everything is skip-if-exists.

import bcrypt from 'bcryptjs';
import { getDb } from './db';
import { createCategory, listCategories } from './repositories/testCategories';
import { createTest, listTests } from './repositories/tests';
import { createUser, hasAnyUsers } from './repositories/users';
import { CATEGORIES, TESTS, type SeedParam } from './seedData';
import type { NewTestParameter } from './repositories/types';

// Derives a formula-friendly code from a parameter name when the seed data
// doesn't set one explicitly (multi-word -> initials, single word -> first
// few letters), disambiguating against codes already used in the same test.
function deriveCode(name: string, used: Set<string>): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  let base = words.length > 1 ? words.map((w) => w[0]).join('').toUpperCase() : (words[0] || 'P').slice(0, 4).toUpperCase();
  if (!/^[A-Z]/.test(base)) base = `P${base}`;

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}${suffix}`;
    suffix++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function toNewParameter(p: SeedParam, index: number, usedCodes: Set<string>): NewTestParameter {
  return {
    name: p.name,
    code: p.code || deriveCode(p.name, usedCodes),
    unit: p.unit || '',
    input_type: p.input_type || 'NUMBER',
    dropdown_options: p.dropdownOptions ? JSON.stringify(p.dropdownOptions) : '',
    formula: p.formula || '',
    ref_male_low: p.maleLow ?? null,
    ref_male_high: p.maleHigh ?? null,
    ref_female_low: p.femaleLow ?? null,
    ref_female_high: p.femaleHigh ?? null,
    ref_child_low: p.childLow ?? null,
    ref_child_high: p.childHigh ?? null,
    ref_text: p.refText || '',
    critical_low: p.criticalLow ?? null,
    critical_high: p.criticalHigh ?? null,
    decimals: p.decimals ?? 2,
    sort_order: index,
  };
}

export function seed(userDataPath?: string) {
  const db = getDb(userDataPath);
  let usersCreated = 0;
  let categoriesCreated = 0;
  let testsCreated = 0;

  const seedTxn = db.transaction(() => {
    if (!hasAnyUsers(db)) {
      createUser(db, {
        username: 'admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        full_name: 'Administrator',
        role: 'ADMIN',
        must_change_password: true,
      });
      usersCreated = 1;
    }

    const existingCategories = new Map(listCategories(db).map((c) => [c.name.toLowerCase(), c]));
    for (const name of CATEGORIES) {
      if (!existingCategories.has(name.toLowerCase())) {
        const created = createCategory(db, { name, sort_order: CATEGORIES.indexOf(name) });
        existingCategories.set(name.toLowerCase(), created);
        categoriesCreated++;
      }
    }

    const existingTests = new Set(listTests(db, true).map((t) => t.short_code.toLowerCase()));
    for (const t of TESTS) {
      if (existingTests.has(t.short_code.toLowerCase())) continue;
      const category = existingCategories.get(t.category.toLowerCase());
      // Reserve explicitly-set codes first so auto-derivation for the rest
      // of this test's parameters never collides with them.
      const usedCodes = new Set(t.parameters.filter((p) => p.code).map((p) => p.code!.toLowerCase()));
      createTest(db, {
        name: t.name,
        short_code: t.short_code,
        category_id: category ? category.id : null,
        price: 0,
        sample_type: t.sample_type,
        report_notes: '',
        parameters: t.parameters.map((p, index) => toNewParameter(p, index, usedCodes)),
      });
      existingTests.add(t.short_code.toLowerCase());
      testsCreated++;
    }
  });

  seedTxn();

  return { usersCreated, categoriesCreated, testsCreated, totalCategories: CATEGORIES.length, totalTests: TESTS.length };
}

// Allow running directly: npm run seed
if (require.main === module) {
  const result = seed();
  console.log(
    `Seed complete. Admin user created: ${result.usersCreated > 0}. Categories: ${result.categoriesCreated} new (of ${result.totalCategories}). Tests: ${result.testsCreated} new (of ${result.totalTests}).`
  );
}
