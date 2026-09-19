import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { toFileUrl } from '@/lib/fileUrl';
import type { ClinicSettings, ReportWithDetails } from '@/lib/types';
import type { PrintLayout } from '@/db/printLayout';

// A single fixed brand accent (never a theme CSS variable — this has to
// render identically no matter what theme happens to be active in the
// window that triggered the print, same reasoning as the black/gray text
// elsewhere in this file). Used sparingly, as a short underline rather
// than full-width rules, so the report reads as designed rather than just
// boxed off in black lines everywhere.
const ACCENT = '#0a7168';

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

  return (
    <div style={{ fontSize: `${layout.baseFontSizePt}pt` }} className="font-sans text-black">
      {mode === 'pdf' && showInlineHeaderFooterImages && clinic.header_image_path && (
        <img src={toFileUrl(clinic.header_image_path)} alt="" className="w-full object-contain mb-4" />
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td className="pb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[0.72em] font-bold uppercase tracking-[0.14em]"
                  style={{ color: ACCENT }}
                >
                  Laboratory Report
                </span>
                <div className="flex-1" style={{ height: 1, background: '#00000022' }} />
              </div>
              <div className="rounded-md overflow-hidden" style={{ border: '1px solid #00000030' }}>
                <div className="grid grid-cols-3 text-[0.9em]">
                  {[
                    ['Patient', report.patient_name],
                    ['Report No', report.report_no],
                    ['Report Date', fmtDate(report.finalized_at)],
                    ['Age / Gender', `${report.age ?? '—'} ${report.age_unit} / ${report.gender || '—'}`],
                    ['Patient ID', report.patient_code],
                    ['Referred By', report.doctor_name || 'Self'],
                  ].map(([label, value], i) => (
                    <div
                      key={label}
                      className="px-3 py-1.5"
                      style={{
                        borderLeft: i % 3 === 0 ? undefined : '1px solid #00000018',
                        borderTop: i >= 3 ? '1px solid #00000018' : undefined,
                      }}
                    >
                      <div className="text-[0.72em] uppercase tracking-wide text-neutral-500 leading-tight">{label}</div>
                      {/* Wraps instead of truncating — a patient or doctor's
                          name silently cut off with "…" on an official
                          report is a real legibility problem, not just a
                          layout nicety. */}
                      <div className="font-semibold leading-tight break-words">{value}</div>
                    </div>
                  ))}
                </div>
                <div
                  className="flex items-center justify-end gap-2 px-3 py-1"
                  style={{ borderTop: '1px solid #00000018' }}
                >
                  <span className="text-[0.6em] text-neutral-500">Scan to verify</span>
                  <Barcode value={report.report_no} />
                </div>
              </div>
              <div style={{ height: 2, background: ACCENT, marginTop: 8 }} />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {(report.tests || []).map((rt) => (
                <div key={rt.id} className="test-block mb-4">
                  <div className="font-bold text-[1.05em] mb-1">{rt.test_name_snapshot}</div>
                  <div style={{ width: 32, height: 2, background: ACCENT, marginBottom: 6 }} />
                  {/* Fixed column widths (via colgroup + table-fixed) are
                      the only way to guarantee Result/Unit/Reference Range
                      line up at the same x-position across every test's
                      table down the page — a plain `w-full` table with no
                      explicit widths auto-sizes each one independently
                      based on ITS OWN content, so column boundaries drift
                      test-to-test, especially when one test has only a
                      single short row (e.g. a qualitative result). */}
                  <table className="w-full text-[0.95em] border-collapse table-fixed">
                    <colgroup>
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '37%' }} />
                    </colgroup>
                    <thead>
                      <tr className="text-left border-b border-black/40">
                        <th className="py-1 pr-2 font-medium">Parameter</th>
                        <th className="py-1 pr-2 font-medium">Result</th>
                        <th className="py-1 pr-2 font-medium">Unit</th>
                        <th className="py-1 font-medium">Reference Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rt.results || []).map((r) => (
                        <tr key={r.id} className="align-top">
                          <td className="py-1 pr-2">{r.parameter_name_snapshot}</td>
                          <td className="py-1 pr-2">{r.value || '—'}</td>
                          <td className="py-1 pr-2 text-neutral-500">{r.unit_snapshot || '—'}</td>
                          <td className="py-1 text-neutral-500">{r.ref_range_snapshot || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {report.notes && (
                <div className="mt-4 mb-6 text-[0.95em]">
                  <div className="font-semibold mb-1">Report Notes</div>
                  <div className="whitespace-pre-wrap text-neutral-500">{report.notes}</div>
                </div>
              )}

              <div className="flex justify-end mt-10">
                <div className="text-center text-[0.9em]">
                  {clinic.signature_image_path && (
                    <img src={toFileUrl(clinic.signature_image_path)} alt="" className="h-12 mx-auto object-contain mb-1" />
                  )}
                  <div className="border-t border-black pt-1 px-10 font-semibold">
                    {clinic.pathologist_name || 'Pathologist'}
                  </div>
                  <div className="text-neutral-500">Signature</div>
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
