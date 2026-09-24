import { localDate } from '@/lib/localTime';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus } from 'lucide-react';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import type { DashboardStats, ReportListRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="p-5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-3xl font-bold mt-2 ${accent || 'text-foreground'}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ReportListRow['status'] }) {
  const isFinal = status === 'FINALIZED';
  return <Badge variant={isFinal ? 'success' : 'warning'}>{isFinal ? 'Finalized' : 'Draft'}</Badge>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (silent: boolean) =>
    api.dashboard
      .stats()
      .then(setStats)
      .catch((err) => {
        // A rejected/incompatible response here (e.g. the app was updated
        // but the running process is stale) should never leave the whole
        // page stuck or crash it — just surface it and let the user retry.
        // Background refreshes stay quiet and keep the last good numbers.
        if (!silent) showErrorDialog(err instanceof Error ? err.message : 'Failed to load dashboard stats.');
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load(false);
  }, []);
  useLiveRefresh(() => load(true));

  if (loading || !stats) {
    return <div className="p-8 text-muted-foreground">Loading dashboard…</div>;
  }

  const chartData = (stats.last7Days || []).map((d) => ({
    day: d.day.slice(5), // MM-DD
    reports: d.count,
  }));
  const recentReports = stats.recentReports || [];

  const fmt = (n: number) => `Af ${Number(n).toLocaleString()}`;

  const openReport = (r: ReportListRow) => {
    navigate(r.status === 'FINALIZED' ? `/reports/${r.id}/print` : `/new-report/${r.id}`);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Reports and revenue at a glance.</p>
        </div>
        <Button onClick={() => navigate('/new-report')}>
          <Plus className="h-4 w-4" />
          New Report
        </Button>
      </div>

      <div className="flex gap-4 flex-wrap">
        <StatCard label="Today's Revenue" value={fmt(stats.today.revenue)} accent="text-primary" />
        <StatCard label="Today's Reports" value={stats.today.count} />
        <StatCard label="Pending Drafts" value={stats.pendingDrafts ?? 0} accent={(stats.pendingDrafts ?? 0) > 0 ? 'text-warning' : undefined} />
        <StatCard
          label="Outstanding Balance"
          value={fmt(stats.outstandingBalance ?? 0)}
          accent={(stats.outstandingBalance ?? 0) > 0 ? 'text-destructive' : undefined}
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">This Week / This Month</h2>
        <div className="flex gap-4">
          <StatCard label="This Week — Reports" value={stats.week.count} />
          <StatCard label="This Week — Revenue" value={fmt(stats.week.revenue)} accent="text-primary" />
          <StatCard label="This Month — Reports" value={stats.month.count} />
          <StatCard label="This Month — Revenue" value={fmt(stats.month.revenue)} accent="text-primary" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reports — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip />
                <Bar dataKey="reports" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentReports.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openReport(r)}>
                  <TableCell className="font-medium">{r.report_no}</TableCell>
                  <TableCell>{r.patient_name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.doctor_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{localDate(r.created_at)}</TableCell>
                  <TableCell>{fmt(r.total)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
              {recentReports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No reports yet. Create one from "New Report".
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
