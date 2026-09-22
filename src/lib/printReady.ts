// Shared "is this page actually ready to be captured by printToPDF"
// signal, used by every print-template route (PrintTemplateRoute,
// TestReportPrintTemplate, RevenuePrintTemplate, AlignmentTestPage).
// Previously each template only waited a single requestAnimationFrame
// after its data loaded — never for document.fonts.ready. Chromium can
// capture a printToPDF snapshot while a webfont (this app ships
// @fontsource/inter) is still being fetched/rasterized, which can leave
// fallback-font text in the output or, in some Chromium builds, stall the
// print pipeline entirely if the capture races a still-pending font
// resource. Waiting on document.fonts.ready first, then one more paint
// frame for layout to settle, closes that gap everywhere at once.
export async function waitForFontsAndPaint(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    // Non-fatal — proceed with whatever fonts are already loaded rather
    // than block printing entirely over a font-loading API hiccup.
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function markPrintReady(): void {
  document.body.setAttribute('data-print-ready', 'true');
}

export function markPrintError(): void {
  document.body.setAttribute('data-print-ready', 'error');
}
