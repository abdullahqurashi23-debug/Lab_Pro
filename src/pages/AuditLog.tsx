import { localDateTime } from '@/lib/localTime';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import type { AuditLogEntry, PublicUser } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PAGE_SIZE = 50;

function humanize(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDetails(json: string): string {
  if (!json) return '—';
  try {
    const parsed = JSON.parse(json);
    return Object.entries(parsed)
      .map(([k, v]) => `${humanize(k)}: ${v}`)
      .join(', ');
  } catch {
    return json;
  }
}

export default function AuditLog() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [userId, setUserId] = useState('all');
  const [page, setPage] = useState(1);

  const [actions, setActions] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useLiveRefresh(() => setTick((t) => t + 1));

  useEffect(() => {
    api.audit.actions().then(setActions).catch(() => setActions([]));
    api.audit.entities().then(setEntities).catch(() => setEntities([]));
    api.users.list().then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [from, to, action, entity, userId]);

  useEffect(() => {
    setLoading(true);
    api.audit
      .list({
        from: from || undefined,
        to: to || undefined,
        action: action === 'all' ? undefined : action,
        entity: entity === 'all' ? undefined : entity,
        user_id: userId === 'all' ? undefined : Number(userId),
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        setRows(result?.rows ?? []);
        setTotal(result?.total ?? 0);
      })
      .catch((err) => {
        setRows([]);
        setTotal(0);
        showErrorDialog(err instanceof Error ? err.message : 'Failed to load audit log.');
      })
      .finally(() => setLoading(false));
  }, [from, to, action, entity, userId, page, tick]);

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setAction('all');
    setEntity('all');
    setUserId('all');
  };
  const hasActiveFilters = from || to || action !== 'all' || entity !== 'all' || userId !== 'all';

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="text-muted-foreground text-sm mt-1">Every login, edit, finalize, print, backup, and restore, in order.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label>Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {humanize(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Entity</Label>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {humanize(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>User</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.full_name}
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
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">{localDateTime(r.created_at)}</TableCell>
                <TableCell>{r.user_full_name || <span className="text-muted-foreground">System</span>}</TableCell>
                <TableCell className="font-medium">{humanize(r.action)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {humanize(r.entity)}
                  {r.entity_id ? ` #${r.entity_id}` : ''}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs max-w-md truncate" title={formatDetails(r.details_json)}>
                  {formatDetails(r.details_json)}
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No audit entries match your filters.
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
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
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
