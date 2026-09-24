import { useEffect, useMemo, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import qrcode from 'qrcode-generator';
import { toFileUrl } from '@/lib/fileUrl';
import { localDateTime } from '@/lib/localTime';
import { PRINT_FONT } from '@/lib/printReady';
import type { ClinicSettings, ReportWithDetails } from '@/lib/types';
import type { PrintLayout } from '@/db/printLayout';

// Laid out to match the lab's existing pre-printed-letterhead reports:
// a three-column patient / sample / dates block, then each test as a
// centred heading over an Investigation / Result / Reference Value / Unit
// table. Everything is solid black on white, with no grey text, colour or
// tinted fills: mono laser printers render grey and colour as a dotted
// halftone, which made parts of the printed report look fuzzy.

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width: 1.3,
        height: 30,
        // The report number is already printed as text elsewhere on the
        // report — repeating it under the bars just added height.
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

// Patient + report details as plain text, readable by any phone camera.
// UTF-8 so non-Latin (e.g. Pashto/Dari) names encode correctly.
function QrCode({ text }: { text: string }) {
  const svg = useMemo(() => {
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      const qr = qrcode(0, 'M');
      qr.addData(text, 'Byte');
      qr.make();
      return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    } catch {
      return ''; // too much text for a QR code — leave it out, don't break the print
    }
  }, [text]);
  return <div className="w-[15mm] h-[15mm] shrink-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
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

// "Mr." / "Ms." for adults, as on the lab's existing reports; no title for
// children or when gender isn't Male/Female.
function titledName(report: ReportWithDetails): string {
  // The title picked at registration wins; older patients saved before
  // titles existed get an automatic Mr./Ms. when adult.
  const adult = report.age_unit === 'Years' && (report.age ?? 0) >= 18;
  const auto = !adult ? '' : report.gender === 'Male' ? 'Mr.' : report.gender === 'Female' ? 'Ms.' : '';
  const title = report.patient_title || auto;
  return `${title ? `${title} ` : ''}${report.patient_name.toUpperCase()}`;
}

const RULE = '1px solid #000';

// The patient block is the <thead> of a page-spanning table — Chromium
// natively repeats a <thead> on every page a table spans, and reserves the
// right amount of space for it automatically.
export default function PrintTemplateContent({ report, clinic, layout, mode, showInlineHeaderFooterImages }: PrintTemplateContentProps) {
  // A draft being previewed hasn't been finalized yet, so finalized_at is
  // still null — fall back to created_at so a date always shows.
  const reported = localDateTime(report.finalized_at || report.created_at);
  const registered = localDateTime(report.created_at);
  // The technician entered on the report; older reports fall back to
  // whoever finalized it in the software.
  const performedBy = report.performed_by || report.finalized_by_name || '';
  const qrText = [
    clinic.clinic_name,
    `Report No: ${report.report_no}`,
    `Patient: ${titledName(report)}`,
    `Age/Gender: ${report.age ?? '-'} ${report.age_unit} / ${report.gender || '-'}`,
    `Patient ID: ${report.patient_code}`,
    `Ref. By: ${report.doctor_name || 'Self'}`,
    `Performed By: ${performedBy || '-'}`,
    `Tests: ${(report.tests || []).map((t) => t.test_name_snapshot).join(', ')}`,
    `Reported on: ${reported}`,
  ].join('\n');

  return (
    <div style={{ fontSize: `${layout.baseFontSizePt + 1}pt`, fontFamily: PRINT_FONT }} className="text-black">
      {mode === 'pdf' && showInlineHeaderFooterImages && clinic.header_image_path && (
        <img src={toFileUrl(clinic.header_image_path)} alt="" className="w-full object-contain mb-4" />
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td className="pb-2">
              <div className="grid grid-cols-[1fr_1fr_1.1fr] text-[0.95em] leading-snug pb-2" style={{ borderBottom: RULE }}>
                <div className="pr-3">
                  <div className="font-bold text-[1.1em] mb-1 break-words">{titledName(report)}</div>
                  <div className="flex justify-between gap-2">
                    <div>
                      <InfoRow label="Age:" value={`${report.age ?? '—'} ${report.age_unit}`} />
                      <InfoRow label="Gender:" value={report.gender || '—'} />
                      <InfoRow label="Patient ID:" value={report.patient_code} />
                    </div>
                    <QrCode text={qrText} />
                  </div>
                </div>
                <div className="px-3" style={{ borderLeft: RULE }}>
                  <div className="font-bold mb-1">Sample Collected At:</div>
                  <div>{clinic.clinic_name}</div>
                  {clinic.address && <div className="whitespace-pre-line">{clinic.address}</div>}
                  <div className="mt-2">
                    Ref. By: <span className="font-bold">{report.doctor_name || 'Self'}</span>
                  </div>
                  {performedBy && (
                    <div>
                      Performed By: <span className="font-bold">{performedBy}</span>
                    </div>
                  )}
                </div>
                <div className="pl-3" style={{ borderLeft: RULE }}>
                  <div className="flex justify-end -mt-1">
                    <Barcode value={report.report_no} />
                  </div>
                  <DateRow label="Registered on:" value={registered} />
                  <DateRow label="Collected on:" value={registered} />
                  <DateRow label="Reported on:" value={reported} />
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
                  <div className="text-center font-bold text-[1.05em] tracking-wide mt-1 mb-1">
                    {rt.test_name_snapshot.toUpperCase()}
                  </div>
                  <table className="w-full text-[0.95em] border-collapse table-fixed">
                    <colgroup>
                      <col style={{ width: '40%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <thead>
                      <tr className="text-left">
                        <th className="py-1 pr-4 font-bold text-[1.05em]">Investigation</th>
                        <th className="py-1 pr-2 font-bold text-[1.05em]">Result</th>
                        <th className="py-1 pr-2 font-bold text-[1.05em]">Reference Value</th>
                        <th className="py-1 font-bold text-[1.05em]">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rt.results || []).map((r) => (
                        <tr key={r.id} className="align-top">
                          <td className="py-[3px] pl-2 pr-4 font-normal">{r.parameter_name_snapshot}</td>
                          <td className="py-[3px] pr-2">{r.value || '—'}</td>
                          <td className="py-[3px] pr-2">{r.ref_range_snapshot}</td>
                          <td className="py-[3px]">{r.unit_snapshot}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div style={{ borderTop: RULE }} />

              {report.notes && (
                <div className="mt-3 text-[0.95em]">
                  <span className="font-bold">Notes: </span>
                  <span className="whitespace-pre-wrap">{report.notes}</span>
                </div>
              )}

              {/* Only when configured. On paper it's pinned to the bottom
                  of the page — the same spot every time, just above the
                  pre-printed footer (the bottom margin) — however short or
                  long the results are. The spacer keeps that strip clear
                  so results never run underneath it. */}
              {(clinic.signature_image_path || clinic.pathologist_name) && (
                <div className="hidden print:block" style={{ height: clinic.signature_image_path ? '24mm' : '12mm' }} />
              )}
              {(clinic.signature_image_path || clinic.pathologist_name) && (
                <div className="flex justify-end mt-8 print:mt-0 print:fixed print:right-0 print:bottom-[3mm]">
                  <div className="text-center text-[0.95em]">
                    {clinic.signature_image_path && (
                      <img src={toFileUrl(clinic.signature_image_path)} alt="" className="h-12 mx-auto object-contain mb-1" />
                    )}
                    {clinic.pathologist_name && <div className="font-semibold">{clinic.pathologist_name}</div>}
                  </div>
                </div>
              )}
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.3em_auto] whitespace-nowrap">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 whitespace-nowrap">
      <span className="font-bold">{label}</span>
      <span>{value}</span>
    </div>
  );
}
