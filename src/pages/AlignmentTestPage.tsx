import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { mergePrintLayout, PAPER_SIZES_MM, type PrintLayout } from '@/db/printLayout';
import { waitForFontsAndPaint, markPrintReady, markPrintError } from '@/lib/printReady';

// Rendered only inside a hidden BrowserWindow for the Settings > Print
// Layout "Print Test Page" button. printToPDF already excludes the
// configured margins from this page's content box, so everything drawn
// here starts exactly where real report content would start — a border
// right at the edge of this page is therefore a direct, physical check of
// where the margin boundary falls on the user's pre-printed letterhead.
function Ticks({ axis, lengthMm }: { axis: 'horizontal' | 'vertical'; lengthMm: number }) {
  const count = Math.floor(lengthMm / 10);
  const ticks = Array.from({ length: count + 1 }, (_, i) => i * 10);
  return (
    <>
      {ticks.map((mm) => (
        <div
          key={mm}
          className="absolute bg-black"
          style={
            axis === 'horizontal'
              ? { left: `${mm}mm`, top: 0, width: '1px', height: mm % 50 === 0 ? '4mm' : '2mm' }
              : { top: `${mm}mm`, left: 0, height: '1px', width: mm % 50 === 0 ? '4mm' : '2mm' }
          }
        />
      ))}
      {ticks
        .filter((mm) => mm % 50 === 0)
        .map((mm) => (
          <div
            key={`label-${mm}`}
            className="absolute text-[7px] text-black"
            style={axis === 'horizontal' ? { left: `${mm + 1}mm`, top: '4.5mm' } : { top: `${mm - 1}mm`, left: '4.5mm' }}
          >
            {mm}
          </div>
        ))}
    </>
  );
}

export default function AlignmentTestPage() {
  const [layout, setLayout] = useState<PrintLayout | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.settings
      .getPrintLayout()
      .then((raw) => {
        if (cancelled) return;
        setLayout(mergePrintLayout(raw));
      })
      .catch(() => {
        if (!cancelled) markPrintError();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!layout) return;
    let cancelled = false;
    waitForFontsAndPaint().then(() => {
      if (!cancelled) markPrintReady();
    });
    return () => {
      cancelled = true;
    };
  }, [layout]);

  if (!layout) return null;

  // The content box is exactly the paper size minus the configured margins
  // (printToPDF removes the margins itself — see electron/print.ts) — sizing
  // this div to precisely that means the border below lands exactly on the
  // content/margin boundary, and the page renders as exactly one sheet
  // instead of spilling a mostly-blank second page.
  const { widthMm, heightMm } = PAPER_SIZES_MM[layout.paperSize];
  const contentWidthMm = widthMm - layout.leftMarginMm - layout.rightMarginMm;
  const contentHeightMm = heightMm - layout.topMarginMm - layout.bottomMarginMm;

  return (
    <div className="relative bg-white text-black" style={{ border: '1px solid black', width: `${contentWidthMm}mm`, height: `${contentHeightMm}mm` }}>
      <Ticks axis="horizontal" lengthMm={contentWidthMm} />
      <Ticks axis="vertical" lengthMm={contentHeightMm} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center text-sm leading-relaxed">
          <div className="text-base font-bold mb-2">Print Alignment Test Page</div>
          <div>Date: {new Date().toLocaleDateString()}</div>
          <div>Paper size: {layout.paperSize}</div>
          <div>
            Margins (mm) — Top: {layout.topMarginMm}, Bottom: {layout.bottomMarginMm}, Left: {layout.leftMarginMm}, Right:{' '}
            {layout.rightMarginMm}
          </div>
          <div>Base font size: {layout.baseFontSizePt}pt</div>
          <div className="mt-3 text-xs text-neutral-500 max-w-xs mx-auto">
            The border and ruler ticks above mark exactly where LabCore's printed content begins. Compare them against your
            letterhead's header/footer boundary and adjust the margins in Settings if they don't line up.
          </div>
        </div>
      </div>
    </div>
  );
}
