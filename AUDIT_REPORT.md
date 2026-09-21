# LabPro Audit Report (Second Pass)

Full re-audit after the Test Report page, Performed By field, print redesign, and
navigation fixes were added. The previous audit's findings are preserved in
`AUDIT_REPORT_OLD.md` — this report only covers what's new or was re-checked
this time. Per your instruction, the license/activation system is **not**
built and is **not** treated as missing below.

## Phase 1 — Project Map & Tooling

122 source files (up from 118 at the last audit; new: `testReport.ts`,
`TestReport.tsx`, `TestReportPrintTemplate.tsx`, `testReport.test.ts`,
migration `008_performed_by.sql`).

- `npm install` — clean.
- `npx tsc -p tsconfig.json --noEmit` (renderer) — **0 errors**.
- `npx tsc -p tsconfig.electron.json --noEmit` (main) — **0 errors**.
- `npx eslint .` — **0 errors**, 11 warnings (all pre-existing, reviewed in the
  last audit — `react-refresh/only-export-components` dev-only hints from the
  standard shadcn/ui pattern of exporting a helper next to a component; zero
  effect on the production build).
- `npm run build` — succeeds (same >500KB chunk-size advisory as before, not
  a bug, not fixed, noted last time as a possible future improvement).

## Phase 2/3 — Findings

Every item below was independently verified (a failing test written first,
or an empirical script run against real SQLite/Chromium behavior) before
being called a bug — not assumed from reading the code alone.

### CRITICAL

**CRITICAL-1 — The finalized-report lock trigger never knew about the new `performed_by` column**
File: `src/db/migrations/004_finalize_archive.sql`'s `prevent_finalized_report_update` trigger.
This trigger blocks edits to a finalized report by explicitly checking each protected column (`NEW.x IS NOT OLD.x OR ...`). `performed_by` was added later (migration 008) and was never added to that list. Verified with a test: a raw SQL `UPDATE reports SET performed_by = 'Someone Else' WHERE id = ?` on a finalized report **succeeded silently** — a direct, real bypass of the immutability guarantee the rest of the audit explicitly asks to verify ("finalized reports cannot be edited... directly in SQL"). The application code (`updateDraftReport`) already refuses to touch a finalized report before it ever reaches SQL, so this wasn't reachable through the normal UI — but the whole point of a database-level trigger is to hold even if a future code path, script, or bug skips the application check.
Fix: new migration `009_lock_performed_by.sql` redefines the trigger with `performed_by` added to the protected list (same `DROP TRIGGER` + `CREATE TRIGGER` pattern already used once before in migration 004 for the same trigger). **FIXED**, verified with a test that now correctly fails to update.

### HIGH

**HIGH-1 — "Weekly" was a rolling 7-day window, not a Monday-Sunday calendar week**
File: `src/db/repositories/revenue.ts`, `getAnchors()`/`resolvePeriod()`.
You explicitly asked me to verify "weekly (Monday–Sunday)." It wasn't: `week_start` was computed as `date('now','-6 days')` — a trailing 7-day window ending today, not aligned to any particular weekday. Verified empirically: on the day this was checked (a Monday), the old code computed last Tuesday as the week's start. This affects both the Revenue page and the new Test Report page, since both share this function. The trend chart's own week-bucketing (`BUCKET_EXPR.week`) already used the correct Monday-aligned formula — so the codebase already "knew" the right formula, it just wasn't applied to the actual period boundary.
Fix: `week_start`/`prev_week_start`/`prev_week_end` now use the same Monday-aligned expression as the existing bucket logic. Verified: the new week start always falls on a Monday (checked programmatically, not for one hardcoded date), the previous week is a full contiguous non-overlapping 7-day Mon-Sun span, and a report from 8+ days ago (which can never be in the current week regardless of today's weekday) is correctly excluded. **FIXED.** Two pre-existing tests that had encoded the *old, wrong* rolling-window behavior as "correct" were updated to test real calendar weeks instead — they were the reason this bug was invisible before: they were unintentionally testing that the bug was consistent, not that it was right.

**HIGH-2 — A report's discount was never clamped to its own subtotal, server-side**
File: `src/db/repositories/reports.ts`, `createReport` and `updateDraftReport`.
`total = Math.max(0, subtotal - discount)` correctly floors the *total* at 0, but the *discount value itself* was stored exactly as the client sent it, with no server-side check that it doesn't exceed the subtotal. If it ever did (bad client data, or a report edited down to fewer/cheaper tests after a discount was already set), the stored `discount` figure would be larger than what was actually deducted — breaking "Gross − Discount = Net" for that report specifically, and inflating any report that sums `discount` on its own (e.g. Revenue's "Total Discounts Given"). The frontend's billing panel already clamps this client-side, but nothing re-verified it on the way into the database.
Fix: both functions now clamp `discount = Math.min(subtotal, rawDiscount)` after the subtotal is known (subtotal isn't known until after the tests are written, so the clamp happens right after that, before the final total/balance calculation). **FIXED**, with tests proving a 5000-value discount against a 500 subtotal is stored as exactly 500, both on create and on a draft edit.

**HIGH-3 — The same test could be added twice to one report, with no backend check**
File: `src/db/repositories/reports.ts`, `writeReportTests`.
The New Report screen already refuses to add a test that's already selected (`selectedTests.some(...)`) — but that's UI-only. Nothing in the zod schema or the repository layer rejected a submission with the same `test_id` listed twice. That would double-charge the test's price into the subtotal, and would create two `report_tests` rows sharing the same `test.id` — which the UI keys its result-entry rows by, a real React key collision waiting to happen if such a report were ever reopened. Verified: a direct call with a duplicated `test_id` succeeded before this fix.
Fix: `writeReportTests` now checks for a repeated `test_id` before writing anything and throws a clear error. **FIXED**, with a test confirming the rejection.

**HIGH-4 — The Test Report's grand-total row repeated on every printed/PDF page instead of appearing once at the true end**
File: `src/pages/TestReportPrintTemplate.tsx`.
The totals row was rendered inside a `<tfoot>` of the main results table. I verified empirically (rendered a real multi-page PDF via the same Chromium engine Electron uses, then inspected each page's text) that Chromium's print engine repeats a `<tfoot>` on every page a `<table>` spans — the same way `<thead>` does. This directly contradicts your explicit checklist item ("grand totals at the end, nothing cut off"): a Test Report period with enough finalized reports to span multiple pages would show the full-period grand total on every page, not just the last one — someone glancing at page 1 of a 3-page report would see "12 reports, Af X total" next to only the 4 rows visible on that page, which reads as if that page's total is Af X.
Fix: the totals row now renders as a second, separate `<table>` placed immediately after the results table closes, instead of inside a `<tfoot>` of the same table — a separate table element can only ever render where it sits in the flow, once. Verified with the same empirical method: re-rendered a 150-row/5-page test PDF with the corrected structure and confirmed the total marker now appears on page 5 only (0 occurrences on pages 1-4). **FIXED.**

**HIGH-5 — Auto-save's "already saving" guard didn't actually cover auto-save**
File: `src/pages/NewReport.tsx`, `save()`.
The auto-save timer's guard condition was `if (dirty && canSave && !saving) save(true)`. But `setSaving(true)` is only ever called `if (!silent)` inside `save()` — and auto-save always calls `save(true)` (silent). This means the `saving` state never actually becomes `true` for an auto-save, so the `!saving` check was providing no real protection: if one auto-save were ever slow enough (a sluggish disk, antivirus scanning the DB file, unusual load) to still be in flight when the next 5-second tick fired, and the report hadn't been assigned an ID yet, both overlapping calls would independently call `api.reports.create()` — silently producing two separate draft reports for what the user experienced as one continuous editing session. This is exactly the "auto-save never creates duplicate reports" property this audit asked me to verify, and it wasn't actually guaranteed.
Fix: added a `useRef`-backed reentrancy guard inside `save()` itself, set the instant a save starts and cleared when it ends — this protects every caller (auto-save, manual Save Draft, Preview, Finalize) uniformly, not just the auto-save timer's own check. **FIXED.** This is a UI-level timing fix with no existing React-component test infrastructure in this project to exercise it automatically (same limitation noted for the earlier `useBlocker` race fix) — the logic itself is straightforward and was reasoned through carefully, but flagging that it wasn't proven with an automated test the way the database-level fixes above were.

### Reviewed — confirmed correct via a real test or empirical check, not just re-read

- **Month/year date-math edge cases** (Dec→Jan rollover, non-leap Feb 28, leap-year Feb 29, 31-day→30-day month transitions): all computed via SQLite's own `date()` function, never custom JS date arithmetic. Verified each case directly against a real SQLite connection with fixed dates rather than trusting "SQLite is usually right" — all four came back correct.
- **"Gross − Discount = Net; row totals add up to grand totals"**: verified with new tests that `byPaymentMethod`, `byDoctor` each sum exactly to `current.revenue` for the same period, and that the day-by-day trend sums exactly to `current.revenue` for a custom range (the trend intentionally covers a *wider* historical window than the selected period for daily/weekly/monthly/yearly, by design — that's the chart showing context, e.g. a 30-day trend line behind "today's" number — but for a custom range the trend and the total cover the identical window, and that's what was checked).
- **`byCategory`/`byTest` breakdowns**: confirmed these are gross per-test-line figures (using `price_snapshot`), which is documented in the code as intentional — there's no principled way to attribute one report-level discount back to a specific test line, so these don't sum to the post-discount total and were never meant to.
- **Snapshot integrity**: `writeReportTests` snapshots `test.name`/`test.price` at write time; editing the Test Catalog later never touches an already-written `report_tests` row. Confirmed this applies correctly to draft edits too (re-snapshotting current catalog data on every save is correct behavior for a still-mutable draft — the "never changes" guarantee is specifically about finalized/locked reports, which the trigger layer enforces separately).
- **Report number uniqueness under rapid calls**: unchanged since the last audit; still backed by the same reasoning (fully synchronous `better-sqlite3`, single JS thread, one `db.transaction()`) and the same passing concurrency test.
- **PDF/Excel export filenames**: Test Report's export filename (`labpro-test-report-{granularity}.pdf`) has no user-controllable content at all (granularity is a fixed enum), so there's no Windows-illegal-character risk to check here, unlike the per-patient archive filenames (already sanitized, checked in the last audit).
- **Preload surface, contextIsolation/sandbox, DevTools-in-production**: unchanged since the last audit; the new `testReport` preload methods follow the exact same scoped, specific-channel pattern as every other namespace — no generic passthrough was introduced.
- **Empty-period UI**: both Revenue's chart and Test Report's table show a clear "No finalized reports in this period" message rather than a blank chart or a crash — checked the actual empty-state branches, not just assumed they existed.
- **Dark/light theme on the new Test Report page**: no hardcoded colors — uses the same theme-aware Tailwind classes as every other on-screen page. The print template correctly does the opposite (fixed colors only), consistent with the established rule that printed output must never depend on the app's theme.
- **`PrintTemplateContent.tsx` (the per-patient report print template)**: does not use `<tfoot>` anywhere, so it was never exposed to the HIGH-4 bug above. Its tables render all content in `<tbody>` with no separate totals footer to worry about.

### Not independently confirmed — flagging honestly rather than guessing

**Test Report has no Excel export**, only Print and Save as PDF. The audit checklist assumes all four formats (screen/print/PDF/Excel) exist and match — Revenue has all four, Test Report was deliberately built with a smaller scope (matching what you originally asked for) and doesn't have an Excel export to compare against. Not a bug — flagging so you can tell me if you want one added.

## Phase 4 — Fix Verification

After every fix: `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.electron.json --noEmit`, and the full test suite were re-run and stayed clean. No existing data or schema was altered — the one schema change (locking `performed_by`) is a new migration (009), same as `performed_by` itself was (008); neither touches existing rows.

## Phase 5 — Tests

98 Vitest tests (up from 89), all passing. New this pass:
- `revenue.test.ts`: this week's start is always a real Monday (checked programmatically, not hardcoded); previous week is a full contiguous 7-day span; an 8-days-ago report is excluded from "weekly" regardless of what day the test runs; `byPaymentMethod`/`byDoctor` sum to `current.revenue`; a custom range's day-by-day trend sums to `current.revenue`.
- `testReport.test.ts`: the "weekly" test was rewritten to check real calendar-week behavior instead of the old rolling-window assumption.
- `reportsPage.test.ts`: discount is clamped to the subtotal on both create and draft-edit.
- `reports.test.ts`: a direct SQL update to `performed_by` on a finalized report is blocked; submitting the same `test_id` twice in one report is rejected.

## Manual click-through checklist

Same checklist from the last audit still applies for everything unchanged.
New/changed items to specifically re-check:

**Test Report page**
- [ ] Daily / Weekly / Monthly toggle each show the expected reports; switching to Weekly on a Monday now shows *today onward*, not a rolling week from a few days ago.
- [ ] A report finalized late Sunday night and one finalized early Monday morning land in *different* weeks when you check them on Tuesday.
- [ ] Print sends it to the printer; Save as PDF prompts a save location and the numbers match the on-screen table exactly.
- [ ] An empty period (pick a slow day) shows "No finalized reports in this period," not a blank page.
- [ ] Print/export a period with enough reports to span 2+ printed pages — confirm the "Total" row appears once, at the true end (already fixed and verified with a real rendered multi-page PDF, but worth a final visual sanity check on your machine).

**New Report — billing**
- [ ] Try entering a discount larger than the subtotal (e.g. subtotal Af 500, discount Af 5000) — total should read Af 0, and the discount shown/saved should read Af 500, not Af 5000.
- [ ] Confirm you cannot add the same test twice to one report (should already be prevented in the UI — this fix was a backend safety net, not a UI change).

**Revenue page**
- [ ] Switch to Weekly and confirm the date range shown now reads Monday through today (or Monday through Sunday if you're checking a past week), not an arbitrary 7-day window.

**Performed By / finalized-report locking**
- [ ] Finalize a report, then confirm there is still no way to edit its "Performed By" value afterward (this was already true through the UI — the fix closes a database-level gap you wouldn't have hit through normal use).

## Summary

- **Problems found**: 5 (1 CRITICAL, 4 HIGH).
- **Fixed**: 5 of 5. The 4 database-level/logic bugs were each verified with a specific automated test proving the bug existed and then proving the fix. The print-pagination bug (HIGH-4) was verified by rendering a real multi-page PDF through the same Chromium engine Electron uses and inspecting each page's text before and after the fix — not an automated Vitest test, but a genuine empirical reproduction, not just code reading.
- **Needs your decision**: whether to add an Excel export for Test Report (not built, wasn't asked for originally). Nothing else requires a decision — everything else found was fixed outright and confirmed.
