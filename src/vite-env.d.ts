/// <reference types="vite/client" />

import type {
  ClinicSettings,
  Doctor,
  NewTest,
  TestWithParameters,
  TestCategory,
  Patient,
  PatientWithStats,
  PublicUser,
  ReportWithDetails,
  ReportListRow,
  NewReportInput,
  ReportListFilters,
  ReportsPageFilters,
  ReportsPageResult,
  ImportSummary,
  AuditLogFilters,
  AuditLogPageResult,
  DashboardStats,
  RevenuePeriodFilters,
  RevenuePeriodReport,
  TestReportFilters,
  TestReportResult,
  OutstandingBalanceRow,
  Payment,
  PrintLayout,
  PatientTrendParameter,
  PatientParameterPoint,
  BackupFileInfo,
  IntegrityCheckResult,
} from './lib/types';

export interface CatalogExport {
  exportedAt: string;
  categories: { name: string; sort_order: number }[];
  tests: (Omit<NewTest, 'category_id'> & { category_name: string | null })[];
}

export interface CatalogImportResult {
  categoriesCreated: number;
  testsInserted: number;
  testsSkipped: number;
  errors: string[];
}

export interface FileOpResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
}

export interface OkResult {
  ok: boolean;
  error?: string;
}

export interface VerifyPdfResult {
  success: boolean;
  canceled?: boolean;
  matched?: boolean;
  hash?: string;
  filePath?: string;
  report?: { report_no: string; patient_name: string; finalized_at: string | null } | null;
  error?: string;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  user?: PublicUser;
  mustChangePassword?: boolean;
}

export interface NewPatientInput {
  full_name: string;
  age: number | null;
  age_unit: 'Years' | 'Months' | 'Days';
  gender: 'Male' | 'Female' | 'Other' | null;
  phone?: string;
  address?: string;
}

export interface NewDoctorInput {
  name: string;
  clinic?: string;
  phone?: string;
}

export interface NewCategoryInput {
  name: string;
  sort_order?: number;
}

export interface NewUserInput {
  username: string;
  password: string;
  full_name: string;
  role: 'ADMIN' | 'TECHNICIAN' | 'RECEPTION';
}

export interface UpdateUserInput {
  full_name: string;
  role: 'ADMIN' | 'TECHNICIAN' | 'RECEPTION';
  is_active: boolean;
}

export interface NewPaymentInput {
  amount: number;
  method?: string;
  notes?: string;
}

export interface LabProApi {
  auth: {
    needsSetup: () => Promise<boolean>;
    createFirstAdmin: (username: string, password: string) => Promise<LoginResult>;
    login: (username: string, password: string) => Promise<LoginResult>;
    logout: (reason?: string) => Promise<void>;
    currentUser: () => Promise<PublicUser | null>;
    changePassword: (oldPassword: string, newPassword: string) => Promise<OkResult>;
  };
  users: {
    list: () => Promise<PublicUser[]>;
    create: (input: NewUserInput) => Promise<PublicUser>;
    update: (id: number, input: UpdateUserInput) => Promise<PublicUser>;
    resetPassword: (id: number, newPassword: string) => Promise<OkResult>;
  };
  doctors: {
    list: () => Promise<Doctor[]>;
    create: (input: NewDoctorInput) => Promise<Doctor>;
    update: (id: number, input: NewDoctorInput) => Promise<Doctor>;
    delete: (id: number) => Promise<{ deleted: boolean }>;
  };
  patients: {
    search: (query: string) => Promise<Patient[]>;
    list: (search?: string) => Promise<PatientWithStats[]>;
    get: (id: number) => Promise<Patient | undefined>;
    create: (input: NewPatientInput) => Promise<Patient>;
    update: (id: number, input: NewPatientInput) => Promise<Patient>;
    findDuplicate: (fullName: string, phone: string) => Promise<Patient | null>;
    trendableParameters: (patientId: number) => Promise<PatientTrendParameter[]>;
    parameterHistory: (patientId: number, parameterName: string) => Promise<PatientParameterPoint[]>;
  };
  categories: {
    list: () => Promise<TestCategory[]>;
    create: (input: NewCategoryInput) => Promise<TestCategory>;
    update: (id: number, input: NewCategoryInput) => Promise<TestCategory>;
    delete: (id: number) => Promise<{ deleted: boolean }>;
    reorder: (orderedIds: number[]) => Promise<TestCategory[]>;
  };
  tests: {
    list: (includeInactive?: boolean) => Promise<TestWithParameters[]>;
    get: (id: number) => Promise<TestWithParameters | undefined>;
    create: (input: NewTest) => Promise<TestWithParameters>;
    update: (id: number, input: NewTest) => Promise<TestWithParameters>;
    deactivate: (id: number) => Promise<TestWithParameters>;
    activate: (id: number) => Promise<TestWithParameters>;
    delete: (id: number) => Promise<{ deleted: boolean }>;
    exportExcel: () => Promise<FileOpResult>;
    importExcel: () => Promise<ImportSummary | { canceled: true }>;
    exportJson: () => Promise<FileOpResult>;
    importJson: () => Promise<CatalogImportResult | { canceled: true }>;
  };
  reports: {
    create: (input: NewReportInput) => Promise<ReportWithDetails>;
    updateDraft: (reportId: number, input: NewReportInput) => Promise<ReportWithDetails>;
    finalize: (reportId: number) => Promise<ReportWithDetails>;
    retryArchive: (reportId: number) => Promise<ReportWithDetails>;
    verifyPdf: () => Promise<VerifyPdfResult>;
    deleteDraft: (reportId: number) => Promise<{ deleted: boolean }>;
    getById: (reportId: number) => Promise<ReportWithDetails | null>;
    list: (filters?: ReportListFilters) => Promise<ReportListRow[]>;
    listPage: (filters?: ReportsPageFilters) => Promise<ReportsPageResult>;
    search: (query: string) => Promise<ReportListRow[]>;
    exportExcel: (filters?: ReportListFilters) => Promise<FileOpResult>;
  };
  dashboard: {
    stats: () => Promise<DashboardStats>;
  };
  revenue: {
    period: (filters: RevenuePeriodFilters) => Promise<RevenuePeriodReport>;
    outstandingBalances: () => Promise<OutstandingBalanceRow[]>;
    print: (filters: RevenuePeriodFilters) => Promise<{ success: boolean }>;
    exportExcel: (filters: RevenuePeriodFilters) => Promise<FileOpResult>;
    exportPdf: (filters: RevenuePeriodFilters) => Promise<FileOpResult>;
  };
  testReport: {
    period: (filters: TestReportFilters) => Promise<TestReportResult>;
    print: (filters: TestReportFilters) => Promise<{ success: boolean }>;
    exportPdf: (filters: TestReportFilters) => Promise<FileOpResult>;
  };
  payments: {
    record: (reportId: number, input: NewPaymentInput) => Promise<Payment>;
  };
  audit: {
    list: (filters?: AuditLogFilters) => Promise<AuditLogPageResult>;
    actions: () => Promise<string[]>;
    entities: () => Promise<string[]>;
  };
  settings: {
    get: () => Promise<ClinicSettings>;
    update: (fields: Partial<ClinicSettings>) => Promise<ClinicSettings>;
    pickImage: (kind: 'logo' | 'header' | 'footer' | 'signature') => Promise<string | null>;
    pickFolder: () => Promise<string | null>;
    getPrintLayout: () => Promise<PrintLayout>;
    updatePrintLayout: (layout: PrintLayout) => Promise<PrintLayout>;
  };
  appSettings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
  backup: {
    now: () => Promise<BackupFileInfo>;
    list: () => Promise<BackupFileInfo[]>;
    restore: (backupPath: string, adminPassword: string) => Promise<void>;
  };
  db: {
    healthCheck: () => Promise<IntegrityCheckResult>;
  };
  print: {
    report: (reportId: number, mode: 'paper' | 'pdf') => Promise<{ success: boolean }>;
    savePdf: (reportId: number) => Promise<FileOpResult>;
    testPage: () => Promise<{ success: boolean }>;
    openPdf: (reportId: number) => Promise<{ success: boolean }>;
    openFolder: (reportId: number) => Promise<{ success: boolean }>;
  };
}

declare global {
  interface Window {
    api: LabProApi;
  }
}
