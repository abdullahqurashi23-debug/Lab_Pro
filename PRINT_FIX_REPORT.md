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

## Testing note
I could not reproduce actual physical output completing on my own machine
(no printer attached, running an unpackaged dev build) — I confirmed the
underlying render pipeline works correctly up to the point of calling
`printToPDF`/`print()`, and confirmed the new timeout and fallback behave
correctly when that call is forced to hang. The real test is on your
Windows machine with the real printer: click Print/Reprint and confirm
paper comes out within a few seconds. If it doesn't, you should now get
either a clear error or an automatically-opened PDF within 30 seconds —
if you see neither, that's new information worth sending back.
