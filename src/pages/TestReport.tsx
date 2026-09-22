import { useEffect, useState } from 'react';
import { Printer, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { RevenueGranularity, TestReportResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const GRANULARITY_OPTIONS: { value: RevenueGranularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function fmt(n: number) {
  return `Af ${Number(n).toLocaleString()}`;
}

export default function TestReport() {
  const [granularity, setGranularity] = useState<RevenueGranularity>('daily');
  const [report, setReport] = useState<TestReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);

  const filters = { granularity };

  const refresh = () => {
    setLoading(true);
    api.testReport
      .period(filters)
      .then(setReport)
      .catch((err) => {
        setReport(null);
        toast.error(err instanceof Error ? err.message : 'Failed to load the test report.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity]);

  const printReport = async () => {
    setBusy('print');
    try {
      const result = await api.testReport.print(filters);
      if (result.success) {
        if (result.fellBackToPdf) {
          toast.warning(`Direct printing failed (${result.error}). Opened the PDF instead — print it from there.`);
        } else {
          toast.success('Sent to printer.');
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to print.');
    } finally {
      setBusy(null);
    }
  };

  const savePdf = async () => {
    setBusy('pdf');
    try {
      const result = await api.testReport.exportPdf(filters);
      if (result.success) toast.success(`Saved to ${result.path}`);
      else if (!result.canceled) toast.error(result.error || 'Failed to save PDF.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save PDF.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Test Report</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every finalized report in the period, with patient, tests, referring doctor, and billing — ready to print.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={savePdf} disabled={busy !== null || !report}>
            <FileText className="h-4 w-4" />
            {busy === 'pdf' ? 'Saving…' : 'Save as PDF'}
          </Button>
          <Button onClick={printReport} disabled={busy !== null || !report}>
            <Printer className="h-4 w-4" />
            {busy === 'print' ? 'Printing…' : 'Print'}
          </Button>
        </div>
      </div>

      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {GRANULARITY_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setGranularity(o.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              granularity === o.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading || !report ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {report.from === report.to ? report.from : `${report.from} to ${report.to}`} — {report.rows.length} finalized report
            {report.rows.length === 1 ? '' : 's'}
          </p>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Test(s)</TableHead>
                  <TableHead>Referring Doctor</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  <TableRow key={r.report_id}>
                    <TableCell className="font-medium">{r.patient_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.test_codes.split(',').join(', ')}</TableCell>
                    <TableCell className="text-muted-foreground">{r.doctor_name || 'Self'}</TableCell>
                    <TableCell className="text-right">{fmt(r.subtotal)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.discount ? `-${fmt(r.discount)}` : '—'}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))}
                {report.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No finalized reports in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {report.rows.length > 0 && (
                <tfoot>
                  <TableRow className="font-bold border-t-2 border-border">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{fmt(report.totals.subtotal)}</TableCell>
                    <TableCell className="text-right">{report.totals.discount ? `-${fmt(report.totals.discount)}` : '—'}</TableCell>
                    <TableCell className="text-right">{fmt(report.totals.total)}</TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
