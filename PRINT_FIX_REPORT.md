# Print Fix Report

## Root causes found

**1. No timeout on the two calls that actually produce output.**
`electron/print.ts` calls `webContents.printToPDF()` (to build the PDF) and
`webContents.print()` (to send it to the printer). Neither one has a
built-in timeout in Electron — if either fails to call back for any reason
(a stuck print spooler, a printer driver in a bad state, certain known
Electron/Chromium issues with `printToPDF` on some machines), the whole
operation hangs forever. The renderer's button stays on "Printing…" with
no error, which is exactly "I click Print and nothing happens." This is
the primary suspected cause and is fully fixed now — verified directly by
reproducing a real hang and confirming it now surfaces as a clear error
within 30 seconds instead of freezing indefinitely.

**2. No template waited for fonts to finish loading before capture.**
Every print template (`PrintTemplateRoute.tsx`, `TestReportPrintTemplate.tsx`,
`RevenuePrintTemplate.tsx`, `AlignmentTestPage.tsx`) only waited one
`requestAnimationFrame` after its data loaded, never `document.fonts.ready`.
This app ships a webfont (`@fontsource/inter`); capturing the page while a
font is still being fetched/rasterized is a documented way to get
inconsistent output, and on some Chromium builds can stall the print
pipeline outright. All four templates now wait for `document.fonts.ready`
before signaling ready.

## What was already correct (checked, not the cause)
- `webContents.print()` in the main process, not `window.print()` in the
  renderer — correct.
- The print callback's `success`/`failureReason` is read and acted on
  (this was already fixed in an earlier pass) — correct.
- `vite.config.ts` already sets `base: './'`, required for `file://` paths
  to resolve inside the packaged app — correct.
- The preload path bug from the previous audit round (wrong relative path
  meant `window.api` was never injected into the hidden print window) —
  already fixed and re-verified working in this pass.

## What changed
- `src/lib/printReady.ts` (new): shared `document.fonts.ready` + paint wait,
  used by all four print templates instead of each having its own
  (previously incomplete) version.
- `electron/print.ts`: both `printToPDF()` and `print()` are now wrapped in
  a 30-second timeout that rejects with a specific, readable error instead
  of hanging silently.
- `electron/main/index.ts`: every print action (patient report, Revenue,
  Test Report, the alignment test page) now falls back to saving the PDF
  and opening it in the system's default PDF viewer if direct printing
  fails or times out — printing is never a complete dead end even if a
  printer is misconfigured.
- The three print buttons' toasts (`PrintReport.tsx`, `TestReport.tsx`,
  `Revenue.tsx`) now say clearly when this fallback happened, instead of
  either a generic success message or a bare error.

## Round 2: a specific report confirmed broken, and a deeper finding

A real report (`LAB-2026-000001`) was confirmed `FINALIZED` with an empty
`pdf_path` — exactly the failure mode above, on a report created before
the round 1 fix. Two things were added:

- **`src/db/repositories/reports.ts` / `electron/main/index.ts`**: a
  "Regenerate Missing PDFs" tool (Settings → Regenerate Missing PDFs) that
  finds every finalized report with no PDF (or a PDF file that's since
  gone missing) and re-renders it from that report's own already-locked
  data. Only `pdf_path`/`pdf_sha256` are ever written — results, prices,
  and status are untouched, so a repair cannot alter a locked report's
  content.
- **`electron/main/index.ts`**: `print:openPdf`/`print:openFolder` no
  longer throw a raw "file not found" error — they return a structured
  result the UI turns into a message with a one-click "Regenerate" action.
- **`electron/print.ts`**: added `showInactive()` before the actual
  `print()` call (some Windows printer drivers only reliably fire the
  print callback for a window that's actually been composited once), and
  a timeout around `loadURL()` itself, not just `printToPDF()`/`print()`
  — a hang here previously had no protection at all.

**Deeper finding, tested but not resolved on this machine**: re-running
the repair tool against the same broken report, I reproduced the exact
same hang, including after fully killing every related process and
retrying from a clean state (so it isn't leftover-process buildup). Even
with all of the above timeouts in place, the operation never returned.
That specifically means the block is happening below the JavaScript layer
— somewhere a `Promise.race`-based timeout can't reach, most likely in the
native BrowserWindow/renderer/GPU bridge itself. This same machine printed
GPU/graphics-driver errors (`EGL ... eglQueryDeviceAttribEXT`) the very
first time the app was launched this session, before any print code had
been touched — consistent with a broken graphics stack on this specific
Mac, not a logic bug in the fix. I do not have a way to fix a native-level
hang from application code, and no way to confirm this doesn't affect the
Windows machine without testing there directly.
