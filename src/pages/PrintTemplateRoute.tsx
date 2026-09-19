import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import PrintTemplateContent from '@/components/print/PrintTemplateContent';
import { mergePrintLayout, type PrintLayout } from '@/db/printLayout';
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
          document.body.setAttribute('data-print-ready', 'error');
          return;
        }
        setData({ report, clinic, layout: mergePrintLayout(rawLayout) });
      } catch {
        if (!cancelled) document.body.setAttribute('data-print-ready', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Every <img> on the page (signature, header/footer letterhead) must have
  // actually finished loading before the main process captures this page
  // via printToPDF — otherwise a slow disk read leaves a blank gap in the
  // archived PDF with no way to retry. The barcode itself is an inline SVG
  // painted synchronously by JsBarcode's own effect (a sibling, and a child
  // of the same component tree), which React guarantees has already run by
  // the time this effect's body executes.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const waitForImages = async () => {
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
      if (cancelled) return;
      // One more paint tick after every image is decoded, so layout has
      // settled around their final dimensions before printToPDF runs.
      requestAnimationFrame(() => {
        if (!cancelled) document.body.setAttribute('data-print-ready', 'true');
      });
    };
    waitForImages();
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!data) return null;

  return (
    <div className="bg-white text-black min-h-screen">
      <PrintTemplateContent
        report={data.report}
        clinic={data.clinic}
        layout={data.layout}
        mode={mode}
        showInlineHeaderFooterImages={mode === 'pdf'}
      />
    </div>
  );
}
