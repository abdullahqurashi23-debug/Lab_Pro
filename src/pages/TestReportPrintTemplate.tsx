import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import type { RevenueGranularity, TestReportResult } from '@/lib/types';

// Rendered only inside a hidden BrowserWindow for the Test Report page's
// "Print" and "Save as PDF" actions (see electron/print.ts's
// generateTestReportPdf). Colors here are all FIXED (text-black /
// text-neutral-500), never the theme CSS-variable utilities — same
// reasoning as RevenuePrintTemplate.tsx and PrintTemplateContent.tsx: a
// printed business document must render identically regardless of
// whatever theme happens to be active in the window that triggered it.
function fmt(n: number) {
  return `Af ${Number(n).toLocaleString()}`;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.testReport.period({ granularity, from, to });
        if (cancelled) return;
        if (!r) {
          document.body.setAttribute('data-print-ready', 'error');
          return;
        }
        setReport(r);
      } catch {
        if (!cancelled) document.body.setAttribute('data-print-ready', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [granularity, from, to]);

  useEffect(() => {
    if (!report) return;
    const raf = requestAnimationFrame(() => document.body.setAttribute('data-print-ready', 'true'));
    return () => cancelAnimationFrame(raf);
  }, [report]);

  if (!report) return null;

  return (
    <div className="bg-white text-black font-sans text-[10pt] p-2">
      <div className="text-center mb-6">
        <div className="text-lg font-bold">LabPro Test Report</div>
        <div className="text-neutral-500 text-[0.9em] mt-1">
          {report.from === report.to ? report.from : `${report.from} to ${report.to}`} ({GRANULARITY_LABEL[granularity]})
        </div>
      </div>

      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col style={{ width: '16%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr className="text-left border-b border-black">
            <th className="py-1 pr-2 font-medium">Patient</th>
            <th className="py-1 pr-2 font-medium">Test(s)</th>
            <th className="py-1 pr-2 font-medium">Referring Doctor</th>
            <th className="py-1 pr-2 font-medium text-right whitespace-nowrap">Subtotal</th>
            <th className="py-1 pr-2 font-medium text-right whitespace-nowrap">Discount</th>
            <th className="py-1 font-medium text-right whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.report_id} className="border-b border-black/10 align-top">
              <td className="py-1 pr-2">{r.patient_name}</td>
              <td className="py-1 pr-2">{r.test_names.split(',').join(', ')}</td>
              <td className="py-1 pr-2 text-neutral-500">{r.doctor_name || 'Self'}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{fmt(r.subtotal)}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{r.discount ? `-${fmt(r.discount)}` : '—'}</td>
              <td className="py-1 text-right whitespace-nowrap font-medium">{fmt(r.total)}</td>
            </tr>
          ))}
          {report.rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-neutral-500">
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
      {report.rows.length > 0 && (
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '16%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '13%' }} />
          </colgroup>
          <tbody>
            <tr className="border-t-2 border-black font-bold">
              <td className="py-1.5 pr-2" colSpan={3}>
                Total ({report.rows.length} report{report.rows.length === 1 ? '' : 's'})
              </td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap">{fmt(report.totals.subtotal)}</td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap">{report.totals.discount ? `-${fmt(report.totals.discount)}` : '—'}</td>
              <td className="py-1.5 text-right whitespace-nowrap">{fmt(report.totals.total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
