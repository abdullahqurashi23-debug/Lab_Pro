import { z } from 'zod';

// Every ipcMain handler that takes a payload from the renderer validates it
// against one of these schemas before it ever reaches the database. The
// renderer is untrusted input from the main process's point of view, even
// though it's "our own" UI — this is the actual trust boundary in an
// Electron app with contextIsolation on.

export const idSchema = z.number().int().positive();

export const clinicSettingsSchema = z.object({
  clinic_name: z.string().trim().min(1, 'Clinic name is required').max(200),
  address: z.string().trim().max(500).optional().default(''),
  phone: z.string().trim().max(50).optional().default(''),
  logo_path: z.string().trim().max(1000).optional().default(''),
  header_note: z.string().trim().max(500).optional().default(''),
  footer_note: z.string().trim().max(500).optional().default(''),
  pathologist_name: z.string().trim().max(200).optional().default(''),
  header_image_path: z.string().trim().max(1000).optional().default(''),
  footer_image_path: z.string().trim().max(1000).optional().default(''),
  report_archive_folder: z.string().trim().max(1000).optional().default(''),
  report_number_prefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9]*$/, 'Prefix can only contain letters and numbers')
    .optional()
    .default('LAB'),
  signature_image_path: z.string().trim().max(1000).optional().default(''),
  backup_folder: z.string().trim().max(1000).optional().default(''),
});

export const restoreBackupSchema = z.object({
  backupPath: z.string().trim().min(1, 'A backup file must be selected'),
  adminPassword: z.string().min(1, 'Your password is required to restore a backup'),
});

export const auditLogFiltersSchema = z.object({
  action: z.string().trim().max(50).optional(),
  entity: z.string().trim().max(50).optional(),
  entity_id: idSchema.optional(),
  user_id: idSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(50),
});

export const printLayoutSchema = z.object({
  topMarginMm: z.number().min(0).max(150),
  bottomMarginMm: z.number().min(0).max(150),
  leftMarginMm: z.number().min(0).max(100),
  rightMarginMm: z.number().min(0).max(100),
  paperSize: z.enum(['A4', 'Letter']),
  baseFontSizePt: z.number().min(6).max(24),
});

// ---------- Auth / users ----------
export const usernameSchema = z.string().trim().min(2, 'Username is required').max(50);
export const passwordSchema = z.string().min(4, 'Password must be at least 4 characters').max(200);
export const roleSchema = z.enum(['ADMIN', 'TECHNICIAN', 'RECEPTION']);

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  full_name: z.string().trim().min(1, 'Full name is required').max(200),
  role: roleSchema,
});

export const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  role: roleSchema,
  is_active: z.boolean(),
});

// ---------- Doctors ----------
export const doctorInputSchema = z.object({
  name: z.string().trim().min(1, 'Doctor name is required').max(200),
  clinic: z.string().trim().max(200).optional().default(''),
  phone: z.string().trim().max(50).optional().default(''),
});

// ---------- Patients ----------
export const patientInputSchema = z.object({
  full_name: z.string().trim().min(1, 'Patient name is required').max(200),
  age: z.number().int().nonnegative().max(150).nullable(),
  age_unit: z.enum(['Years', 'Months', 'Days']),
  gender: z.enum(['Male', 'Female', 'Other']).nullable(),
  phone: z.string().trim().max(50).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
});

// ---------- Test categories ----------
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  sort_order: z.number().int().optional().default(0),
});

// Full ordered list of category ids — sort_order becomes each id's index.
export const reorderCategoriesSchema = z.array(idSchema).min(1);

// ---------- Tests + parameters ----------
export const testParameterInputSchema = z.object({
  // Present + matching an existing row -> update in place; absent -> insert
  // as new. This is what lets a test's parameters be edited without ever
  // deleting a row that report_results.parameter_id might reference.
  id: idSchema.optional(),
  name: z.string().trim().min(1, 'Parameter name is required').max(200),
  code: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$|^$/, 'Code must start with a letter and contain only letters, numbers, or underscores')
    .optional()
    .default(''),
  unit: z.string().trim().max(50).optional().default(''),
  input_type: z.enum(['NUMBER', 'TEXT', 'DROPDOWN', 'FORMULA']).default('NUMBER'),
  dropdown_options: z.string().max(2000).optional().default(''),
  formula: z.string().max(500).optional().default(''),
  ref_male_low: z.number().nullable().optional(),
  ref_male_high: z.number().nullable().optional(),
  ref_female_low: z.number().nullable().optional(),
  ref_female_high: z.number().nullable().optional(),
  ref_child_low: z.number().nullable().optional(),
  ref_child_high: z.number().nullable().optional(),
  ref_text: z.string().max(300).optional().default(''),
  critical_low: z.number().nullable().optional(),
  critical_high: z.number().nullable().optional(),
  decimals: z.number().int().min(0).max(6).optional().default(2),
  sort_order: z.number().int().optional(),
});

export const testInputSchema = z.object({
  name: z.string().trim().min(1, 'Test name is required').max(300),
  short_code: z.string().trim().min(1, 'Short code is required').max(50),
  category_id: idSchema.nullable().optional(),
  price: z.number().nonnegative().max(10_000_000).optional().default(0),
  sample_type: z.string().trim().max(100).optional().default(''),
  report_notes: z.string().trim().max(1000).optional().default(''),
  is_active: z.boolean().optional().default(true),
  parameters: z.array(testParameterInputSchema).optional(),
});

// Full-catalog JSON import/export. category_name is a plain string (not an
// id) since categories are matched/created by name on import — ids aren't
// portable across databases.
export const catalogTestImportSchema = testInputSchema
  .omit({ category_id: true })
  .extend({ category_name: z.string().trim().max(100).nullable().optional() });

export const catalogImportSchema = z.object({
  categories: z
    .array(z.object({ name: z.string().trim().min(1).max(100), sort_order: z.number().int().optional().default(0) }))
    .optional()
    .default([]),
  tests: z.array(catalogTestImportSchema).min(1, 'The file has no tests to import'),
});

// ---------- Reports ----------
export const reportResultInputSchema = z.object({
  parameter_id: idSchema,
  value: z.string().max(500).optional().default(''),
  // Overrides the catalog-computed reference range text for this one
  // result on this one report — every lab calibrates/interprets ranges
  // slightly differently, so this lets a tech correct it per-report
  // without touching the shared Test Catalog default. Omitted/empty means
  // "use the catalog's computed range," exactly like before this existed.
  ref_range: z.string().max(200).optional(),
  // Same idea, for the unit column — a catalog parameter left without a
  // unit (or one that just needs a per-report correction) can still show
  // one on the actual report without a trip to the Test Catalog.
  unit: z.string().max(50).optional(),
});

export const reportTestInputSchema = z.object({
  test_id: idSchema,
  results: z.array(reportResultInputSchema).default([]),
});

export const reportInputSchema = z.object({
  patient: z.object({
    id: idSchema.optional(),
    full_name: z.string().trim().min(1, 'Patient name is required').max(200),
    age: z.number().int().nonnegative().max(150).nullable(),
    age_unit: z.enum(['Years', 'Months', 'Days']),
    gender: z.enum(['Male', 'Female', 'Other']).nullable(),
    phone: z.string().trim().max(50).optional(),
    address: z.string().trim().max(500).optional(),
  }),
  doctor_id: idSchema.nullable(),
  discount: z.number().nonnegative().optional().default(0),
  paid: z.number().nonnegative().optional().default(0),
  payment_method: z.string().trim().max(50).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  tests: z.array(reportTestInputSchema).min(1, 'At least one test is required'),
});

export const reportListFiltersSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    status: z.enum(['DRAFT', 'FINALIZED']).optional(),
    patient_id: idSchema.optional(),
  })
  .optional();

export const searchQuerySchema = z.string().trim().max(200).optional().default('');

export const reportsPageFiltersSchema = z.object({
  search: z.string().trim().max(200).optional().default(''),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(['DRAFT', 'FINALIZED']).optional(),
  doctor_id: idSchema.optional(),
  patient_id: idSchema.optional(),
  sortKey: z.enum(['report_no', 'patient_name', 'doctor_name', 'created_at', 'total', 'balance', 'status']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(25),
});

export const revenuePeriodFiltersSchema = z
  .object({
    granularity: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine((v) => v.granularity !== 'custom' || (!!v.from && !!v.to), {
    message: 'A custom range requires both a from and a to date.',
  });

export const paymentInputSchema = z.object({
  amount: z.number().positive('Amount must be greater than zero').max(100_000_000),
  method: z.string().trim().max(50).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
});
