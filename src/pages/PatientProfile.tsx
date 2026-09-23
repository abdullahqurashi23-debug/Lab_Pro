import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ArrowLeft } from 'lucide-react';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import type { Patient, ReportListRow, PatientTrendParameter, PatientParameterPoint } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function StatusBadge({ status }: { status: ReportListRow['status'] }) {
  const isFinal = status === 'FINALIZED';
  return <Badge variant={isFinal ? 'success' : 'warning'}>{isFinal ? 'Finalized' : 'Draft'}</Badge>;
}

function flagDotColor(flag: PatientParameterPoint['flag']): string {
  if (flag === 'CRITICAL') return 'hsl(var(--destructive))';
  if (flag === 'HIGH') return 'hsl(var(--warning))';
  if (flag === 'LOW') return 'hsl(210 80% 55%)';
  return 'hsl(var(--primary))';
}

function TrendChart({ patientId }: { patientId: number }) {
  const [options, setOptions] = useState<PatientTrendParameter[]>([]);
  const [selected, setSelected] = useState('');
  const [points, setPoints] = useState<PatientParameterPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.patients
      .trendableParameters(patientId)
      .then((opts) => {
        setOptions(opts ?? []);
        setSelected(opts?.[0]?.name ?? '');
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    if (!selected) {
      setPoints([]);
      return;
    }
    api.patients
      .parameterHistory(patientId, selected)
      .then((pts) => setPoints(pts ?? []))
      .catch(() => setPoints([]));
  }, [patientId, selected]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">No numeric results yet to chart — finalize a report with a numeric test first.</p>;
  }

  const unit = options.find((o) => o.name === selected)?.unit || '';

  return (
    <div className="space-y-4">
      <div className="w-64 space-y-1.5">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.name} value={o.name}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {points.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Only {points.length} finalized result{points.length === 1 ? '' : 's'} for {selected} so far — need at least two to
          show a trend.
        </p>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={points} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} unit={unit ? ` ${unit}` : ''} />
              <Tooltip
                formatter={(v: number) => [`${v} ${unit}`, selected]}
                labelFormatter={(label, payload) => {
                  const p = payload?.[0]?.payload as PatientParameterPoint | undefined;
                  return p ? `${label} — Report ${p.report_no}` : label;
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={(props: { cx: number; cy: number; payload: PatientParameterPoint; key: string }) => (
                  <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill={flagDotColor(props.payload.flag)} />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [reports, setReports] = useState<ReportListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([api.patients.get(Number(id)), api.reports.list({ patient_id: Number(id) })])
      .then(([p, r]) => {
        if (cancelled) return;
        if (!p) {
          navigate('/patients');
          return;
        }
        setPatient(p);
        setReports(r ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        showErrorDialog(err instanceof Error ? err.message : 'Failed to load patient.');
        navigate('/patients');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const openReport = (r: ReportListRow) => {
    navigate(r.status === 'FINALIZED' ? `/reports/${r.id}/print` : `/new-report/${r.id}`);
  };

  const fmt = (n: number) => `Af ${n.toLocaleString()}`;

  if (loading || !patient) {
    return <div className="p-8 text-muted-foreground">Loading patient…</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link to="/patients" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Patients
        </Link>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{patient.full_name}</h1>
          <p className="text-muted-foreground text-sm mt-1">Patient ID {patient.patient_code}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/reports?patient=${patient.id}`)}>
          View Full Report History
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Age / Gender</div>
            <div className="font-medium mt-1">
              {patient.age ?? '—'} {patient.age_unit} / {patient.gender || '—'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Phone</div>
            <div className="font-medium mt-1">{patient.phone || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Address</div>
            <div className="font-medium mt-1">{patient.address || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Patient Since</div>
            <div className="font-medium mt-1">{patient.created_at.slice(0, 10)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parameter Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart patientId={patient.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report #</TableHead>
                <TableHead>Test(s)</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openReport(r)}>
                  <TableCell className="font-medium">{r.report_no}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.test_names ? r.test_names.split(',').join(', ') : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.doctor_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.created_at.slice(0, 10)}</TableCell>
                  <TableCell>{fmt(r.total)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openReport(r)}>
                      {r.status === 'FINALIZED' ? 'View' : 'Open'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {reports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No reports yet for this patient.
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
