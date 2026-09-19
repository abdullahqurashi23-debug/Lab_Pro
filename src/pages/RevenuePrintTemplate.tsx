import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import type { RevenueGranularity, RevenuePeriodReport, OutstandingBalanceRow } from '@/lib/types';

// Rendered only inside a hidden BrowserWindow for the Revenue page's
// "Export PDF" button (see electron/print.ts's generateRevenuePdf). Colors
// here are all FIXED (text-black / text-neutral-500), never the theme
// CSS-variable utilities (text-foreground etc.) — those flip with the
// app's light/dark toggle, which already caused real, invisible-text bugs
// in the patient report template (see PrintTemplateContent.tsx). A
// business PDF must render the same regardless of whatever theme happens
// to be active in the window that triggered the export.
function fmt(n: number) {
  return `Af ${Number(n).toLocaleString()}`;
}

function pctLabel(pct: number | null): string {
  if (pct === null) return 'N/A';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function BreakdownTable({ rows, labelHeader }: { rows: { label: string; revenue: number; count: number }[] | undefined; labelHeader: string }) {
  const safeRows = rows || [];
  if (safeRows.length === 0) return <p className="text-neutral-500 text-[0.85em]">No finalized reports in this period.</p>;
  return (
    <table className="w-full text-[0.85em] border-collapse mb-4">
      <thead>
        <tr className="text-left border-b border-black/60">
          <th className="py-1 pr-2 font-medium">{labelHeader}</th>
          <th className="py-1 pr-2 font-medium text-right">Count</th>
          <th className="py-1 font-medium text-right">Revenue</th>
        </tr>
      </thead>
      <tbody>
        {safeRows.map((r) => (
          <tr key={r.label} className="border-b border-black/10">
            <td className="py-1 pr-2">{r.label}</td>
            <td className="py-1 pr-2 text-right">{r.count}</td>
            <td className="py-1 text-right">{fmt(r.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RevenuePrintTemplate() {
  const [searchParams] = useSearchParams();
  const granularity = (searchParams.get('granularity') || 'monthly') as RevenueGranularity;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  const [report, setReport] = useState<RevenuePeriodReport | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingBalanceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, o] = await Promise.all([api.revenue.period({ granularity, from, to }), api.revenue.outstandingBalances()]);
        if (cancelled) return;
        if (!r) {
          document.body.setAttribute('data-print-ready', 'error');
          return;
        }
        setReport(r);
        setOutstanding(o ?? []);
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
        <div className="text-lg font-bold">LabPro Revenue Report</div>
        <div className="text-neutral-500 text-[0.9em] mt-1">
          {report.from === report.to ? report.from : `${report.from} to ${report.to}`} ({granularity})
        </div>
      </div>

      <table className="w-full border-collapse mb-6">
        <tbody>
          <tr>
            <td className="py-1 pr-4 text-neutral-500">Revenue</td>
            <td className="py-1 pr-4 font-semibold">{fmt(report.current.revenue)}</td>
            <td className="py-1 text-neutral-500">
              {pctLabel(report.changePct.revenue)} vs previous period ({fmt(report.previous.revenue)})
            </td>
          </tr>
          <tr>
            <td className="py-1 pr-4 text-neutral-500">Finalized Reports</td>
            <td className="py-1 pr-4 font-semibold">{report.current.count}</td>
            <td className="py-1 text-neutral-500">
              {pctLabel(report.changePct.count)} vs previous period ({report.previous.count})
            </td>
          </tr>
          <tr>
            <td className="py-1 pr-4 text-neutral-500">Total Discounts Given</td>
            <td className="py-1 pr-4 font-semibold">{fmt(report.current.discounts)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div className="font-bold mb-1.5 border-b border-black pb-1">Revenue Trend</div>
      <table className="w-full text-[0.85em] border-collapse mb-6">
        <thead>
          <tr className="text-left border-b border-black/60">
            <th className="py-1 pr-2 font-medium">Period</th>
            <th className="py-1 pr-2 font-medium text-right">Reports</th>
            <th className="py-1 font-medium text-right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {(report.trend || []).map((t) => (
            <tr key={t.bucket} className="border-b border-black/10">
              <td className="py-1 pr-2">{t.bucket}</td>
              <td className="py-1 pr-2 text-right">{t.count}</td>
              <td className="py-1 text-right">{fmt(t.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="font-bold mb-1.5 border-b border-black pb-1">Top 10 Tests by Count</div>
      <BreakdownTable rows={report.topTestsByCount} labelHeader="Test" />

      <div className="font-bold mb-1.5 border-b border-black pb-1">Top 10 Tests by Revenue</div>
      <BreakdownTable rows={report.topTestsByRevenue} labelHeader="Test" />

      <div className="font-bold mb-1.5 border-b border-black pb-1">Revenue by Referring Doctor</div>
      <BreakdownTable rows={report.byDoctor} labelHeader="Doctor" />

      <div className="font-bold mb-1.5 border-b border-black pb-1">Revenue by Category</div>
      <BreakdownTable rows={report.byCategory} labelHeader="Category" />

      <div className="font-bold mb-1.5 border-b border-black pb-1">Revenue by Payment Method</div>
      <BreakdownTable rows={report.byPaymentMethod} labelHeader="Method" />

      <div className="font-bold mb-1.5 border-b border-black pb-1">Outstanding Balances ({outstanding.length})</div>
      {outstanding.length === 0 ? (
        <p className="text-neutral-500 text-[0.85em]">None — everything finalized so far has been paid in full.</p>
      ) : (
        <table className="w-full text-[0.85em] border-collapse">
          <thead>
            <tr className="text-left border-b border-black/60">
              <th className="py-1 pr-2 font-medium">Report #</th>
              <th className="py-1 pr-2 font-medium">Patient</th>
              <th className="py-1 pr-2 font-medium">Finalized</th>
              <th className="py-1 pr-2 font-medium text-right">Total</th>
              <th className="py-1 pr-2 font-medium text-right">Paid</th>
              <th className="py-1 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {outstanding.map((o) => (
              <tr key={o.id} className="border-b border-black/10">
                <td className="py-1 pr-2">{o.report_no}</td>
                <td className="py-1 pr-2">{o.patient_name}</td>
                <td className="py-1 pr-2">{o.finalized_at ? o.finalized_at.slice(0, 10) : '—'}</td>
                <td className="py-1 pr-2 text-right">{fmt(o.total)}</td>
                <td className="py-1 pr-2 text-right">{fmt(o.paid_total)}</td>
                <td className="py-1 text-right font-semibold">{fmt(o.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
