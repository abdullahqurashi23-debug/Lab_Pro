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
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mmToPt, type PrintLayout } from '../src/db/printLayout';

const isDev = process.env.NODE_ENV === 'development';
// Units differ between Electron's two print APIs: printToPDF() takes margins
// in INCHES, while webContents.print() passes its custom margins straight to
// Chromium's print settings, which read them as POINTS (72pt = 1in) —
// despite Electron's docs calling them pixels. Sending 96-per-inch pixels
// there made every margin a third too big (40mm printed as ~53mm), pushing
// a report that fits one A4 page onto a second page. Passing pixels to
// printToPDF (a 40mm top margin became "151 inches") left a negative
// printable area, so PDF generation failed/hung.
const MM_PER_INCH = 25.4;

// Neither printToPDF() nor webContents.print() come with a built-in
// timeout — if either one never calls back (a bad printer driver, a stuck
// print spooler, or any of the handful of open Electron/Chromium issues
// where printToPDF stalls on some machines), the whole operation hangs
// forever with the renderer's "Printing…"/"Saving…" button spinning and no
// error ever shown. This wraps any such promise so a hang becomes a clear,
// bounded failure instead of an invisible freeze.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function mmToIn(mm: number): number {
  return mm / MM_PER_INCH;
}

function templateUrl(hashPath: string): string {
  if (isDev) return `http://localhost:5173/#${hashPath}`;
  const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
  return `file://${indexPath}#${hashPath}`;
}

// Called only after loadURL() has resolved, i.e. after did-finish-load has
// already fired — so this polls straight away instead of waiting for that
// event. (It used to wait for did-finish-load, which never came a second
// time, so polling never started and every print hung on "Printing…".)
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
    check();
  });
}

// Loads a print-template route into a hidden window and waits until it has
// signalled data-print-ready. The caller owns the window and must destroy it.
async function openTemplateWindow(hashPath: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      // print.ts compiles to dist-electron/electron/print.js — one level
      // shallower than dist-electron/electron/main/index.js, which is why
      // this can't reuse main/index.ts's `path.join(__dirname, '..',
      // 'preload', ...)`. That extra '..' pointed one directory too high
      // (dist-electron/preload/index.js, which doesn't exist) — Electron
      // doesn't throw when a preload path is missing, it just silently
      // never injects window.api into this hidden window, so every
      // print-template page's data fetch failed with "window.api is
      // missing" and the whole print/PDF/archive pipeline quietly did
      // nothing. This affected every printed/PDF/archived output —
      // patient reports, Revenue, Test Report, and the alignment test page.
      preload: path.join(__dirname, 'preload', 'index.js'),
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
    // loadURL() itself has no built-in timeout either — a renderer that
    // never fires did-finish-load/did-fail-load (a crashed GPU process, a
    // wedged network service) would hang here before either of the two
    // timeouts below ever got a chance to run.
    await withTimeout(win.loadURL(templateUrl(hashPath)), 20000, 'Loading the print page timed out after 20 seconds.');
    await waitForPrintReady(win);
    return win;
  } catch (err) {
    win.destroy();
    throw err;
  }
}

async function renderToPdfBuffer(hashPath: string, layout: PrintLayout, headerFooterHtml?: { header: string; footer: string }): Promise<Buffer> {
  const win = await openTemplateWindow(hashPath);
  try {
    // printToPDF() has no built-in timeout of its own — on some machines
    // (bad GPU/print-driver state, a stuck spooler) it simply never
    // resolves. Without this, that hang is invisible: the renderer's
    // button just spins forever with no error. 30s is generous for even a
    // large multi-page report on a slow machine.
    const buffer = await withTimeout(
      win.webContents.printToPDF({
        pageSize: layout.paperSize,
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: !!headerFooterHtml,
        headerTemplate: headerFooterHtml?.header || '<span></span>',
        footerTemplate: headerFooterHtml?.footer || '<span></span>',
        margins: {
          top: mmToIn(layout.topMarginMm),
          bottom: mmToIn(layout.bottomMarginMm),
          left: mmToIn(layout.leftMarginMm),
          right: mmToIn(layout.rightMarginMm),
        },
      }),
      30000,
      'Generating the PDF timed out after 30 seconds.'
    );
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

// These business reports print onto the same paper as patient reports (a
// lab's pre-printed letterhead), so they use that same configured
// PrintLayout for margins — the blank margin bands are what let the
// physical header/footer show through un-overlapped.
export async function generateRevenuePdf(
  filters: { granularity: string; from?: string; to?: string },
  layout: PrintLayout
): Promise<Buffer> {
  const params = new URLSearchParams({ granularity: filters.granularity });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const raw = await renderToPdfBuffer(`/print-template/revenue?${params.toString()}`, layout);
  return addPageNumbers(raw, layout);
}

export async function generateTestReportPdf(
  filters: { granularity: string; from?: string; to?: string },
  layout: PrintLayout
): Promise<Buffer> {
  const params = new URLSearchParams({ granularity: filters.granularity });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const compact = saleReportLayout(layout);
  const raw = await renderToPdfBuffer(`/print-template/test-report?${params.toString()}`, compact);
  return addPageNumbers(raw, compact);
}

// The Sale Report is printed on plain paper, not the lab's letterhead, so it
// uses small fixed margins and starts at the top of the page instead of
// below the letterhead's header band. Paper size still follows Settings.
function saleReportLayout(layout: PrintLayout): PrintLayout {
  return { ...layout, topMarginMm: 10, bottomMarginMm: 12, leftMarginMm: 10, rightMarginMm: 10 };
}


// Direct printing sends the rendered print-template page itself to the
// chosen printer (Settings → Printer), or the Windows default printer when
// none is chosen, with the same paper size and margins as the PDF. Nothing
// here is specific to one printer brand: resolution and quality are left
// to each printer's own driver.
//
// It deliberately does NOT go through a PDF: the old approach loaded the
// generated PDF into a hidden window and called webContents.print() on it,
// but Chromium shows PDFs through its viewer plugin in a separate frame,
// and printing that from a hidden window is unreliable in Electron (blank
// pages, a print dialog that never appears or never calls back).
//
// Trade-off: the pdf-lib "Page X of Y" stamp only exists in generated PDFs,
// so it isn't on direct paper prints.
async function printTemplate(hashPath: string, layout: PrintLayout, printer: string): Promise<void> {
  const win = await openTemplateWindow(hashPath);
  try {
    // webContents.print() returns void, not a Promise; the callback is the
    // only completion signal. It is not guaranteed to fire with every
    // driver, hence the timeout.
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        win.webContents.print(
          {
            silent: true,
            // Empty = the Windows default printer.
            ...(printer ? { deviceName: printer } : {}),
            printBackground: true,
            // Reports are black-and-white documents; this also keeps colour
            // printers from mixing CMY inks into "black" text.
            color: false,
            pageSize: layout.paperSize,
            margins: {
              marginType: 'custom',
              top: Math.round(mmToPt(layout.topMarginMm)),
              bottom: Math.round(mmToPt(layout.bottomMarginMm)),
              left: Math.round(mmToPt(layout.leftMarginMm)),
              right: Math.round(mmToPt(layout.rightMarginMm)),
            },
          },
          (success, failureReason) => {
            if (success) resolve();
            else
              reject(
                new Error(
                  failureReason ||
                    (printer
                      ? `Printing to "${printer}" failed — check it is switched on and connected, or pick another printer in Settings.`
                      : 'Printing failed — check that the default printer is connected and online.')
                )
              );
          }
        );
      }),
      60000,
      'Printing timed out after 60 seconds — check that the printer is switched on and try again.'
    );
  } finally {
    win.destroy();
  }
}

// Installed printers for the Settings → Printer picker. Bounded by a
// timeout: a stuck driver or offline network printer must never freeze the
// Settings page.
export async function listPrinters(win: BrowserWindow): Promise<{ name: string; displayName: string; isDefault: boolean }[]> {
  const printers = await withTimeout(win.webContents.getPrintersAsync(), 10000, 'Loading the printer list timed out.');
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
}

export function printReport(reportId: number, mode: 'paper' | 'pdf', layout: PrintLayout, printer: string): Promise<void> {
  return printTemplate(`/print-template/${reportId}?mode=${mode}`, layout, printer);
}

export function printAlignmentTestPage(layout: PrintLayout, printer: string): Promise<void> {
  return printTemplate('/print-template/alignment-test', layout, printer);
}

export function printRevenue(
  filters: { granularity: string; from?: string; to?: string },
  layout: PrintLayout,
  printer: string
): Promise<void> {
  const params = new URLSearchParams({ granularity: filters.granularity });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return printTemplate(`/print-template/revenue?${params.toString()}`, layout, printer);
}

export function printTestReport(
  filters: { granularity: string; from?: string; to?: string },
  layout: PrintLayout,
  printer: string
): Promise<void> {
  const params = new URLSearchParams({ granularity: filters.granularity });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return printTemplate(`/print-template/test-report?${params.toString()}`, saleReportLayout(layout), printer);
}