// Seeds a throwaway database with ~10,000 realistic reports (patients,
// tests, results, spread across a year, mostly finalized) and times the
// queries that matter for a snappy UI: dashboard load, reports search,
// revenue rollups, and patient search. Run with:
//   ELECTRON_BIN=$(node -e "console.log(require('electron'))") && "$ELECTRON_BIN" scripts/perf_10k_reports.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const DIST = path.join(__dirname, '..', 'dist-electron', 'src', 'db');
const { runMigrations } = require(path.join(DIST, 'migrate.js'));
const dashboardRepo = require(path.join(DIST, 'repositories', 'dashboard.js'));
const revenueRepo = require(path.join(DIST, 'repositories', 'revenue.js'));
const reportsRepo = require(path.join(DIST, 'repositories', 'reports.js'));
const patientsRepo = require(path.join(DIST, 'repositories', 'patients.js'));

const REPORT_COUNT = 10000;
const PATIENT_COUNT = 2500; // reports reuse patients, like a real repeat-visit population
const TEST_COUNT = 40;
const DOCTOR_COUNT = 30;

const tmpFile = path.join(os.tmpdir(), `labpro-perf-${Date.now()}.db`);
const db = new Database(tmpFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db, path.join(DIST, 'migrations'));

function timeIt(label, fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`${ms.toFixed(1).padStart(8)} ms  ${label}`);
  return result;
}

console.log(`Seeding ${PATIENT_COUNT} patients, ${TEST_COUNT} tests, ${DOCTOR_COUNT} doctors, ${REPORT_COUNT} reports...`);

const FIRST_NAMES = ['Ahmad', 'Fatima', 'Ali', 'Zainab', 'Hassan', 'Amina', 'Karim', 'Layla', 'Omar', 'Sara'];
const LAST_NAMES = ['Khan', 'Rahimi', 'Ahmadi', 'Karimi', 'Yusufi', 'Sadiqi', 'Noori', 'Popal', 'Wardak', 'Sultani'];
const CATEGORIES = ['Hematology', 'Biochemistry', 'Hormones', 'Serology', 'Microbiology'];

const seedTxn = db.transaction(() => {
  const categoryIds = CATEGORIES.map((name) => db.prepare('INSERT INTO test_categories (name) VALUES (?)').run(name).lastInsertRowid);

  const tests = [];
  for (let i = 0; i < TEST_COUNT; i++) {
    const catId = categoryIds[i % categoryIds.length];
    const info = db
      .prepare('INSERT INTO tests (name, short_code, category_id, price) VALUES (?, ?, ?, ?)')
      .run(`Test ${i}`, `T${i}`, catId, 200 + (i % 20) * 50);
    const testId = info.lastInsertRowid;
    db.prepare(
      `INSERT INTO test_parameters (test_id, name, code, unit, input_type, ref_male_low, ref_male_high, ref_female_low, ref_female_high)
       VALUES (?, 'Value', 'VAL', 'unit', 'NUMBER', 10, 20, 10, 20)`
    ).run(testId);
    tests.push(testId);
  }

  const doctorIds = [];
  for (let i = 0; i < DOCTOR_COUNT; i++) {
    doctorIds.push(db.prepare('INSERT INTO doctors (name) VALUES (?)').run(`Dr. ${LAST_NAMES[i % LAST_NAMES.length]} ${i}`).lastInsertRowid);
  }

  const patientIds = [];
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]} ${i}`;
    const info = db
      .prepare("INSERT INTO patients (full_name, age, age_unit, gender, phone) VALUES (?, ?, 'Years', ?, ?)")
      .run(name, 5 + (i % 80), i % 2 === 0 ? 'Male' : 'Female', `07${String(10000000 + i).padStart(8, '0')}`);
    patientIds.push(info.lastInsertRowid);
  }

  // Every report is inserted as a DRAFT first, its tests/results attached
  // (the immutability triggers only allow that while still a draft), and
  // ONLY THEN flipped to FINALIZED with a single UPDATE — inserting it
  // pre-finalized would have the same triggers correctly reject the
  // report_tests/report_results inserts that follow.
  const insertReport = db.prepare(
    `INSERT INTO reports (report_no, patient_id, doctor_id, status, subtotal, discount, total, paid, balance, payment_method, notes, created_at)
     VALUES (?, ?, ?, 'DRAFT', ?, 0, ?, ?, ?, 'Cash', '', ?)`
  );
  const finalizeReport = db.prepare("UPDATE reports SET status = 'FINALIZED', finalized_at = ? WHERE id = ?");
  const insertReportTest = db.prepare('INSERT INTO report_tests (report_id, test_id, test_name_snapshot, price_snapshot) VALUES (?, ?, ?, ?)');
  const insertResult = db.prepare(
    `INSERT INTO report_results (report_test_id, parameter_id, parameter_name_snapshot, unit_snapshot, ref_range_snapshot, value, flag)
     VALUES (?, ?, 'Value', 'unit', '10 - 20 unit', ?, ?)`
  );

  const now = Date.now();
  for (let i = 0; i < REPORT_COUNT; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const dateStr = new Date(now - daysAgo * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const patientId = patientIds[i % patientIds.length];
    const doctorId = Math.random() < 0.85 ? doctorIds[i % doctorIds.length] : null;
    const willFinalize = Math.random() < 0.95;
    const testId = tests[i % tests.length];
    const price = 200 + (i % 20) * 50;

    const reportNo = `LAB-${new Date(now - daysAgo * 86400000).getFullYear()}-${String(i).padStart(6, '0')}`;
    const info = insertReport.run(reportNo, patientId, doctorId, price, price, price, price, dateStr);
    const reportId = info.lastInsertRowid;
    const rtInfo = insertReportTest.run(reportId, testId, `Test ${testId % TEST_COUNT}`, price);
    const value = (10 + Math.random() * 15).toFixed(1);
    insertResult.run(rtInfo.lastInsertRowid, null, value, value > 20 ? 'HIGH' : 'NORMAL');

    if (willFinalize) {
      finalizeReport.run(dateStr, reportId);
    }
  }
});

const seedStart = process.hrtime.bigint();
seedTxn();
const seedMs = Number(process.hrtime.bigint() - seedStart) / 1e6;
console.log(`Seed complete in ${(seedMs / 1000).toFixed(2)}s\n`);

console.log('=== Query timings (single run each, cold cache) ===');
timeIt('dashboard.getDashboardStats()', () => dashboardRepo.getDashboardStats(db));
timeIt('revenue.getRevenuePeriodReport(monthly)', () => revenueRepo.getRevenuePeriodReport(db, { granularity: 'monthly' }));
timeIt('revenue.getRevenuePeriodReport(yearly)', () => revenueRepo.getRevenuePeriodReport(db, { granularity: 'yearly' }));
timeIt('revenue.listOutstandingBalances()', () => revenueRepo.listOutstandingBalances(db));
timeIt('reports.listReportsPage() — no filters, page 1', () => reportsRepo.listReportsPage(db, { page: 1, pageSize: 20 }));
timeIt('reports.listReportsPage() — search by patient name substring', () =>
  reportsRepo.listReportsPage(db, { search: 'Ahmad Khan', page: 1, pageSize: 20 })
);
timeIt('reports.listReportsPage() — search by phone', () => reportsRepo.listReportsPage(db, { search: '0710005000', page: 1, pageSize: 20 }));
timeIt('reports.listReportsPage() — search by test name', () => reportsRepo.listReportsPage(db, { search: 'Test 5', page: 1, pageSize: 20 }));
timeIt('reports.listReportsPage() — status+doctor filter, sorted by total', () =>
  reportsRepo.listReportsPage(db, { status: 'FINALIZED', doctor_id: 1, sortKey: 'total', sortDir: 'desc', page: 1, pageSize: 20 })
);
timeIt('reports.searchReports() — TopBar global search', () => reportsRepo.searchReports(db, 'Fatima'));
timeIt('patients.listPatientsWithStats() — no search (full list w/ per-patient aggregates)', () => patientsRepo.listPatientsWithStats(db));
timeIt('patients.searchPatients() — substring', () => patientsRepo.searchPatients(db, 'Khan'));

console.log('\n=== EXPLAIN QUERY PLAN for the search LIKE query (confirms full scan vs index use) ===');
const plan = db
  .prepare(
    `EXPLAIN QUERY PLAN
     SELECT reports.* FROM reports
     JOIN patients ON patients.id = reports.patient_id
     LEFT JOIN doctors ON doctors.id = reports.doctor_id
     WHERE reports.report_no LIKE '%x%' OR patients.full_name LIKE '%x%' OR patients.phone LIKE '%x%'`
  )
  .all();
plan.forEach((row) => console.log(' ', row.detail));

db.close();
fs.unlinkSync(tmpFile);
try {
  fs.unlinkSync(tmpFile + '-wal');
  fs.unlinkSync(tmpFile + '-shm');
} catch {}
console.log('\nDone. Temp database cleaned up.');
