import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { waitForFontsAndPaint, markPrintReady, markPrintError } from '@/lib/printReady';
import { localDate } from '@/lib/localTime';
import type { ClinicSettings, RevenueGranularity, TestReportResult } from '@/lib/types';

// Rendered only inside a hidden BrowserWindow for the Test Report page's
// "Print" and "Save as PDF" actions (see electron/print.ts's
// generateTestReportPdf). Colors here are all FIXED (text-black /
// text-neutral-500), never the theme CSS-variable utilities — same
// reasoning as RevenuePrintTemplate.tsx and PrintTemplateContent.tsx: a
// printed business document must render identically regardless of
// whatever theme happens to be active in the window that triggered it.
function num(n: number) {
  return Number(n).toLocaleString();
}

const GRANULARITY_LABEL: Record<RevenueGranularity, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom Range',
};

export default function TestReportPrintTemplate() {
  const [searchParams] = useSearchParams();
  const granularity = (searchParams.get('granularity') || 'daily') as RevenueGranularity;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  const [report, setReport] = useState<TestReportResult | null>(null);
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, c] = await Promise.all([api.testReport.period({ granularity, from, to }), api.settings.get()]);
        if (cancelled) return;
        if (!r) {
          markPrintError();
          return;
        }
        setReport(r);
        setClinic(c);
      } catch {
        if (!cancelled) markPrintError();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [granularity, from, to]);

  useEffect(() => {
    if (!report) return;
    let cancelled = false;
    waitForFontsAndPaint().then(() => {
      if (!cancelled) markPrintReady();
    });
    return () => {
      cancelled = true;
    };
  }, [report]);

  if (!report || !clinic) return null;

  const period = report.from === report.to ? report.from : `${report.from} to ${report.to}`;

  // "Sale Report" layout: one line per test, solid black only (mono laser).
  return (
    <div className="bg-white text-black font-sans text-[9.5pt] p-2">
      <div className="text-center mb-5">
        <div className="text-[1.5em] font-bold">{clinic.clinic_name}</div>
        {clinic.address && <div className="text-[1.15em] font-semibold whitespace-pre-line">{clinic.address}</div>}
      </div>
      <div className="text-center font-bold text-[1.1em]">SALE REPORT</div>
      <div className="text-center text-[0.9em] mb-1">
        {period} ({GRANULARITY_LABEL[granularity]})
      </div>

      <table className="w-full border-collapse table-fixed">
        <SaleColumns />
        <thead>
          <tr className="text-left" style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
            <th className="py-1 pl-1 font-bold">No.</th>
            <th className="py-1 font-bold">Date</th>
            <th className="py-1 font-bold">LR No</th>
            <th className="py-1 pr-2 font-bold">Patient Name</th>
            <th className="py-1 pr-2 font-bold">Test Name</th>
            <th className="py-1 pr-2 font-bold text-right">Fees</th>
            <th className="py-1 pr-2 font-bold text-right">Discount</th>
            <th className="py-1 pr-2 font-bold text-right">Advance</th>
            <th className="py-1 font-bold text-right">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="py-[3px] pl-1">{i + 1}</td>
              <td className="py-[3px] whitespace-nowrap">{localDate(l.created_at)}</td>
              <td className="py-[3px] pr-1 break-all">{l.report_no}</td>
              <td className="py-[3px] pr-2 uppercase">{l.patient_name}</td>
              <td className="py-[3px] pr-2 uppercase">{l.test_name}</td>
              <td className="py-[3px] pr-2 text-right">{num(l.fee)}</td>
              <td className="py-[3px] pr-2 text-right">{num(l.discount)}</td>
              <td className="py-[3px] pr-2 text-right">{num(l.advance)}</td>
              <td className="py-[3px] text-right">{num(l.remaining)}</td>
            </tr>
          ))}
          {report.lines.length === 0 && (
            <tr>
              <td colSpan={9} className="py-4 text-center">
                No finalized reports in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {/* Deliberately NOT a <tfoot>: Chromium's print engine repeats a
          <tfoot> on every page a <table> spans (verified empirically),
          which would make this grand-total row print once per page
          instead of once at the true end. A plain block after the
          table only ever renders where the table itself ends. */}
      {report.lines.length > 0 && (
        <table className="w-full border-collapse table-fixed">
          <SaleColumns />
          <tbody>
            <tr className="font-bold">
              <td colSpan={5} />
              <td className="py-1 pr-2 text-right" style={{ borderTop: '1px solid #000' }}>{num(report.lineTotals.fee)}</td>
              <td className="py-1 pr-2 text-right" style={{ borderTop: '1px solid #000' }}>{num(report.lineTotals.discount)}</td>
              <td className="py-1 pr-2 text-right" style={{ borderTop: '1px solid #000' }}>{num(report.lineTotals.advance)}</td>
              <td className="py-1 text-right" style={{ borderTop: '1px solid #000' }}>{num(report.lineTotals.remaining)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// Shared by the lines table and the totals table so their columns line up.
function SaleColumns() {
  return (
    <colgroup>
      <col style={{ width: '5%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '15%' }} />
      <col style={{ width: '15%' }} />
      <col style={{ width: '21%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '8%' }} />
    </colgroup>
  );
}
