import { PAPER_SIZES_MM, type PrintLayout } from '@/db/printLayout';

// Print font matching the lab's existing paper reports (Calibri, installed
// on every Windows PC), with fallbacks.
export const PRINT_FONT = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";

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

// Lays `el` out at the exact printed content width and, if it's taller than
// one page's content area, zooms it down (never up) so it fits on a single
// page between the pre-printed letterhead's header and footer. Below
// minScale the text would get too small to read, so a very long report is
// left at that scale and flows onto more pages instead.
export function fitToOnePage(el: HTMLElement, layout: PrintLayout, minScale = 0.6): void {
  const paper = PAPER_SIZES_MM[layout.paperSize];
  const pxPerMm = 96 / 25.4;
  const width = (paper.widthMm - layout.leftMarginMm - layout.rightMarginMm) * pxPerMm;
  // A little headroom for driver rounding, so a report that fits exactly
  // doesn't spill a few pixels onto a blank second page.
  const available = (paper.heightMm - layout.topMarginMm - layout.bottomMarginMm) * pxPerMm * 0.97;

  el.style.zoom = '';
  el.style.width = `${width}px`;
  const height = el.getBoundingClientRect().height;
  if (height <= available) return;

  const scale = Math.max(minScale, available / height);
  el.style.zoom = String(scale);
  // zoom shrinks width too; widen before zooming so it still fills the page.
  el.style.width = `${width / scale}px`;
}

export function markPrintReady(): void {
  document.body.setAttribute('data-print-ready', 'true');
}

export function markPrintError(): void {
  document.body.setAttribute('data-print-ready', 'error');
}
