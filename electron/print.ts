// The print/PDF pipeline. A hidden BrowserWindow renders the dedicated
// print-template route (see src/pages/PrintTemplateRoute.tsx) — decoupled
// from the interactive viewer — and printToPDF() turns that into the actual
// output. "Page X of Y" is added with pdf-lib rather than Chromium's
// built-in headerTemplate/footerTemplate mechanism, because that mechanism
// only injects content INTO the margin bands — and those bands must stay
// completely blank so a lab's pre-printed letterhead shows through. Header/
// footer *images* (the "digital PDF" mode) use headerTemplate/footerTemplate
// instead, since that's exactly the content that's supposed to live in the
// margin area.
import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mmToPt, type PrintLayout } from '../src/db/printLayout';

const isDev = process.env.NODE_ENV === 'development';
const PX_PER_MM = 96 / 25.4; // printToPDF's custom margins are in CSS pixels (96px = 1in)

function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM);
}

function templateUrl(hashPath: string): string {
  if (isDev) return `http://localhost:5173/#${hashPath}`;
  const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
  return `file://${indexPath}#${hashPath}`;
}

function waitForPrintReady(win: BrowserWindow, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      if (win.isDestroyed()) {
        reject(new Error('Print window closed before content was ready.'));
        return;
      }
      const ready = await win.webContents
        .executeJavaScript("document.body.getAttribute('data-print-ready')")
        .catch(() => null);
      if (ready === 'true') {
        resolve();
        return;
      }
      if (ready === 'error') {
        reject(new Error('The print template failed to load its data.'));
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timed out waiting for the print template to render.'));
        return;
      }
      setTimeout(check, 100);
    };
    win.webContents.once('did-finish-load', () => setTimeout(check, 50));
    win.webContents.once('did-fail-load', (_e, code, desc) => reject(new Error(`Failed to load print template: ${desc} (${code})`)));
  });
}

async function renderToPdfBuffer(hashPath: string, layout: PrintLayout, headerFooterHtml?: { header: string; footer: string }): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Same reasoning as the main window: this hidden window only ever needs
  // to load the one print-template URL it's given, so any other
  // navigation attempt or new-window request is denied outright.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== templateUrl(hashPath)) event.preventDefault();
  });
  try {
    await win.loadURL(templateUrl(hashPath));
    await waitForPrintReady(win);
    const buffer = await win.webContents.printToPDF({
      pageSize: layout.paperSize,
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: !!headerFooterHtml,
      headerTemplate: headerFooterHtml?.header || '<span></span>',
      footerTemplate: headerFooterHtml?.footer || '<span></span>',
      margins: {
        marginType: 'custom',
        top: mmToPx(layout.topMarginMm),
        bottom: mmToPx(layout.bottomMarginMm),
        left: mmToPx(layout.leftMarginMm),
        right: mmToPx(layout.rightMarginMm),
      },
    });
    return Buffer.from(buffer);
  } finally {
    win.destroy();
  }
}

// Draws "Page X of Y" at the bottom of the CONTENT area (just above the
// blank bottom margin), using the real page count from the rendered PDF —
// deterministic, unlike relying on CSS page counters (Chromium's print
// engine doesn't reliably support the "total pages" CSS counter).
async function addPageNumbers(pdfBytes: Buffer, layout: PrintLayout): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const total = pages.length;
  const fontSize = 8;
  const bottomMarginPt = mmToPt(layout.bottomMarginMm);

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const label = `Page ${index + 1} of ${total}`;
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    page.drawText(label, {
      x: (width - textWidth) / 2,
      y: bottomMarginPt - 10,
      size: fontSize,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  });

  return Buffer.from(await pdfDoc.save());
}

function imageHeaderFooterTemplates(headerImagePath: string, footerImagePath: string): { header: string; footer: string } {
  // Chromium loads these templates in a context that CAN reach file://
  // images directly. Sized with `max-width/max-height: 100%` so an
  // oversized source image never overflows the margin band.
  const img = (p: string) =>
    p ? `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><img src="file://${p}" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>` : '<span></span>';
  return { header: img(headerImagePath), footer: img(footerImagePath) };
}

export async function generateReportPdf(
  reportId: number,
  mode: 'paper' | 'pdf',
  layout: PrintLayout,
  images?: { headerImagePath: string; footerImagePath: string }
): Promise<Buffer> {
  const headerFooterHtml = mode === 'pdf' && images ? imageHeaderFooterTemplates(images.headerImagePath, images.footerImagePath) : undefined;
  const raw = await renderToPdfBuffer(`/print-template/${reportId}?mode=${mode}`, layout, headerFooterHtml);
  return addPageNumbers(raw, layout);
}

export async function generateAlignmentTestPage(layout: PrintLayout): Promise<Buffer> {
  // A single reference page — no "Page X of Y" needed for an alignment check.
  return renderToPdfBuffer('/print-template/alignment-test', layout);
}

// A plain internal business report — deliberately NOT run through the
// user's configured PrintLayout (that's specifically for matching a lab's
// pre-printed patient-report letterhead, which has nothing to do with an
// analytics export), just a sensible fixed A4 margin.
const REVENUE_PDF_LAYOUT: PrintLayout = {
  topMarginMm: 15,
  bottomMarginMm: 15,
  leftMarginMm: 15,
  rightMarginMm: 15,
  paperSize: 'A4',
  baseFontSizePt: 10,
};

export async function generateRevenuePdf(filters: { granularity: string; from?: string; to?: string }): Promise<Buffer> {
  const params = new URLSearchParams({ granularity: filters.granularity });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const raw = await renderToPdfBuffer(`/print-template/revenue?${params.toString()}`, REVENUE_PDF_LAYOUT);
  return addPageNumbers(raw, REVENUE_PDF_LAYOUT);
}

export async function generateTestReportPdf(filters: { granularity: string; from?: string; to?: string }): Promise<Buffer> {
  const params = new URLSearchParams({ granularity: filters.granularity });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const raw = await renderToPdfBuffer(`/print-template/test-report?${params.toString()}`, REVENUE_PDF_LAYOUT);
  return addPageNumbers(raw, REVENUE_PDF_LAYOUT);
}

export async function printPdfBuffer(pdfBuffer: Buffer): Promise<void> {
  const tempPath = path.join(os.tmpdir(), `labpro-print-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tempPath, pdfBuffer);
  // `plugins: true` is required for Chromium's built-in PDF viewer to
  // actually render the file instead of triggering a download.
  const win = new BrowserWindow({ show: false, webPreferences: { plugins: true, sandbox: true } });
  // This window exists to display exactly one local temp PDF and then get
  // destroyed — it never legitimately needs to navigate anywhere else.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  try {
    await win.loadURL(`file://${tempPath}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    // webContents.print() returns void, NOT a Promise — confirmed directly
    // against electron.d.ts. The previous `await win.webContents.print(...)`
    // therefore resolved immediately regardless of what actually happened,
    // so the window (and the print job with it) could get destroyed before
    // the OS print dialog was even shown, and neither a real failure (no
    // printer configured, driver error, etc.) nor a successful print was
    // ever actually detected — the app always reported "sent to printer"
    // no matter what. The real completion signal is the callback argument.
    await new Promise<void>((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        // A user clicking "Cancel" in the OS print dialog reports
        // success:false with a reason like "cancelled" — that's a normal,
        // expected action, not an error worth surfacing as a failure toast.
        if (success || /cancel/i.test(failureReason)) {
          resolve();
        } else {
          reject(new Error(failureReason || 'Printing failed — check that a printer is connected and set up.'));
        }
      });
    });
  } finally {
    win.destroy();
    fs.unlink(tempPath, () => {});
  }
}
