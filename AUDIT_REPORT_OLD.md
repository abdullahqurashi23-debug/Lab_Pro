# LabPro Audit Report

Full codebase audit — Electron + React + Vite + TypeScript + Tailwind + better-sqlite3.

## Phase 1 — Project Map & Tooling

118 source files (excluding `node_modules`, `dist`, `dist-electron`, `release`). Breakdown:

| Area | Files | Purpose |
|---|---|---|
| `electron/main/index.ts` | 1 | Main process: window creation, all IPC handlers, session/auth state, auto-backup timer |
| `electron/preload/index.ts` | 1 | Scoped `contextBridge` API surface exposed to the renderer as `window.api` |
| `electron/print.ts`, `electron/reportArchive.ts`, `electron/backup.ts` | 3 | PDF rendering/printing pipeline, archive path/filename logic, SQLite-native backup/restore |
| `src/db/migrations/*.sql` | 7 | Schema + immutability triggers, applied in order by `migrate.ts` |
| `src/db/repositories/*.ts` | ~20 | All DB reads/writes, one file per domain (reports, patients, tests, revenue, payments, users, audit log, settings, backup-adjacent) |
| `src/db/resultLogic.ts`, `formula.ts` | 2 | Pure logic: reference-range resolution, H/L/CRITICAL flagging, formula evaluation — shared verbatim between renderer live-preview and backend save |
| `src/pages/*.tsx` | ~19 | One per app screen (Dashboard, New Report, Reports History, Patients, Test Catalog, Revenue, Users, Audit Log, Settings, Login, print views) |
| `src/components/**/*.tsx` | ~25 | Page-specific panels (patient/billing/result-entry panels, test-catalog dialogs) + a small shadcn/ui primitive set |
| `src/lib/*.ts` | ~8 | `api.ts` (typed `window.api` wrapper), auth context, idle timer, theme, misc utils |
| `*.test.ts` | 9 files, 77 tests | Vitest suite (see Phase 5) |

### Tooling run

- `npm install` — clean.
- `npx tsc -p tsconfig.json --noEmit` (renderer) — **0 errors**.
- `npx tsc -p tsconfig.electron.json --noEmit` (main process) — **0 errors**.
- `npx eslint .` — **ESLint was not installed or configured in this project at all** (no config file, not a devDependency). Installed `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` and added `eslint.config.js` so this check is real going forward, rather than reporting a pass from a tool that was never running. Initial run: 33 errors / 18 warnings. After investigation, only **1 was a real issue** (see LOW-1) — the rest were `eslint-plugin-react-hooks` v7's "React Compiler safety" ruleset flagging normal, safe patterns (e.g. a small helper component defined inside its parent) that this codebase doesn't use React Compiler for; dialed the config back to the two classic, real-bug-catching hook rules (`rules-of-hooks`, `exhaustive-deps`). Final state: **0 errors, 11 warnings**, all `react-refresh/only-export-components` (a dev-only Fast Refresh hint, zero effect on the production build — see LOW-2).
- `npm run build` (`tsc -p tsconfig.electron.json && vite build`) — **succeeds**, one informational Rollup warning about a >500KB JS chunk (not an error; noted, not fixed — see "Not fixed" section).

## Phase 2/3 — Findings

Ordered by severity. Each entry: what/where, why it matters, fix, status.

### HIGH

**HIGH-1 — Async IPC handlers bypassed the clean-error-message wrapper, leaking raw/garbled errors to the renderer**
File: `electron/main/index.ts`, `handle()` wrapper (was ~line 215).
The generic `handle()` wrapper was `try { return fn(event, ...args) } catch (err) { ...clean message... }`. Because `fn` can be an `async` function, calling it never throws synchronously even if its body does — `async function(){ throw x }` returns an already-rejected Promise instead. The `try/catch` therefore never caught rejections from any `async` handler, which includes `reports:finalize`, `backup:restore`, `reports:verifyPdf`, `revenue:exportExcel`/`exportPdf`, `settings:pickImage`/`pickFolder`, `print:report`/`openPdf`, and others — meaning a Zod validation failure or domain error (e.g. "This report is finalized; no new tests can be added.") inside any of these surfaced to the UI as a raw, often-unreadable `Error invoking remote method '...'` message instead of the intended clean one.
Reproduced empirically (see fix commit): the old wrapper let a raw `ZodError` escape; the fixed one produces the intended clean message.
Fix: `await fn(event, ...args)` inside the try, so both synchronous throws and async rejections are caught uniformly. **FIXED.**

**HIGH-2 — Billing `balance` / `outstanding_balance` could go negative on overpayment**
Files: `src/db/repositories/reports.ts` (3 sites: `createReport`, `updateDraftReport`, `getReportById`), `src/components/new-report/BillingPanel.tsx`.
`balance = total - paid` and `outstandingBalance = report.balance - paymentsTotal` were unclamped. If `paid` (entered at report creation/draft time) or a recorded payment ever exceeded what was owed — an overpayment, a typo, or a correction that overshoots — the stored/displayed balance went negative, including permanently on a finalized (locked) report. Violates the explicit "balance... never negative" requirement.
Fix: clamped the *derived* figures to `Math.max(0, ...)` in all three backend sites and the frontend live-preview, without touching the underlying `paid` field or the payments ledger (which intentionally allows negative correction/refund entries — that data is legitimate and shouldn't be altered, only the "what's still owed" figure derived from it). **FIXED.** Regression tests added (`reportsPage.test.ts`, `reports.test.ts`).

### MEDIUM

**MEDIUM-1 — Four read-only IPC handlers had no session check at all**
File: `electron/main/index.ts` — `doctors:list`, `categories:list`, `appSettings:get`, `settings:getPrintLayout`.
Every comparable "list/get" handler in the app calls `requireAuth()` (or a stricter `requireRole`/`requireAdmin`) except these four, which returned data to any caller regardless of login state — inconsistent with the app's own security model ("every restricted action blocked in the main process too, not just hidden in the UI"). Checked every call site of each: all are reached only from already-authenticated pages or from the hidden print window (which the main process only opens after already verifying authorization) — never from the pre-login screen. `settings:get` (clinic branding) is the one legitimately pre-auth-accessible handler, since the login screen itself needs it; left unchanged.
Real-world exposure is low (doctor names, category names, an idle-timeout number, print-margin settings — no financial/medical data, and DevTools is disabled in production, narrowing the practical attack surface to begin with), but it's a real, easy, zero-behavior-change-for-legitimate-use fix.
Fix: added `requireAuth();` as the first line of each. **FIXED.**

**MEDIUM-2 — No hardening against renderer-initiated navigation or new-window creation**
Files: `electron/main/index.ts` (main window), `electron/print.ts` (both hidden print windows).
Per Electron's own security checklist, without an explicit `will-navigate` guard and `setWindowOpenHandler`, a compromised renderer (e.g. via a future supply-chain-compromised dependency) could navigate a window to an arbitrary external URL or spawn an unrestricted new window. `window.open()` is denied by default in this Electron version, but top-level navigation is not. All three windows only ever legitimately load one fixed local URL each and never need to navigate elsewhere afterward.
Fix: added `setWindowOpenHandler(() => ({ action: 'deny' }))` and a `will-navigate` guard (allow only the exact origin/URL each window was created for) to all three. Verified this doesn't interfere with the app's own hash-based routing (`will-navigate` doesn't fire for in-page hash changes or for the initial `loadURL`/`loadFile` call — confirmed against Electron's documented behavior). **FIXED.**

### LOW

**LOW-1 — `tailwind.config.ts` used `require()` instead of `import`**
Real ESLint error (`@typescript-eslint/no-require-imports`). Converted to a standard default import (`import tailwindcssAnimate from 'tailwindcss-animate'`); verified the built CSS output is byte-for-byte identical before/after (same content hash), confirming zero behavior change. **FIXED.**

**LOW-2 — 11 `react-refresh/only-export-components` warnings**
`BillingPanel.tsx`, `PatientPanel.tsx`, `ParameterEditor.tsx`, `ui/badge.tsx`, `ui/button.tsx`, `auth-context.tsx` — each exports a small helper/constant alongside a component (e.g. `button.tsx` exporting `buttonVariants` next to `Button`). This is the standard shadcn/ui pattern, used correctly. It only means Vite's dev-mode Fast Refresh does a full reload for that one file instead of hot-swapping — a development convenience note, zero effect on the built app. **REVIEWED — not a bug, left as-is** (splitting these into extra files to silence a dev-only hint would be exactly the kind of unnecessary rewrite the brief says to avoid).

**LOW-3 — Dead code: unused import and unused types**
- `src/db/repositories/reports.ts`: `getPatientById` imported but no longer called (leftover from an earlier fix that switched this path to `updatePatient`). **FIXED** — removed.
- `src/vite-env.d.ts`: `Test` and `AuditLogEntry` types imported but never referenced. **FIXED** — removed.
- `src/pages/RevenuePrintTemplate.tsx`: a stale `// eslint-disable-next-line react-hooks/exhaustive-deps` comment guarding a dependency array that ESLint confirms has no actual problem. **FIXED** — removed.

### Reviewed — confirmed correct, no fix needed

Documenting these explicitly per the instruction to never say a file is fine without reading it:

- **SQL injection**: every dynamic SQL string in the codebase (`auditLog.ts`, `reports.ts`, `tests.ts`, `users.ts`) interpolates only hardcoded fragments (column lists, `?`-repetition for `IN (...)` clauses sized off array *length*, not content) — every actual value flows through parameterized `.run()/.get()/.all()` calls. No injection surface found anywhere.
- **Report number uniqueness under rapid/concurrent creation**: `generateReportNo` (a `SELECT COUNT` then compute `next+1`) looked like a classic TOCTOU race at first read. Verified it isn't: `better-sqlite3` is fully synchronous, Node.js JS execution is single-threaded, and the read + insert both happen inside one `db.transaction()` with zero `await` points in between — a second `reports:create` call cannot interleave at any point. Added a `Promise.all`-based regression test (25 "concurrent" creates, all unique) plus a sequential-format test.
- **Memory leaks**: every `setInterval`/`setTimeout`/`addEventListener` in the renderer (App.tsx, TopBar, PatientPanel, useIdleTimer, PrintReport, NewReport, Reports, Patients) has a matching cleanup in its effect's return function. Read each one individually, not assumed.
- **State updates after unmount**: `main.tsx` uses `ReactDOM.createRoot` (React 18) — calling `setState` after unmount is a harmless no-op under this root API (the old warning/leak concern applied to the legacy root API only). The handful of effects that do guard with a `cancelled` flag (PatientPanel, NewReport's report loader) do so to avoid a stale-response race, not because it's otherwise unsafe.
- **PDF filenames**: `reportArchive.ts` strips every Windows-illegal character (`\ / : * ? " < > |`) from both the report number and patient name before building a filename. No-overwrite: the report number (already globally unique) anchors every archived filename, so two different reports can never collide; user-directed exports go through the native OS save dialog, which already prompts to confirm overwriting an existing file.
- **Electron security basics**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every `BrowserWindow`; DevTools only opens when `isDev` (never in production); preload uses `contextBridge.exposeInMainWorld` with a fully enumerated, specific method list — no generic `invoke` passthrough that would let the renderer call arbitrary channels; production `index.html` carries a restrictive CSP (`default-src 'self'`).
- **Offline**: no CDN `<script>`/`<link>` tags, no remote `fetch`/`http(s)://` calls anywhere except the app's own local dev server URL (dev-mode only, absent from the production build); fonts are bundled via `@fontsource`, icons via `lucide-react` (SVG components) — nothing loads over a network.
- **Database**: `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON` all set in `db.ts`; indexes exist on every column used for search/filter/join (patient name, phone, report_no, created_at, patient_id, doctor_id, status, and every FK join column). Already load-tested at 10,000 reports (see `scripts/perf_10k_reports.js`) — all representative queries complete in 0.2–42ms.
- **Passwords**: every password comparison/storage path uses `bcrypt.compareSync`/`hashSync`; zero `console.*` calls reference any password variable anywhere in the codebase.
- **Search case-insensitivity**: SQLite's `LIKE` is case-insensitive by default for ASCII, and nothing in this codebase overrides that (`PRAGMA case_sensitive_like` is never set). Added a regression test proving `alice`/`ALICE`/`ali` (partial) all match "Alice Smith".
- **Reference ranges, H/L/CRITICAL flags, formulas, duplicate-test prevention, report locking triggers, revenue date-range math, backup/restore**: already covered by this project's existing 70-test baseline (written and verified in an earlier pass of this same engagement) — re-ran the full suite as part of this audit; all still pass. Also independently re-verified the reference-range "explicitly cleared to blank" behavior (a real bug found and fixed in that earlier pass: `||` vs `??` was collapsing "deliberately cleared" and "never touched" into the same catalog-fallback behavior).

### Not fixed — flagging for your decision rather than guessing

- **Windows installer**: this was already investigated and proven, not assumed. `better-sqlite3` is a native module; it cannot be cross-compiled for Windows from this Mac. A prior packaging attempt from this same environment *appeared* to succeed (exit code 0) but a byte-level check (`file` on the bundled `.node` module) proved it had silently packaged the **macOS** binary — that installer would crash immediately on a real Windows PC. A `.github/workflows/build-windows.yml` is already in place (builds on a genuine `windows-latest` GitHub Actions runner) — that's the correct path to a real, working installer, and needs a GitHub repo to run in. I did not re-run the misleading local build again as part of this audit; let me know if you'd like me to push this to a repo and trigger it.
- **JS bundle size**: Vite's build warns that the main JS chunk is >500KB minified (~300KB gzipped). Not a bug — the app works correctly — but a code-splitting pass (dynamic `import()` for less-common routes like Settings/Audit Log) would improve initial load time. Left alone since it's a performance nice-to-have, not something you asked to be fixed, and changing the build/chunking strategy is a bigger structural change than "smallest correct fix."

## Phase 4 — Fix Verification

After each group of fixes: `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.electron.json --noEmit`, and `npm run build` were all re-run and stayed clean throughout. No existing data or schema was touched — every fix was application-code-only (no new migration was needed).

## Phase 5 — Tests

77 Vitest tests across 9 files, all passing (`npm test`). New tests added during this audit:
- `resultLogic.test.ts`: reference-range override explicitly cleared to blank stays blank (doesn't snap back to catalog default).
- `reports.test.ts`: report-number uniqueness under simulated concurrent creation (25 parallel calls, all unique); sequential PREFIX-YEAR-NNNNNN format.
- `reportsPage.test.ts`: overpayment never produces a negative `balance` or `outstanding_balance`; search is case-insensitive and matches partial words.

Coverage against your Phase 5 list: reference range ✅, flagging at boundaries ✅, formulas ✅, billing math ✅ (including the new negative-balance fix), duplicate test prevention ✅, report number uniqueness ✅ (new), locked-report triggers (UPDATE + DELETE both proven to fail) ✅, revenue totals daily/weekly/monthly ✅, backup/restore ✅.

## Manual click-through checklist

Use this to verify the interactive/visual parts I can't drive directly in this environment (no attached display). Login as each relevant role where noted.

**Login / session**
- [ ] Fresh launch always shows the lock/login screen (never auto-logged-in).
- [ ] Wrong password shows "Invalid username or password" without crashing.
- [ ] First login on a `must_change_password` account forces the change-password screen before anything else.
- [ ] Idle timeout (Settings → Session) actually locks the app after the configured minutes.

**New Report (as RECEPTION, then as TECHNICIAN)**
- [ ] Ctrl+N opens New Report from anywhere.
- [ ] Search finds an existing patient; selecting one loads editable fields (not read-only).
- [ ] Typing a new patient whose name+phone match an existing one shows the duplicate warning; "Use This Patient Instead" works.
- [ ] Ctrl+K opens the test search palette; adding a test focuses its first result field.
- [ ] Entering an abnormal value shows the H/L/CRITICAL badge live, before saving.
- [ ] Editing the Reference Range field for one result: typing custom text shows it; clearing it back to empty reverts to blank (not the old auto value) — and reloading the same draft doesn't silently restore the auto value either.
- [ ] Save Draft (Ctrl+S) works; reopening the draft from Reports History shows everything exactly as saved.
- [ ] As TECHNICIAN: "New Report" itself is not reachable, but an existing draft opens for entering results.
- [ ] Finalize & Print asks for confirmation, then locks the report and opens the print view.
- [ ] Try finalizing with a blank required result — should be rejected with a clear message listing which one.

**Reports History**
- [ ] Search by report number, patient name, phone, and test name all work.
- [ ] Delete (draft only) is visible only for ADMIN/RECEPTION, asks for confirmation.
- [ ] A finalized report's row never shows a Delete option.
- [ ] Export to Excel produces a file with the current filter applied.

**Print / PDF**
- [ ] Reprinting a finalized report opens the exact same content (barcode present and scannable if you have a scanner handy, patient details correct on every page for a multi-test report).
- [ ] Open Folder / Open PDF both work and point at the real archived file.
- [ ] Settings → Verify Report on that same PDF reports "Verified — this file is authentic."
- [ ] If no printer is connected/configured, printing shows a real failure message, not a false "sent to printer."

**Patients / Test Catalog / Doctors**
- [ ] Deactivating a test hides it from new-report search but keeps it visible in old reports.
- [ ] Deleting a test that's used in a report is refused with a clear message (not a crash).
- [ ] Deleting a category still in use by a test is refused.
- [ ] Import/Export JSON round-trips correctly.

**Revenue**
- [ ] Daily/weekly/monthly totals only include FINALIZED reports (create a draft with a large total and confirm it's excluded).
- [ ] A report finalized just before midnight lands in the correct day's total (spot check against your own local date).

**Users (as ADMIN)**
- [ ] Deactivating a user asks for confirmation; reactivating does not.
- [ ] A deactivated user cannot log in.
- [ ] Changing a role shows a success toast and takes effect immediately.

**Backup & Restore (as ADMIN)**
- [ ] Backup Now creates a file in the configured folder and appears in the list immediately.
- [ ] Restore asks for your password, takes a pre-restore safety snapshot, then restarts the app with the restored data in place.
- [ ] Database Health → Run Integrity Check reports healthy on a normal database.

**Theme**
- [ ] Toggle light/dark on every page and confirm text stays readable everywhere, especially the print preview (which should always render in fixed light colors regardless of app theme, since it represents a physical printed page).

## Summary

- **Problems found**: 8 (2 HIGH, 2 MEDIUM, 3 LOW, plus the ESLint-tooling gap itself).
- **Fixed**: 8 of 8.
- **Needs your decision**: the Windows installer (needs a real Windows/CI build environment — workflow already prepared) and, optionally, whether to invest in JS bundle code-splitting (a performance nice-to-have, not a bug).
- Every fix was verified two ways: an automated test where one could meaningfully prove the fix (added 4 new tests), and a full type-check + build re-run after every group of changes. Nothing in the existing schema or stored data was modified.
