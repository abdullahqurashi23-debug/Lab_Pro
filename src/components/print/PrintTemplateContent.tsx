import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { toFileUrl } from '@/lib/fileUrl';
import type { ClinicSettings, ReportWithDetails } from '@/lib/types';
import type { PrintLayout } from '@/db/printLayout';

// Everything is solid black on white, with no grey text, colour or tinted
// fills: mono laser printers render grey and colour as a dotted halftone,
// which made parts of the printed report look fuzzy next to crisp black text.

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width: 1.3,
        height: 30,
        // The report number is already printed as text right next to this
        // (the "Report No" field) — repeating it again under the bars just
        // added height for nothing, so it's off here rather than shrunk.
        displayValue: false,
        // A real scanner needs blank "quiet zone" space on either side of
        // the bars to lock onto the start/stop patterns — margin: 0 (an
        // earlier setting) removed that entirely and broke scanning. 8px
        // keeps a real quiet zone while staying compact.
        margin: 8,
      });
    } catch {
      // An unbarcodeable value (shouldn't happen — report numbers are
      // always plain ASCII) just leaves the barcode blank rather than
      // crashing the whole print render.
    }
  }, [value]);
  return <svg ref={ref} />;
}

interface PrintTemplateContentProps {
  report: ReportWithDetails;
  clinic: ClinicSettings;
  layout: PrintLayout;
  mode: 'paper' | 'pdf';
  // True only for the interactive on-screen preview (PrintReport.tsx) — the
  // hidden print window instead gets header/footer images injected by
  // Chromium's printToPDF headerTemplate/footerTemplate (see electron/print.ts),
  // so rendering them here too would double them up in the actual PDF.
  showInlineHeaderFooterImages?: boolean;
}

// The patient block is the <thead> of a page-spanning table — Chromium
// natively repeats a <thead> on every page a table spans (the same
// mechanism that repeats column headers), and reserves the right amount of
// space for it automatically. That's far more robust than trying to
// reproduce a "repeating page header" with position:fixed and a manually
// guessed height offset for the content that follows.
export default function PrintTemplateContent({ report, clinic, layout, mode, showInlineHeaderFooterImages }: PrintTemplateContentProps) {
  const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');
  // A draft being previewed hasn't been finalized yet, so finalized_at is
  // still null — falling back to created_at means the date always shows
  // something real (today's date, in practice) instead of a blank dash.
  const reportDate = fmtDate(report.finalized_at || report.created_at);

  return (
    <div style={{ fontSize: `${layout.baseFontSizePt}pt` }} className="font-sans text-black">
      {mode === 'pdf' && showInlineHeaderFooterImages && clinic.header_image_path && (
        <img src={toFileUrl(clinic.header_image_path)} alt="" className="w-full object-contain mb-4" />
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td className="pb-4">
              {/* No title: the pre-printed letterhead already names the
                  lab. The patient box is the only bordered element. */}
              <div className="rounded-md overflow-hidden" style={{ border: '1px solid #000' }}>
                <div className="px-3 py-1" style={{ borderBottom: '1px solid #000' }}>
                  <div className="font-bold text-[0.85em]">Patient &amp; Report Information</div>
                </div>
                <div className="grid grid-cols-4 text-[0.85em]">
                  {[
                    ['Patient', report.patient_name],
                    ['Report No', report.report_no],
                    ['Report Date', reportDate],
                    ['Age', `${report.age ?? '—'} ${report.age_unit}`],
                    ['Gender', report.gender || '—'],
                    ['Patient ID', report.patient_code],
                    ['Referred By', report.doctor_name || 'Self'],
                    // The explicitly-entered technician name wins — it can
                    // differ from whoever's software account clicked
                    // Finalize (finalized_by_name), which older reports
                    // (from before this field existed) fall back to.
                    ['Performed By', report.performed_by || report.finalized_by_name || '—'],
                  ].map(([label, value], i) => (
                    <div
                      key={label}
                      className="px-3 py-1"
                      style={{
                        borderLeft: i % 4 === 0 ? undefined : '1px solid #000',
                        borderTop: i >= 4 ? '1px solid #000' : undefined,
                      }}
                    >
                      <div className="text-[0.85em] leading-tight">{label}</div>
                      {/* Wraps instead of truncating — a patient or doctor's
                          name silently cut off with "…" on an official
                          report is a real legibility problem, not just a
                          layout nicety. */}
                      <div className="font-semibold leading-tight break-words">{value}</div>
                    </div>
                  ))}
                </div>
                <div
                  className="flex items-center justify-end px-3 py-1"
                  style={{ borderTop: '1px solid #000' }}
                >
                  <Barcode value={report.report_no} />
                </div>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {(report.tests || []).map((rt) => (
                <div key={rt.id} className="test-block mb-4">
                  <div className="px-3 py-1 font-bold text-[1em]">{rt.test_name_snapshot}</div>
                  {/* Fixed column widths (via colgroup + table-fixed) are
                      the only way to guarantee Result/Unit/Reference Range
                      line up at the same x-position across every test's
                      table down the page — a plain `w-full` table with no
                      explicit widths auto-sizes each one independently
                      based on ITS OWN content, so column boundaries drift
                      test-to-test, especially when one test has only a
                      single short row (e.g. a qualitative result). */}
                  <table className="w-full text-[0.9em] border-collapse table-fixed">
                    <colgroup>
                      <col style={{ width: '26%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '39%' }} />
                    </colgroup>
                    <thead>
                      <tr className="text-left">
                        <th className="py-1 pl-3 pr-6 font-semibold text-[0.9em]">Test</th>
                        <th className="py-1 px-2 font-semibold text-[0.9em]">Result</th>
                        <th className="py-1 px-2 font-semibold text-[0.9em]">Unit</th>
                        <th className="py-1 pl-2 pr-3 font-semibold text-[0.9em]">Reference Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rt.results || []).map((r) => (
                        <tr key={r.id} className="align-top">
                          <td className="py-1 pl-3 pr-6 font-normal">{r.parameter_name_snapshot}</td>
                          <td className="py-1 px-2 font-semibold">{r.value || '—'}</td>
                          <td className="py-1 px-2">{r.unit_snapshot || '—'}</td>
                          <td className="py-1 pl-2 pr-3">{r.ref_range_snapshot || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {report.notes && (
                <div className="mt-4 mb-6 text-[0.9em] px-3">
                  <div className="font-bold mb-1">Report Notes</div>
                  <div className="whitespace-pre-wrap">{report.notes}</div>
                </div>
              )}

              <div className="flex items-end justify-end mt-10">
                <div className="text-center text-[0.9em] shrink-0">
                  {clinic.signature_image_path && (
                    <img src={toFileUrl(clinic.signature_image_path)} alt="" className="h-12 mx-auto object-contain mb-1" />
                  )}
                  <div className="border-t border-black pt-1 px-10 font-semibold">
                    {clinic.pathologist_name || 'Pathologist'}
                  </div>
                  <div>Signature</div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {mode === 'pdf' && showInlineHeaderFooterImages && clinic.footer_image_path && (
        <img src={toFileUrl(clinic.footer_image_path)} alt="" className="w-full object-contain mt-4" />
      )}
    </div>
  );
}
