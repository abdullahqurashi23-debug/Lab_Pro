import { localDate } from '@/lib/localTime';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Search, X, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import type { Doctor, ReportListRow, ReportSortKey } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type StatusFilter = 'all' | 'DRAFT' | 'FINALIZED';
const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: ReportListRow['status'] }) {
  const isFinal = status === 'FINALIZED';
  return <Badge variant={isFinal ? 'success' : 'warning'}>{isFinal ? 'Finalized • Locked' : 'Draft'}</Badge>;
}

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const patientId = searchParams.get('patient');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [doctorId, setDoctorId] = useState('all');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [sort, setSort] = useState<{ key: ReportSortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<ReportListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.doctors.list().then(setDoctors).catch(() => setDoctors([]));
  }, []);

  // Debounce the free-text search only — date/status/doctor filters and
  // pagination should feel instant since they're discrete choices, not
  // something the user is still typing.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change resets back to page 1 — staying on, say, page 4 of a
  // now much-shorter filtered result set would just show an empty page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, from, to, status, doctorId, patientId]);

  const refresh = () => {
    setLoading(true);
    api.reports
      .listPage({
        search: debouncedSearch,
        from: from || undefined,
        to: to ? `${to} 23:59:59` : undefined,
        status: status === 'all' ? undefined : status,
        doctor_id: doctorId === 'all' ? undefined : Number(doctorId),
        patient_id: patientId ? Number(patientId) : undefined,
        sortKey: sort.key,
        sortDir: sort.dir,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        const rows = result?.rows ?? [];
        setRows(rows);
        setTotal(result?.total ?? 0);
        setPatientName(rows[0]?.patient_name ?? null);
      })
      .catch((err) => {
        setRows([]);
        setTotal(0);
        showErrorDialog(err instanceof Error ? err.message : 'Failed to load reports.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, from, to, status, doctorId, patientId, sort, page]);
  useLiveRefresh(refresh);

  const toggleSort = (key: ReportSortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: ReportSortKey }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(sortKey)}>
      {label}
      {sort.key !== sortKey ? (
        <ArrowUpDown className="h-3 w-3" />
      ) : sort.dir === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
    </button>
  );

  const clearFilters = () => {
    setSearch('');
    setFrom('');
    setTo('');
    setStatus('all');
    setDoctorId('all');
  };
  const clearPatientFilter = () => setSearchParams({});

  const hasActiveFilters = search || from || to || status !== 'all' || doctorId !== 'all';

  // A draft opens back in the New Report page (which doubles as the result
  // entry / edit screen) so a technician can enter results without needing
  // "New Report" itself in their sidebar. A finalized report opens straight
  // to the read-only print/reprint view — there is no edit path for it.
  const openReport = (r: ReportListRow) => {
    navigate(r.status === 'FINALIZED' ? `/reports/${r.id}/print` : `/new-report/${r.id}`);
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const result = await api.reports.exportExcel({
        from: from || undefined,
        to: to || undefined,
        status: status === 'all' ? undefined : status,
        patient_id: patientId ? Number(patientId) : undefined,
      });
      if (result.success) {
        toast.success(`Exported to ${result.path}`);
      } else if (!result.canceled) {
        showErrorDialog(result.error || 'Export failed.');
      }
    } finally {
      setExporting(false);
    }
  };

  const fmt = (n: number) => `Af ${n.toLocaleString()}`;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports History</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every saved report is permanent and can't be deleted. Drafts can still be edited until finalized.
          </p>
        </div>
        <Button variant="outline" onClick={exportToExcel} disabled={exporting || total === 0}>
          <FileSpreadsheet className="h-4 w-4" />
          {exporting ? 'Exporting…' : 'Export to Excel'}
        </Button>
      </div>

      {patientId && (
        <div className="flex items-center justify-between bg-accent text-accent-foreground text-sm rounded-lg px-4 py-2">
          <span>Filtered to {patientName || 'this patient'}'s reports.</span>
          <Button variant="ghost" size="sm" onClick={clearPatientFilter} className="h-auto p-1">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px] space-y-1.5">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Report no, patient name, phone, or test…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="FINALIZED">Finalized</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Doctor</Label>
          <Select value={doctorId} onValueChange={setDoctorId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Doctors</SelectItem>
              {doctors.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearFilters} className="h-9">
            Clear filters
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader label="Report #" sortKey="report_no" />
              </TableHead>
              <TableHead>
                <SortHeader label="Patient" sortKey="patient_name" />
              </TableHead>
              <TableHead>
                <SortHeader label="Doctor" sortKey="doctor_name" />
              </TableHead>
              <TableHead>
                <SortHeader label="Date" sortKey="created_at" />
              </TableHead>
              <TableHead>
                <SortHeader label="Total" sortKey="total" />
              </TableHead>
              <TableHead>
                <SortHeader label="Balance" sortKey="balance" />
              </TableHead>
              <TableHead>
                <SortHeader label="Status" sortKey="status" />
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => openReport(r)}>
                <TableCell className="font-medium">{r.report_no}</TableCell>
                <TableCell>
                  {r.patient_name} <span className="text-muted-foreground">({r.patient_code})</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.doctor_name || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{localDate(r.created_at)}</TableCell>
                <TableCell>{fmt(r.total)}</TableCell>
                <TableCell className={r.balance > 0 ? 'text-destructive' : 'text-muted-foreground'}>{fmt(r.balance)}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right space-x-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openReport(r)}>
                    {r.status === 'FINALIZED' ? 'View / Reprint' : 'Open / Enter Results'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {hasActiveFilters || patientId ? 'No reports match your filters.' : 'No reports yet. Create one from "New Report".'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
            <span>
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
