import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb, getDbPath, closeDb, checkIntegrity } from '../../src/db/db';
import { seed } from '../../src/db/seed';
import { runBackup, pruneAutoBackups, listBackups, replaceLiveDatabase } from '../backup';
import {
  usersRepo,
  patientsRepo,
  doctorsRepo,
  testCategoriesRepo as categoriesRepo,
  testsRepo,
  reportsRepo,
  dashboardRepo,
  paymentsRepo,
  revenueRepo,
  testReportRepo,
  auditLogRepo as auditRepo,
  settingsRepo,
  clinicSettingsRepo,
  catalogRepo,
  printSettingsRepo,
} from '../../src/db/repositories';
import { generateReportPdf, generateAlignmentTestPage, generateRevenuePdf, generateTestReportPdf, printPdfBuffer } from '../print';
import { buildArchivePath } from '../reportArchive';
import type { PublicUser, Role, ReportWithDetails } from '../../src/db/repositories';
import {
  clinicSettingsSchema,
  printLayoutSchema,
  createUserSchema,
  updateUserSchema,
  doctorInputSchema,
  patientInputSchema,
  categoryInputSchema,
  reorderCategoriesSchema,
  testInputSchema,
  catalogImportSchema,
  reportInputSchema,
  reportListFiltersSchema,
  reportsPageFiltersSchema,
  revenuePeriodFiltersSchema,
  paymentInputSchema,
  restoreBackupSchema,
  auditLogFiltersSchema,
  searchQuerySchema,
  passwordSchema,
  idSchema,
} from '../../src/db/validation';
import { buildTestCatalogWorkbook, parseTestCatalogWorkbook, buildReportsWorkbook, buildRevenueWorkbook } from '../../src/db/excel';

const isDev = process.env.NODE_ENV === 'development';

// LabPro is a single-page app routed entirely through react-router's hash
// router — every in-app navigation (Dashboard -> Patients -> a patient's
// profile, etc.) pushes a REAL entry onto Chromium's own browser history,
// not just React state. Without this, a trackpad two-finger swipe (macOS)
// or a mouse back/forward side button (common on Windows mice) triggers
// Chromium's NATIVE back/forward navigation directly on that history stack
// — completely bypassing react-router's own logic, including the "leave
// without saving?" confirmation on the New Report page, which only
// intercepts navigation initiated through react-router itself. Must be
// called before app.whenReady().
app.commandLine.appendSwitch('disable-features', 'OverscrollHistoryNavigation');

let mainWindow: BrowserWindow | null = null;
let currentUser: PublicUser | null = null;

function getUserDataPath(): string {
  return app.getPath('userData');
}

function db() {
  return getDb(getUserDataPath());
}

// dist-electron/electron/main/index.js -> project root is three levels up.
const APP_ROOT = path.join(__dirname, '..', '..', '..');
const ICON_PATH = path.join(APP_ROOT, 'build', 'icon.png');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'LabPro',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Renderer console output (including uncaught errors) is otherwise only
  // visible in DevTools — forwarding warnings/errors to the main process's
  // own console means they show up in the same terminal/log as everything
  // else, in production too, not just when DevTools happens to be open.
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer] ${message} (${sourceId}:${line})`);
    }
  });

  // Electron Security Checklist #12/13: without this, a compromised
  // renderer (e.g. via a supply-chain-compromised dependency) could
  // navigate this window to an arbitrary external URL or spawn an
  // unrestricted new window. In-app routing uses a hash router, and a
  // hash-only URL change is NOT a "navigation" in Electron's sense — it
  // fires did-navigate-in-page instead — so this never interferes with
  // normal use, only with actually leaving the app's own loaded page.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  // The mouse back/forward side buttons many Windows mice have send this
  // as 'browser-backward'/'browser-forward' — same reasoning as the
  // trackpad-swipe switch above (this is the Windows equivalent of it),
  // and just as bypassing of react-router's own navigation/unsaved-changes
  // handling if left unhandled.
  mainWindow.on('app-command', (event, command) => {
    if (command === 'browser-backward' || command === 'browser-forward') event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(APP_ROOT, 'dist', 'index.html'));
  }
}

const AUTO_BACKUP_RETENTION = 30;
// Checked hourly rather than once at launch so a session left running for
// several days still gets its daily backup, not just one at the moment of
// that day's first startup.
const AUTO_BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function defaultBackupFolder(): string {
  return path.join(app.getPath('documents'), 'LabPro Backups');
}

function backupFolder(): string {
  const configured = clinicSettingsRepo.getClinicSettings(db()).backup_folder;
  return configured && configured.trim() ? configured.trim() : defaultBackupFolder();
}

async function performAutoBackupIfDue(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (settingsRepo.getSetting(db(), 'last_auto_backup_date') === today) return;
  try {
    await runBackup(db(), backupFolder(), 'auto');
    pruneAutoBackups(backupFolder(), AUTO_BACKUP_RETENTION);
    settingsRepo.setSetting(db(), 'last_auto_backup_date', today);
    audit('BACKUP', 'database', null, { kind: 'auto' });
  } catch (err) {
    console.error('Automatic backup failed:', err);
  }
}

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  runBackup(db(), backupFolder(), 'auto')
    .then(() => pruneAutoBackups(backupFolder(), AUTO_BACKUP_RETENTION))
    .then(() => audit('BACKUP', 'database', null, { kind: 'close' }))
    .catch((err) => console.error('Backup on quit failed:', err))
    .finally(() => app.quit());
});

app.whenReady().then(async () => {
  // Initialize the database (creates file + schema on first run) and
  // seed the default admin account + full test catalog if not present.
  seed(getUserDataPath());

  // Surfaced natively (works even before any window exists) — corruption
  // this early is exactly the situation where you don't want to depend on
  // the renderer having loaded successfully to tell the user about it.
  const integrity = checkIntegrity(db());
  if (!integrity.ok) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Database Integrity Check Failed',
      message: 'LabPro detected a problem with its database file.',
      detail: `${integrity.details}\n\nGo to Settings > Backup & Restore to restore from a recent backup. Continuing without restoring may cause further errors or data loss.`,
      buttons: ['Continue Anyway'],
    });
  }

  createWindow();
  await performAutoBackupIfDue();
  setInterval(performAutoBackupIfDue, AUTO_BACKUP_CHECK_INTERVAL_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------

function requireAuth(): PublicUser {
  if (!currentUser) throw new Error('Not signed in.');
  return currentUser;
}

// Centralizes the role matrix so "who can do what" lives in one place:
//   ADMIN       — everything
//   TECHNICIAN  — enter results, finalize, print
//   RECEPTION   — patients, new reports, billing, reprint
function requireRole(...allowed: Role[]): PublicUser {
  const user = requireAuth();
  if (!allowed.includes(user.role)) {
    throw new Error(`This action requires one of: ${allowed.join(', ')}.`);
  }
  return user;
}

function requireAdmin(): PublicUser {
  return requireRole('ADMIN');
}

function audit(action: string, entity: string, entityId: number | null, details?: unknown) {
  auditRepo.recordAudit(db(), {
    user_id: currentUser?.id ?? null,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}

// Wraps an IPC handler so a zod validation failure or a thrown domain error
// (e.g. "can't delete a test in use", "not signed in") comes back to the
// renderer as a clean Error message instead of an opaque IPC rejection.
function handle<T>(channel: string, fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => T) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      // Awaited here (not just returned) so this try/catch actually
      // catches rejections from `async` handlers too — a plain
      // `return fn(...)` only catches SYNCHRONOUS throws, since calling an
      // async function that throws never throws synchronously itself, it
      // just returns an already-rejected promise. Many handlers (finalize,
      // backup/restore, exports, PDF verify) are async, so without this
      // `await`, every zod/domain error inside them bypassed the clean
      // message extraction below entirely and reached the renderer as a
      // raw, often unreadable "Error invoking remote method" message.
      return await fn(event, ...args);
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error(err.errors.map((e) => e.message).join('; '));
      }
      throw err;
    }
  });
}

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------

handle('auth:login', (_e, rawUsername: string, rawPassword: string) => {
  // Deliberately not zod-validated here: even a malformed/too-short
  // username attempt should still show up in the audit trail below.
  const username = String(rawUsername ?? '').trim();
  const user = usersRepo.getUserByUsername(db(), username);
  const passwordOk = user ? bcrypt.compareSync(String(rawPassword ?? ''), user.password_hash) : false;

  if (!user || !user.is_active || !passwordOk) {
    // Logged even when the username doesn't exist, so repeated guesses
    // against unknown usernames still show up in the audit trail.
    audit('LOGIN_FAILED', 'user', user?.id ?? null, {
      username,
      reason: !user ? 'unknown_username' : !user.is_active ? 'inactive_account' : 'wrong_password',
    });
    return { ok: false, error: 'Invalid username or password.' };
  }

  currentUser = usersRepo.toPublicUser(user);
  audit('LOGIN', 'user', user.id);
  return { ok: true, user: currentUser, mustChangePassword: !!user.must_change_password };
});

handle('auth:logout', (_e, reason?: string) => {
  if (currentUser) audit('LOGOUT', 'user', currentUser.id, reason ? { reason } : undefined);
  currentUser = null;
});

handle('auth:currentUser', () => currentUser);

handle('auth:changePassword', (_e, oldPassword: string, newPassword: string) => {
  const user = requireAuth();
  const full = usersRepo.getUserById(db(), user.id);
  if (!full || !bcrypt.compareSync(String(oldPassword ?? ''), full.password_hash)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join('; ') };
  }
  usersRepo.setPassword(db(), user.id, bcrypt.hashSync(parsed.data, 10), false);
  audit('CHANGE_PASSWORD', 'user', user.id);
  return { ok: true };
});

// ---------------------------------------------------------------
// Users (ADMIN only)
// ---------------------------------------------------------------

handle('users:list', () => {
  requireAdmin();
  return usersRepo.listUsers(db());
});

handle('users:create', (_e, payload) => {
  requireAdmin();
  const input = createUserSchema.parse(payload);
  const created = usersRepo.createUser(db(), {
    username: input.username,
    password_hash: bcrypt.hashSync(input.password, 10),
    full_name: input.full_name,
    role: input.role,
    must_change_password: true,
  });
  audit('CREATE', 'user', created.id, { username: created.username, role: created.role });
  return created;
});

handle('users:update', (_e, id, payload) => {
  requireAdmin();
  const input = updateUserSchema.parse(payload);
  const updated = usersRepo.updateUser(db(), idSchema.parse(id), {
    full_name: input.full_name,
    role: input.role,
    is_active: input.is_active ? 1 : 0,
  });
  audit('UPDATE', 'user', updated.id, input);
  return updated;
});

handle('users:resetPassword', (_e, id, newPassword) => {
  requireAdmin();
  const parsed = passwordSchema.parse(newPassword);
  usersRepo.setPassword(db(), idSchema.parse(id), bcrypt.hashSync(parsed, 10), true);
  audit('RESET_PASSWORD', 'user', idSchema.parse(id));
  return { ok: true };
});

// ---------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------

handle('doctors:list', () => {
  requireAuth();
  return doctorsRepo.listDoctors(db());
});
handle('doctors:create', (_e, payload) => {
  requireRole('ADMIN', 'RECEPTION');
  const input = doctorInputSchema.parse(payload);
  const created = doctorsRepo.createDoctor(db(), input);
  audit('CREATE', 'doctor', created.id, input);
  return created;
});
handle('doctors:update', (_e, id, payload) => {
  requireRole('ADMIN', 'RECEPTION');
  const input = doctorInputSchema.parse(payload);
  const updated = doctorsRepo.updateDoctor(db(), idSchema.parse(id), input);
  audit('UPDATE', 'doctor', updated.id, input);
  return updated;
});
handle('doctors:delete', (_e, id) => {
  requireAdmin();
  const result = doctorsRepo.deleteDoctor(db(), idSchema.parse(id));
  audit('DELETE', 'doctor', idSchema.parse(id));
  return result;
});

// ---------------------------------------------------------------
// Patients
// ---------------------------------------------------------------

handle('patients:search', (_e, query) => {
  requireAuth();
  return patientsRepo.searchPatients(db(), searchQuerySchema.parse(query));
});
handle('patients:list', (_e, search) => {
  requireAuth();
  return patientsRepo.listPatientsWithStats(db(), searchQuerySchema.parse(search));
});
handle('patients:get', (_e, id) => {
  requireAuth();
  return patientsRepo.getPatientById(db(), idSchema.parse(id));
});
handle('patients:create', (_e, payload) => {
  requireRole('ADMIN', 'RECEPTION');
  const input = patientInputSchema.parse(payload);
  const created = patientsRepo.createPatient(db(), input);
  audit('CREATE', 'patient', created.id, { full_name: created.full_name });
  return created;
});
handle('patients:update', (_e, id, payload) => {
  requireRole('ADMIN', 'RECEPTION');
  const input = patientInputSchema.parse(payload);
  const updated = patientsRepo.updatePatient(db(), idSchema.parse(id), input);
  audit('UPDATE', 'patient', updated.id);
  return updated;
});
handle('patients:findDuplicate', (_e, fullName, phone) => {
  requireAuth();
  return patientsRepo.findDuplicatePatient(db(), String(fullName ?? ''), String(phone ?? '')) ?? null;
});
handle('patients:trendableParameters', (_e, patientId) => {
  requireAuth();
  return patientsRepo.listPatientTrendableParameters(db(), idSchema.parse(patientId));
});
handle('patients:parameterHistory', (_e, patientId, parameterName) => {
  requireAuth();
  return patientsRepo.getPatientParameterHistory(db(), idSchema.parse(patientId), String(parameterName ?? ''));
});

// ---------------------------------------------------------------
// Test categories
// ---------------------------------------------------------------

handle('categories:list', () => {
  requireAuth();
  return categoriesRepo.listCategories(db());
});
handle('categories:create', (_e, payload) => {
  requireAdmin();
  const input = categoryInputSchema.parse(payload);
  const created = categoriesRepo.createCategory(db(), input);
  audit('CREATE', 'test_category', created.id, input);
  return created;
});
handle('categories:update', (_e, id, payload) => {
  requireAdmin();
  const input = categoryInputSchema.parse(payload);
  const updated = categoriesRepo.updateCategory(db(), idSchema.parse(id), input);
  audit('UPDATE', 'test_category', updated.id, input);
  return updated;
});
handle('categories:delete', (_e, id) => {
  requireAdmin();
  const result = categoriesRepo.deleteCategory(db(), idSchema.parse(id));
  audit('DELETE', 'test_category', idSchema.parse(id));
  return result;
});
handle('categories:reorder', (_e, orderedIds) => {
  requireAdmin();
  const parsed = reorderCategoriesSchema.parse(orderedIds);
  const result = categoriesRepo.reorderCategories(db(), parsed);
  audit('REORDER', 'test_category', null, { order: parsed });
  return result;
});

// ---------------------------------------------------------------
// Tests + parameters
// ---------------------------------------------------------------

handle('tests:list', (_e, includeInactive) => {
  requireAuth();
  return testsRepo.listTests(db(), !!includeInactive);
});
handle('tests:get', (_e, id) => {
  requireAuth();
  return testsRepo.getTestById(db(), idSchema.parse(id));
});
handle('tests:create', (_e, payload) => {
  requireAdmin();
  const input = testInputSchema.parse(payload);
  const created = testsRepo.createTest(db(), input);
  audit('CREATE', 'test', created.id, { name: created.name, short_code: created.short_code });
  return created;
});
handle('tests:update', (_e, id, payload) => {
  requireAdmin();
  const input = testInputSchema.parse(payload);
  const updated = testsRepo.updateTest(db(), idSchema.parse(id), input);
  audit('UPDATE', 'test', updated.id);
  return updated;
});
handle('tests:deactivate', (_e, id) => {
  requireAdmin();
  const updated = testsRepo.deactivateTest(db(), idSchema.parse(id));
  audit('DEACTIVATE', 'test', updated.id);
  return updated;
});
handle('tests:activate', (_e, id) => {
  requireAdmin();
  const updated = testsRepo.activateTest(db(), idSchema.parse(id));
  audit('ACTIVATE', 'test', updated.id);
  return updated;
});
handle('tests:delete', (_e, id) => {
  requireAdmin();
  const result = testsRepo.deleteTest(db(), idSchema.parse(id));
  audit('DELETE', 'test', idSchema.parse(id));
  return result;
});

// ---------------------------------------------------------------
// Reports
// ---------------------------------------------------------------

function defaultArchiveFolder(): string {
  return path.join(app.getPath('documents'), 'LabPro Reports');
}

// Finalizing is more than one DB write: (1) lock the report — status,
// finalized_by/at, and the audit entry all in one transaction, handled by
// reportsRepo.finalizeReport itself; then, once that's committed and
// finalized_at is real, (2) render the permanent archive PDF (always
// 'pdf' mode — this file is meant to stand on its own when shared, with
// no physical letterhead behind it), (3) hash it, (4) write it to disk
// under the configured (or default) archive folder, and (5) attach its
// path+hash back onto the now-finalized row via the one narrow exception
// the 004 migration's trigger allows.
async function finalizeAndArchive(id: number, finalizedByUserId: number | null): Promise<ReportWithDetails> {
  const finalized = reportsRepo.finalizeReport(db(), id, finalizedByUserId);

  const layout = printSettingsRepo.getPrintLayout(db());
  const clinic = clinicSettingsRepo.getClinicSettings(db());
  const pdfBuffer = await generateReportPdf(id, 'pdf', layout, {
    headerImagePath: clinic.header_image_path,
    footerImagePath: clinic.footer_image_path,
  });
  const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const archivePath = buildArchivePath(clinic.report_archive_folder, defaultArchiveFolder(), finalized);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, pdfBuffer);
  reportsRepo.setReportPdfInfo(db(), id, archivePath, sha256);
  audit('ARCHIVE_PDF', 'report', id, { path: archivePath, sha256 });

  return reportsRepo.getReportById(db(), id) as ReportWithDetails;
}

handle('reports:create', (_e, payload) => {
  const user = requireRole('ADMIN', 'RECEPTION');
  const input = reportInputSchema.parse(payload);
  const created = reportsRepo.createReport(db(), input, user.id);
  audit('CREATE', 'report', created.id, { report_no: created.report_no });
  return created;
});
handle('reports:updateDraft', (_e, reportId, payload) => {
  requireAuth(); // both TECHNICIAN (results) and RECEPTION (billing/patient) touch drafts
  const input = reportInputSchema.parse(payload);
  const updated = reportsRepo.updateDraftReport(db(), idSchema.parse(reportId), input);
  audit('UPDATE', 'report', updated.id);
  return updated;
});
handle('reports:finalize', async (_e, reportId) => {
  const user = requireRole('ADMIN', 'TECHNICIAN');
  return finalizeAndArchive(idSchema.parse(reportId), user.id);
});
handle('reports:verifyPdf', async () => {
  requireAdmin();
  if (!mainWindow) return { success: false, error: 'No window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a PDF to verify',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  const filePath = result.filePaths[0];
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const match = reportsRepo.findReportByPdfHash(db(), hash);
  audit('VERIFY_PDF', 'report', null, { filePath, hash, matched: !!match });
  return { success: true, matched: !!match, hash, filePath, report: match ?? null };
});
handle('reports:deleteDraft', (_e, reportId) => {
  requireRole('ADMIN', 'RECEPTION');
  const result = reportsRepo.deleteDraftReport(db(), idSchema.parse(reportId));
  audit('DELETE', 'report', idSchema.parse(reportId));
  return result;
});
handle('reports:getById', (_e, reportId) => {
  requireAuth();
  return reportsRepo.getReportById(db(), idSchema.parse(reportId));
});
handle('reports:list', (_e, filters) => {
  requireAuth();
  return reportsRepo.listReports(db(), reportListFiltersSchema.parse(filters));
});
handle('reports:listPage', (_e, filters) => {
  requireAuth();
  return reportsRepo.listReportsPage(db(), reportsPageFiltersSchema.parse(filters || {}));
});
handle('reports:search', (_e, query) => {
  requireAuth();
  return reportsRepo.searchReports(db(), searchQuerySchema.parse(query));
});


// ---------------------------------------------------------------
// Dashboard + revenue
// ---------------------------------------------------------------

handle('dashboard:stats', () => {
  requireAuth();
  return dashboardRepo.getDashboardStats(db());
});

handle('revenue:period', (_e, filters) => {
  requireRole('ADMIN', 'RECEPTION');
  return revenueRepo.getRevenuePeriodReport(db(), revenuePeriodFiltersSchema.parse(filters));
});
handle('revenue:outstandingBalances', () => {
  requireRole('ADMIN', 'RECEPTION');
  return revenueRepo.listOutstandingBalances(db());
});
handle('revenue:exportExcel', async (_e, filters) => {
  requireRole('ADMIN', 'RECEPTION');
  if (!mainWindow) return { success: false, error: 'No window' };
  const parsed = revenuePeriodFiltersSchema.parse(filters);
  const report = revenueRepo.getRevenuePeriodReport(db(), parsed);
  const outstanding = revenueRepo.listOutstandingBalances(db());
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Revenue Report',
    defaultPath: `labpro-revenue-${report.from}-to-${report.to}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  fs.writeFileSync(result.filePath, buildRevenueWorkbook(report, outstanding));
  audit('EXPORT_EXCEL', 'revenue', null, { path: result.filePath, ...parsed });
  return { success: true, path: result.filePath };
});
handle('revenue:exportPdf', async (_e, filters) => {
  requireRole('ADMIN', 'RECEPTION');
  if (!mainWindow) return { success: false, error: 'No window' };
  const parsed = revenuePeriodFiltersSchema.parse(filters);
  const pdfBuffer = await generateRevenuePdf(parsed);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Revenue Report',
    defaultPath: `labpro-revenue-${parsed.granularity}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  fs.writeFileSync(result.filePath, pdfBuffer);
  audit('EXPORT_PDF', 'revenue', null, { path: result.filePath, ...parsed });
  return { success: true, path: result.filePath };
});

handle('testreport:period', (_e, filters) => {
  requireRole('ADMIN', 'RECEPTION');
  return testReportRepo.getTestReportForPeriod(db(), revenuePeriodFiltersSchema.parse(filters));
});
handle('testreport:print', async (_e, filters) => {
  requireRole('ADMIN', 'RECEPTION');
  const parsed = revenuePeriodFiltersSchema.parse(filters);
  const pdfBuffer = await generateTestReportPdf(parsed);
  await printPdfBuffer(pdfBuffer);
  audit('PRINT', 'test_report', null, parsed);
  return { success: true };
});
handle('testreport:exportPdf', async (_e, filters) => {
  requireRole('ADMIN', 'RECEPTION');
  if (!mainWindow) return { success: false, error: 'No window' };
  const parsed = revenuePeriodFiltersSchema.parse(filters);
  const pdfBuffer = await generateTestReportPdf(parsed);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Test Report',
    defaultPath: `labpro-test-report-${parsed.granularity}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  fs.writeFileSync(result.filePath, pdfBuffer);
  audit('EXPORT_PDF', 'test_report', null, { path: result.filePath, ...parsed });
  return { success: true, path: result.filePath };
});

handle('payments:record', (_e, reportId, payload) => {
  const user = requireRole('ADMIN', 'RECEPTION');
  const input = paymentInputSchema.parse(payload);
  const id = idSchema.parse(reportId);
  const payment = paymentsRepo.recordPayment(db(), id, input, user.id);
  audit('RECORD_PAYMENT', 'report', id, { amount: input.amount, method: input.method });
  return payment;
});

// ---------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------

handle('audit:list', (_e, filters) => {
  requireAdmin();
  return auditRepo.listAuditLogPage(db(), auditLogFiltersSchema.parse(filters || {}));
});
handle('audit:actions', () => {
  requireAdmin();
  return auditRepo.listDistinctAuditActions(db());
});
handle('audit:entities', () => {
  requireAdmin();
  return auditRepo.listDistinctAuditEntities(db());
});

// ---------------------------------------------------------------
// Clinic settings, generic settings, logo, print
// ---------------------------------------------------------------

// No auth required: the Login screen itself needs the clinic name/logo
// before anyone has signed in.
handle('settings:get', () => clinicSettingsRepo.getClinicSettings(db()));
handle('settings:update', (_e, fields) => {
  requireAdmin();
  return clinicSettingsRepo.updateClinicSettings(db(), clinicSettingsSchema.partial().parse(fields));
});

// No auth required to read: the idle-timeout value must be readable to
// arm the auto-lock timer immediately after login, and reading a config
// value alone isn't sensitive.
handle('appSettings:get', (_e, key: string) => {
  requireAuth();
  return settingsRepo.getSetting(db(), String(key));
});
handle('appSettings:set', (_e, key: string, value: string) => {
  requireAdmin();
  settingsRepo.setSetting(db(), String(key), String(value));
});

// Used for the small square logo, and the two full-width header/footer
// banner images used only in the "digital PDF" print mode.
handle('settings:pickImage', async (_e, kind: string) => {
  requireAdmin();
  if (!mainWindow) return null;
  if (!['logo', 'header', 'footer', 'signature'].includes(kind)) throw new Error('Invalid image kind.');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const src = result.filePaths[0];
  const destDir = path.join(getUserDataPath(), 'assets');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${kind}${path.extname(src)}`);
  fs.copyFileSync(src, dest);
  return dest;
});

// Used by the Report Archive Folder picker in Settings, and reused as-is
// for the Backup Folder picker below (both are just "pick a directory").
handle('settings:pickFolder', async () => {
  requireAdmin();
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ---------------------------------------------------------------
// Database backup / restore / integrity (Settings > Backup & Restore)
// ---------------------------------------------------------------

handle('backup:now', async () => {
  requireAdmin();
  const info = await runBackup(db(), backupFolder(), 'manual');
  audit('BACKUP', 'database', null, { kind: 'manual', path: info.path });
  return info;
});

handle('backup:list', () => {
  requireAdmin();
  return listBackups(backupFolder());
});

// Restoring is the single most destructive action exposed anywhere in this
// app, so it gets two layers most other actions don't: the currently
// logged-in admin must re-type their password (proving it's really them,
// not just an unlocked session someone walked up to), and a fresh
// "pre-restore" backup of the CURRENT database is taken before anything
// else happens, using the still-open connection. The app then relaunches
// entirely rather than trying to hot-swap the live connection, so every
// cached bit of state (main process and renderer alike) starts clean
// against the restored data.
handle('backup:restore', async (_e, payload) => {
  const user = requireAdmin();
  const input = restoreBackupSchema.parse(payload);
  const full = usersRepo.getUserById(db(), user.id);
  if (!full || !bcrypt.compareSync(input.adminPassword, full.password_hash)) {
    throw new Error('Incorrect password.');
  }
  if (!fs.existsSync(input.backupPath)) throw new Error('That backup file no longer exists.');

  await runBackup(db(), backupFolder(), 'pre-restore');
  audit('RESTORE_BACKUP', 'database', null, { from: input.backupPath });

  const dbPath = getDbPath(getUserDataPath());
  closeDb();
  replaceLiveDatabase(dbPath, input.backupPath);

  app.relaunch();
  app.exit(0);
});

handle('db:healthCheck', () => {
  requireAdmin();
  return checkIntegrity(db());
});

// ---------------------------------------------------------------
// Print layout (Settings > Print Layout)
// ---------------------------------------------------------------

handle('settings:getPrintLayout', () => {
  requireAuth();
  return printSettingsRepo.getPrintLayout(db());
});
handle('settings:updatePrintLayout', (_e, layout) => {
  requireAdmin();
  return printSettingsRepo.setPrintLayout(db(), printLayoutSchema.parse(layout));
});

// ---------------------------------------------------------------
// Printing / PDF — see electron/print.ts for the actual pipeline.
// ---------------------------------------------------------------

handle('print:report', async (_e, reportId, mode) => {
  const id = idSchema.parse(reportId);
  const printMode = mode === 'pdf' ? 'pdf' : 'paper';
  let report = reportsRepo.getReportById(db(), id);
  if (!report) throw new Error('Report not found.');

  if (report.status === 'DRAFT') {
    // Reached when a draft is opened via "Preview" rather than "Finalize &
    // Print" — goes through the exact same validate+lock+archive sequence
    // either way, never a shortcut that skips the completeness check.
    const user = requireRole('ADMIN', 'TECHNICIAN');
    report = await finalizeAndArchive(id, user.id);
  } else {
    requireAuth();
  }

  // A "pdf"-mode reprint of an already-archived report reuses that exact
  // file byte-for-byte, so every reprint is provably identical to what was
  // originally finalized. "paper" mode can never reuse it — the archived
  // copy has the digital header/footer images baked into the margins,
  // which would print on top of physical letterhead — so it's always
  // freshly rendered with blank margins instead.
  if (printMode === 'pdf' && report.pdf_path && fs.existsSync(report.pdf_path)) {
    await printPdfBuffer(fs.readFileSync(report.pdf_path));
  } else {
    const layout = printSettingsRepo.getPrintLayout(db());
    const clinic = clinicSettingsRepo.getClinicSettings(db());
    const pdfBuffer = await generateReportPdf(id, printMode, layout, {
      headerImagePath: clinic.header_image_path,
      footerImagePath: clinic.footer_image_path,
    });
    await printPdfBuffer(pdfBuffer);
  }
  audit('PRINT', 'report', id, { mode: printMode });
  return { success: true };
});

handle('print:openPdf', async (_e, reportId) => {
  requireAuth();
  const id = idSchema.parse(reportId);
  const report = reportsRepo.getReportById(db(), id);
  if (!report || !report.pdf_path) throw new Error('No saved PDF for this report yet.');
  if (!fs.existsSync(report.pdf_path)) {
    throw new Error('The saved PDF file could not be found on disk — it may have been moved or deleted.');
  }
  // shell.openPath NEVER rejects — confirmed against electron.d.ts, it
  // always resolves, with an empty string on success or an error message
  // on failure (e.g. no application registered to open PDFs). The
  // previous fire-and-forget call meant a real failure here was
  // completely invisible: the button appeared to do nothing.
  const error = await shell.openPath(report.pdf_path);
  if (error) throw new Error(`Could not open the PDF: ${error}`);
  return { success: true };
});

handle('print:openFolder', (_e, reportId) => {
  requireAuth();
  const id = idSchema.parse(reportId);
  const report = reportsRepo.getReportById(db(), id);
  if (!report || !report.pdf_path) throw new Error('No saved PDF for this report yet.');
  if (!fs.existsSync(report.pdf_path)) {
    throw new Error('The saved PDF file could not be found on disk — it may have been moved or deleted.');
  }
  shell.showItemInFolder(report.pdf_path);
  return { success: true };
});

handle('print:savePdf', async (_e, reportId) => {
  requireAuth();
  if (!mainWindow) return { success: false, error: 'No window' };
  const id = idSchema.parse(reportId);
  const report = reportsRepo.getReportById(db(), id);
  if (!report) return { success: false, error: 'Report not found.' };

  const layout = printSettingsRepo.getPrintLayout(db());
  const clinic = clinicSettingsRepo.getClinicSettings(db());
  // Saved/shared PDFs always use the digital header/footer images (if
  // configured) — there's no physical letterhead behind a shared file.
  const pdfBuffer = await generateReportPdf(id, 'pdf', layout, {
    headerImagePath: clinic.header_image_path,
    footerImagePath: clinic.footer_image_path,
  });

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Report PDF',
    defaultPath: `${report.report_no}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  fs.writeFileSync(result.filePath, pdfBuffer);
  audit('EXPORT_PDF', 'report', id, { path: result.filePath });
  return { success: true, path: result.filePath };
});

handle('print:testPage', async () => {
  requireAdmin();
  const layout = printSettingsRepo.getPrintLayout(db());
  const pdfBuffer = await generateAlignmentTestPage(layout);
  await printPdfBuffer(pdfBuffer);
  return { success: true };
});

// ---------------------------------------------------------------
// Excel import/export (SheetJS). File dialogs are main-process-only, so
// both directions are driven from here rather than the renderer.
// ---------------------------------------------------------------

handle('tests:exportExcel', async () => {
  requireAdmin();
  if (!mainWindow) return { success: false, error: 'No window' };
  const tests = testsRepo.listTests(db(), true);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Test Catalog',
    defaultPath: 'labpro-test-catalog.xlsx',
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  fs.writeFileSync(result.filePath, buildTestCatalogWorkbook(tests));
  return { success: true, path: result.filePath };
});

handle('tests:importExcel', async () => {
  requireAdmin();
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Test Catalog',
    properties: ['openFile'],
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx', 'xls', 'csv'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  const buffer = fs.readFileSync(result.filePaths[0]);
  const rows = parseTestCatalogWorkbook(buffer);
  const categories = categoriesRepo.listCategories(db());
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of rows) {
    if (!row.short_code || !row.name) {
      skipped++;
      errors.push('Skipped a row missing short code or name.');
      continue;
    }
    try {
      testsRepo.createTest(db(), {
        name: row.name,
        short_code: row.short_code,
        category_id: row.category ? categoryByName.get(row.category.toLowerCase()) ?? null : null,
        price: row.price || 0,
        sample_type: row.sample_type || '',
        report_notes: '',
      });
      inserted++;
    } catch {
      skipped++;
    }
  }
  audit('IMPORT', 'test', null, { inserted, skipped });
  return { totalRows: rows.length, inserted, skipped, errors };
});

// ---------------------------------------------------------------
// Full test-catalog import/export as JSON — categories, tests, and every
// parameter (unlike the flatter Excel round trip above).
// ---------------------------------------------------------------

handle('tests:exportJson', async () => {
  requireAdmin();
  if (!mainWindow) return { success: false, error: 'No window' };
  const data = catalogRepo.exportCatalogToJson(db());
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Test Catalog (JSON)',
    defaultPath: 'labpro-catalog.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
  return { success: true, path: result.filePath };
});

handle('tests:importJson', async () => {
  requireAdmin();
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Test Catalog (JSON)',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const data = catalogImportSchema.parse(parsedJson);
  const importResult = catalogRepo.importCatalogFromJson(db(), data);
  audit('IMPORT', 'test_catalog', null, importResult);
  return importResult;
});

handle('reports:exportExcel', async (_e, filters) => {
  requireRole('ADMIN', 'RECEPTION');
  if (!mainWindow) return { success: false, error: 'No window' };
  const reports = reportsRepo.listReports(db(), reportListFiltersSchema.parse(filters));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Reports',
    defaultPath: 'labpro-reports.xlsx',
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  fs.writeFileSync(result.filePath, buildReportsWorkbook(reports));
  return { success: true, path: result.filePath };
});
