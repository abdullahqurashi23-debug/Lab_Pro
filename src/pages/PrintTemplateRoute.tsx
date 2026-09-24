import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import PrintTemplateContent from '@/components/print/PrintTemplateContent';
import { mergePrintLayout, type PrintLayout } from '@/db/printLayout';
import { waitForFontsAndPaint, fitToOnePage, markPrintReady, markPrintError } from '@/lib/printReady';
import type { ClinicSettings, ReportWithDetails } from '@/lib/types';

interface LoadedData {
  report: ReportWithDetails;
  clinic: ClinicSettings;
  layout: PrintLayout;
}

// Rendered only inside a hidden BrowserWindow (see electron/print.ts) —
// never shown to a user directly. It fetches everything the print needs by
// itself (no props from a parent route) and marks document.body with
// data-print-ready once done, which the main process polls for before
// calling printToPDF. This route intentionally sits outside the app's
// normal AppLayout/auth-gated tree (see App.tsx) — by the time the main
// process opens this window it has already verified the caller is
// authorized to print, and the session itself lives in the main process,
// shared across every renderer window.
export default function PrintTemplateRoute() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'pdf' ? 'pdf' : 'paper';
  const [data, setData] = useState<LoadedData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [report, clinic, rawLayout] = await Promise.all([
          api.reports.getById(Number(id)),
          api.settings.get(),
          api.settings.getPrintLayout(),
        ]);
        if (cancelled) return;
        if (!report) {
          markPrintError();
          return;
        }
        setData({ report, clinic, layout: mergePrintLayout(rawLayout) });
      } catch {
        if (!cancelled) markPrintError();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Every <img> on the page (signature, header/footer letterhead) must have
  // actually finished loading, AND every webfont must be ready, before the
  // main process captures this page via printToPDF — otherwise a slow disk
  // read or a still-fetching font leaves a blank gap or fallback-font text
  // in the archived PDF with no way to retry. The barcode itself is an
  // inline SVG painted synchronously by JsBarcode's own effect (a sibling,
  // and a child of the same component tree), which React guarantees has
  // already run by the time this effect's body executes.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const waitUntilReady = async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete ||
            new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            })
        )
      );
      await waitForFontsAndPaint();
      if (cancelled || !contentRef.current) return;
      fitToOnePage(contentRef.current, data.layout);
      await waitForFontsAndPaint();
      if (!cancelled) markPrintReady();
    };
    waitUntilReady();
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!data) return null;

  return (
    <div className="bg-white text-black min-h-screen">
      <div ref={contentRef}>
        <PrintTemplateContent
          report={data.report}
          clinic={data.clinic}
          layout={data.layout}
          mode={mode}
          showInlineHeaderFooterImages={mode === 'pdf'}
        />
      </div>
    </div>
  );
}
