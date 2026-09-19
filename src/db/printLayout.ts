// Print layout: margins, paper size, and base font size for the physical
// print output. Zero dependencies on purpose (same reasoning as
// resultLogic.ts) — the Settings page's live preview, the print template,
// and the main process's PDF generation all need the exact same numbers,
// so there's one definition instead of three that could drift apart.

export type PaperSize = 'A4' | 'Letter';

export interface PrintLayout {
  topMarginMm: number;
  bottomMarginMm: number;
  leftMarginMm: number;
  rightMarginMm: number;
  paperSize: PaperSize;
  baseFontSizePt: number;
}

// A tall top margin by default since most pre-printed clinic letterhead
// reserves significant space for a header graphic/logo block.
export const DEFAULT_PRINT_LAYOUT: PrintLayout = {
  topMarginMm: 40,
  bottomMarginMm: 30,
  leftMarginMm: 15,
  rightMarginMm: 15,
  paperSize: 'A4',
  baseFontSizePt: 10,
};

export const PAPER_SIZES_MM: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
};

export function mergePrintLayout(partial: Partial<PrintLayout> | null | undefined): PrintLayout {
  return { ...DEFAULT_PRINT_LAYOUT, ...(partial || {}) };
}

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}
