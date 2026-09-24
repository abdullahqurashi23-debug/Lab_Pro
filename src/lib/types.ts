// Shared types for data that crosses the IPC boundary between the Electron
// main process (src/db/repositories/*.ts) and the React renderer. This is
// the renderer's own copy, mirroring src/db/repositories/types.ts — the two
// sides are separate TypeScript build boundaries (tsc for electron/ + src/db,
// Vite for the rest of src/), so each owns its copy of the shapes.

export type Role = 'ADMIN' | 'TECHNICIAN' | 'RECEPTION';

export interface PublicUser {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: number;
  must_change_password: number;
  created_at: string;
}

export type AgeUnit = 'Years' | 'Months' | 'Days';
export type Gender = 'Male' | 'Female' | 'Other';

export interface Patient {
  id: number;
  patient_code: string;
  full_name: string;
  age: number | null;
  age_unit: AgeUnit;
  gender: Gender | null;
  phone: string;
  address: string;
  created_at: string;
}

export interface PatientWithStats extends Patient {
  report_count: number;
  last_visit: string | null;
}

export interface Doctor {
  id: number;
  name: string;
  clinic: string;
  phone: string;
}

export interface Technician {
  id: number;
  name: string;
}

export interface TestCategory {
  id: number;
  name: string;
  sort_order: number;
}

export type InputType = 'NUMBER' | 'TEXT' | 'DROPDOWN' | 'FORMULA';

export interface TestParameter {
  id: number;
  test_id: number;
  name: string;
  // Short formula-friendly identifier (e.g. "TC", "HDL") distinct from the
  // display name — FORMULA-type parameters reference these, never `name`.
  code: string;
  unit: string;
  input_type: InputType;
  dropdown_options: string;
  formula: string;
  ref_male_low: number | null;
  ref_male_high: number | null;
  ref_female_low: number | null;
  ref_female_high: number | null;
  ref_child_low: number | null;
  ref_child_high: number | null;
  ref_text: string;
  critical_low: number | null;
  critical_high: number | null;
  decimals: number;
  sort_order: number;
}

// `id` is optional and only meaningful on update: present + matching an
// existing row -> update that row in place; absent (or not matching) ->
// insert as new.
export type NewTestParameter = Pick<TestParameter, 'name'> &
  Partial<Omit<TestParameter, 'test_id' | 'name'>>;

export interface Test {
  id: number;
  name: string;
  short_code: string;
  category_id: number | null;
  price: number;
  sample_type: string;
  report_notes: string;
  is_active: number;
  created_at: string;
}

export interface TestWithParameters extends Test {
  category_name: string | null;
  parameters: TestParameter[];
}

export type NewTest = Pick<Test, 'name' | 'short_code'> &
  Partial<Pick<Test, 'category_id' | 'price' | 'sample_type' | 'report_notes'>> & {
    is_active?: boolean;
    parameters?: NewTestParameter[];
  };

export type ReportStatus = 'DRAFT' | 'FINALIZED';
export type ResultFlag = 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL';

export interface Report {
  id: number;
  report_no: string;
  patient_id: number;
  doctor_id: number | null;
  status: ReportStatus;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  payment_method: string;
  created_by: number | null;
  finalized_by: number | null;
  finalized_at: string | null;
  pdf_path: string;
  pdf_sha256: string;
  amends_report_id: number | null;
  notes: string;
  performed_by: string;
  created_at: string;
}

export interface ReportResult {
  id: number;
  report_test_id: number;
  parameter_id: number | null;
  parameter_name_snapshot: string;
  unit_snapshot: string;
  ref_range_snapshot: string;
  value: string;
  flag: ResultFlag;
}

export interface ReportTest {
  id: number;
  report_id: number;
  test_id: number;
  test_name_snapshot: string;
  price_snapshot: number;
  results: ReportResult[];
}

export interface Payment {
  id: number;
  report_id: number;
  amount: number;
  method: string;
  notes: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface ReportWithDetails extends Report {
  patient_name: string;
  patient_code: string;
  age: number | null;
  age_unit: AgeUnit;
  gender: Gender | null;
  doctor_name: string | null;
  finalized_by_name: string | null;
  tests: ReportTest[];
  payments: Payment[];
  outstanding_balance: number;
}

export interface ReportListRow extends Report {
  patient_name: string;
  patient_code: string;
  patient_phone: string;
  doctor_name: string | null;
  // Only populated by listReports() (used by the Patient Profile report
  // list) — searchReports()'s own query doesn't join report_tests, so this
  // is genuinely absent (not just empty) on rows from that path.
  test_names?: string;
}

export interface ReportListFilters {
  from?: string;
  to?: string;
  status?: ReportStatus;
  patient_id?: number;
}

export type ReportSortKey = 'report_no' | 'patient_name' | 'doctor_name' | 'created_at' | 'total' | 'balance' | 'status';

export interface ReportsPageFilters {
  search?: string;
  from?: string;
  to?: string;
  status?: ReportStatus;
  doctor_id?: number;
  patient_id?: number;
  sortKey?: ReportSortKey;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ReportsPageResult {
  rows: ReportListRow[];
  total: number;
}

export interface PatientTrendParameter {
  name: string;
  unit: string;
}

export interface PatientParameterPoint {
  date: string;
  value: number;
  unit: string;
  flag: ResultFlag;
  report_no: string;
}

export interface NewReportTestInput {
  test_id: number;
  results: { parameter_id: number; value: string; ref_range?: string; unit?: string }[];
}

export interface NewReportInput {
  patient: {
    id?: number;
    full_name: string;
    age: number | null;
    age_unit: AgeUnit;
    gender: Gender | null;
    phone?: string;
    address?: string;
  };
  doctor_id: number | null;
  discount?: number;
  paid?: number;
  payment_method?: string;
  notes?: string;
  performed_by?: string;
  tests: NewReportTestInput[];
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  user_full_name: string | null;
  action: string;
  entity: string;
  entity_id: number | null;
  details_json: string;
  created_at: string;
}

export interface AuditLogFilters {
  action?: string;
  entity?: string;
  entity_id?: number;
  user_id?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogPageResult {
  rows: AuditLogEntry[];
  total: number;
}

export interface BackupFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  kind: 'auto' | 'manual' | 'pre-restore';
}

export interface IntegrityCheckResult {
  ok: boolean;
  details: string;
}

export interface StatBucket {
  count: number;
  revenue: number;
}

export interface DashboardStats {
  today: StatBucket;
  week: StatBucket;
  month: StatBucket;
  last7Days: { day: string; count: number }[];
  pendingDrafts: number;
  outstandingBalance: number;
  recentReports: ReportListRow[];
}

export interface OutstandingBalanceRow {
  id: number;
  report_no: string;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  total: number;
  paid_total: number;
  balance: number;
  finalized_at: string | null;
}

export type RevenueGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface RevenuePeriodFilters {
  granularity: RevenueGranularity;
  from?: string;
  to?: string;
}

export interface RevenueBucket {
  bucket: string;
  revenue: number;
  count: number;
}

export interface RevenueBreakdownRow {
  label: string;
  revenue: number;
  count: number;
}

export interface RevenuePeriodReport {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  current: { revenue: number; count: number; discounts: number };
  previous: { revenue: number; count: number };
  changePct: { revenue: number | null; count: number | null };
  trend: RevenueBucket[];
  topTestsByCount: RevenueBreakdownRow[];
  topTestsByRevenue: RevenueBreakdownRow[];
  byDoctor: RevenueBreakdownRow[];
  byCategory: RevenueBreakdownRow[];
  byPaymentMethod: RevenueBreakdownRow[];
}

export interface TestReportFilters {
  granularity: RevenueGranularity;
  from?: string;
  to?: string;
}

export interface TestReportRow {
  report_id: number;
  report_no: string;
  patient_name: string;
  test_codes: string;
  doctor_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
}

export interface TestReportResult {
  from: string;
  to: string;
  rows: TestReportRow[];
  totals: { subtotal: number; discount: number; total: number };
  lines: SaleReportLine[];
  lineTotals: { fee: number; discount: number; advance: number; remaining: number };
}

// One printed "Sale Report" line: a single test, with its report's discount,
// paid amount (advance) and balance (remaining) split in proportion to price.
export interface SaleReportLine {
  report_id: number;
  report_no: string;
  created_at: string;
  patient_name: string;
  test_name: string;
  fee: number;
  discount: number;
  advance: number;
  remaining: number;
}

export interface ClinicSettings {
  id: 1;
  clinic_name: string;
  address: string;
  phone: string;
  logo_path: string;
  header_note: string;
  footer_note: string;
  pathologist_name: string;
  header_image_path: string;
  footer_image_path: string;
  report_archive_folder: string;
  report_number_prefix: string;
  signature_image_path: string;
  backup_folder: string;
}

export interface ImportSummary {
  totalRows: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

export type PaperSize = 'A4' | 'Letter';

export interface PrintLayout {
  topMarginMm: number;
  bottomMarginMm: number;
  leftMarginMm: number;
  rightMarginMm: number;
  paperSize: PaperSize;
  baseFontSizePt: number;
}
