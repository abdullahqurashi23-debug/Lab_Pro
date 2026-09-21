// Seeds a fresh database with: the default admin account, 10 test
// categories, and 50 common tests (with parameters, units, and reference
// ranges). Safe to run more than once — everything is skip-if-exists.

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from './db';
import { createCategory, listCategories } from './repositories/testCategories';
import { createTest, listTests } from './repositories/tests';
import { createUser, hasAnyUsers } from './repositories/users';
import { CATEGORIES, TESTS, type SeedParam } from './seedData';
import type { NewTestParameter } from './repositories/types';

// A fixed "admin123" default (the previous behavior) is guessable and,
// worse, identical across every single LabCore install ever seeded from
// this same source — one leaked or guessed password would work on every
// lab's install everywhere. This generates a unique, high-entropy
// password per install instead (~80 bits from a 54-character alphabet,
// no visually-ambiguous characters like 0/O/1/l/I since it has to be
// typed once by hand), and only that one plaintext copy is ever written
// to disk, right next to the database, purely so the person setting up
// this specific install can find it — must_change_password (already set
// below) forces a real password to replace it on first login regardless.
const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generateStrongPassword(length = 14): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  return out;
}

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
  let generatedPassword: string | null = null;

  const seedTxn = db.transaction(() => {
    if (!hasAnyUsers(db)) {
      generatedPassword = generateStrongPassword();
      createUser(db, {
        username: 'admin',
        password_hash: bcrypt.hashSync(generatedPassword, 10),
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

  if (generatedPassword) {
    const dataDir = userDataPath || path.join(__dirname, '..', '..', '..', 'data');
    const readmePath = path.join(dataDir, 'ADMIN-PASSWORD.txt');
    fs.writeFileSync(
      readmePath,
      `LabCore — first-time admin login\n\n` +
        `Username: admin\n` +
        `Password: ${generatedPassword}\n\n` +
        `This password is unique to this install (a different one is generated every time\n` +
        `LabCore is set up on a new computer) — it is not the same for every install.\n` +
        `You'll be asked to set your own password immediately after logging in with it once.\n\n` +
        `Delete this file after you've logged in and set your own password.\n`
    );
  }

  return {
    usersCreated,
    categoriesCreated,
    testsCreated,
    totalCategories: CATEGORIES.length,
    totalTests: TESTS.length,
    generatedPassword,
  };
}

// Allow running directly: npm run seed
if (require.main === module) {
  const result = seed();
  console.log(
    `Seed complete. Admin user created: ${result.usersCreated > 0}. Categories: ${result.categoriesCreated} new (of ${result.totalCategories}). Tests: ${result.testsCreated} new (of ${result.totalTests}).`
  );
  if (result.generatedPassword) {
    console.log(`Admin login — username: admin, password: ${result.generatedPassword} (also saved to data/ADMIN-PASSWORD.txt)`);
  }
}
