import { useEffect, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Cell,
} from 'recharts';
import { FileSpreadsheet, FileText, Printer, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import type { RevenueGranularity, RevenuePeriodReport, OutstandingBalanceRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import RecordPaymentDialog from '@/components/RecordPaymentDialog';

const GRANULARITY_OPTIONS: { value: RevenueGranularity; label: string; comparisonLabel: string }[] = [
  { value: 'daily', label: 'Daily', comparisonLabel: 'vs yesterday' },
  { value: 'weekly', label: 'Weekly', comparisonLabel: 'vs last week' },
  { value: 'monthly', label: 'Monthly', comparisonLabel: 'vs last month' },
  { value: 'yearly', label: 'Yearly', comparisonLabel: 'vs last year' },
  { value: 'custom', label: 'Custom', comparisonLabel: 'vs previous period' },
];

const CATEGORY_COLORS = [
  'hsl(var(--primary))',
  'hsl(173 60% 45%)',
  'hsl(200 60% 45%)',
  'hsl(32 80% 50%)',
  'hsl(280 50% 55%)',
  'hsl(340 60% 55%)',
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function formatBucketLabel(bucket: string, granularity: RevenueGranularity): string {
  if (granularity === 'yearly') return bucket;
  if (granularity === 'monthly' || (granularity === 'custom' && bucket.length === 7)) {
    return new Date(`${bucket}-01`).toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }
  return bucket.slice(5); // MM-DD
}

function fmt(n: number) {
  return `Af ${Number(n).toLocaleString()}`;
}

function ChangeBadge({ pct, comparisonLabel }: { pct: number | null; comparisonLabel: string }) {
  if (pct === null) {
    return <span className="text-xs text-muted-foreground">No data for previous period</span>;
  }
  const isUp = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${isUp ? 'text-success' : 'text-destructive'}`}>
      {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {isUp ? '+' : ''}
      {pct.toFixed(1)}% {comparisonLabel}
    </span>
  );
}

function BreakdownTable({ rows, labelHeader }: { rows: { label: string; revenue: number; count: number }[] | undefined; labelHeader: string }) {
  const safeRows = rows || [];
  if (safeRows.length === 0) return <p className="text-sm text-muted-foreground">No finalized reports in this period.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelHeader}</TableHead>
          <TableHead className="text-right">Count</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {safeRows.map((r) => (
          <TableRow key={r.label}>
            <TableCell className="font-medium">{r.label}</TableCell>
            <TableCell className="text-right">{r.count}</TableCell>
            <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Revenue() {
  const [granularity, setGranularity] = useState<RevenueGranularity>('monthly');
  const [customFrom, setCustomFrom] = useState(monthStartIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const [report, setReport] = useState<RevenuePeriodReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [outstanding, setOutstanding] = useState<OutstandingBalanceRow[]>([]);
  const [paymentTarget, setPaymentTarget] = useState<OutstandingBalanceRow | null>(null);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | 'print' | null>(null);

  const filters = { granularity, from: granularity === 'custom' ? customFrom : undefined, to: granularity === 'custom' ? customTo : undefined };

  const refreshReport = () => {
    setLoading(true);
    api.revenue
      .period(filters)
      .then(setReport)
      .catch((err) => {
        setReport(null);
        showErrorDialog(err instanceof Error ? err.message : 'Failed to load revenue data.');
      })
      .finally(() => setLoading(false));
  };
  const refreshOutstanding = () =>
    api.revenue
      .outstandingBalances()
      .then((rows) => setOutstanding(rows ?? []))
      .catch(() => setOutstanding([]));

  useEffect(() => {
    refreshReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity, customFrom, customTo]);

  useEffect(() => {
    refreshOutstanding();
  }, []);

  const comparisonLabel = GRANULARITY_OPTIONS.find((o) => o.value === granularity)?.comparisonLabel || 'vs previous period';

  const exportExcel = async () => {
    setExporting('excel');
    try {
      const result = await api.revenue.exportExcel(filters);
      if (result.success) toast.success(`Exported to ${result.path}`);
      else if (!result.canceled) showErrorDialog(result.error || 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    setExporting('pdf');
    try {
      const result = await api.revenue.exportPdf(filters);
      if (result.success) toast.success(`Exported to ${result.path}`);
      else if (!result.canceled) showErrorDialog(result.error || 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  const printReport = async () => {
    setExporting('print');
    try {
      const result = await api.revenue.print(filters);
      if (result.success) {
        if (result.fellBackToPdf) {
          toast.warning(`Direct printing failed (${result.error}). Opened the PDF instead — print it from there.`);
        } else {
          toast.success(result.printer ? `Sent to "${result.printer}".` : 'Sent to printer.');
        }
      }
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to print.');
    } finally {
      setExporting(null);
    }
  };

  const trendData = (report?.trend || []).map((t) => ({ ...t, label: formatBucketLabel(t.bucket, granularity) }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenue</h1>
          <p className="text-muted-foreground text-sm mt-1">Only finalized reports count toward revenue.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={printReport} disabled={exporting !== null || !report}>
            <Printer className="h-4 w-4" />
            {exporting === 'print' ? 'Printing…' : 'Print'}
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={exporting !== null || !report}>
            <FileSpreadsheet className="h-4 w-4" />
            {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={exporting !== null || !report}>
            <FileText className="h-4 w-4" />
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </Button>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden">
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
        {granularity === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9" />
            </div>
          </>
        )}
      </div>

      {loading || !report ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <div className="flex gap-4 flex-wrap">
            <Card className="flex-1 min-w-[220px]">
              <CardContent className="p-5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Revenue ({report.from === report.to ? report.from : `${report.from} to ${report.to}`})
                </div>
                <div className="text-3xl font-bold mt-2 text-primary">{fmt(report.current.revenue)}</div>
                <div className="mt-1">
                  <ChangeBadge pct={report.changePct.revenue} comparisonLabel={comparisonLabel} />
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[220px]">
              <CardContent className="p-5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Finalized Reports</div>
                <div className="text-3xl font-bold mt-2 text-foreground">{report.current.count}</div>
                <div className="mt-1">
                  <ChangeBadge pct={report.changePct.count} comparisonLabel={comparisonLabel} />
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[220px]">
              <CardContent className="p-5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Discounts Given</div>
                <div className="text-3xl font-bold mt-2 text-warning">{fmt(report.current.discounts)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue & Report Count Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No finalized reports in this range.</p>
              ) : (
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis yAxisId="revenue" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis yAxisId="count" orientation="right" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip formatter={(v: number, name: string) => (name === 'Revenue' ? fmt(v) : v)} />
                      <Legend />
                      <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="count" type="monotone" dataKey="count" name="Reports" stroke="hsl(32 80% 50%)" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Tests by Count</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownTable rows={report.topTestsByCount} labelHeader="Test" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Tests by Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownTable rows={report.topTestsByRevenue} labelHeader="Test" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>By Referring Doctor</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownTable rows={report.byDoctor} labelHeader="Doctor" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By Category</CardTitle>
              </CardHeader>
              <CardContent>
                {(report.byCategory || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No finalized reports in this period.</p>
                ) : (
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={report.byCategory} layout="vertical" margin={{ left: 24 }}>
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <YAxis type="category" dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} width={100} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                          {(report.byCategory || []).map((_, i) => (
                            <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownTable rows={report.byPaymentMethod} labelHeader="Method" />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Outstanding Balances ({outstanding.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Finalized</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstanding.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.report_no}</TableCell>
                  <TableCell>{o.patient_name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.patient_phone || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{o.finalized_at ? o.finalized_at.slice(0, 10) : '—'}</TableCell>
                  <TableCell className="text-right">{fmt(o.total)}</TableCell>
                  <TableCell className="text-right">{fmt(o.paid_total)}</TableCell>
                  <TableCell className="text-right text-destructive font-semibold">{fmt(o.balance)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setPaymentTarget(o)}>
                      Record Payment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {outstanding.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No outstanding balances — everything finalized so far has been paid in full.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {paymentTarget && (
        <RecordPaymentDialog
          open={!!paymentTarget}
          onOpenChange={(open) => !open && setPaymentTarget(null)}
          reportId={paymentTarget.id}
          reportNo={paymentTarget.report_no}
          balanceDue={paymentTarget.balance}
          onRecorded={() => {
            refreshOutstanding();
            refreshReport();
          }}
        />
      )}
    </div>
  );
}
