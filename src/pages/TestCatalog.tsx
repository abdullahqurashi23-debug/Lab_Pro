import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Fuse from 'fuse.js';
import { toast } from 'sonner';
import { showErrorDialog } from '@/lib/errorDialog';
import {
  FileJson,
  Upload,
  Pencil,
  Trash2,
  Plus,
  FolderCog,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import type { TestCategory, TestWithParameters } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import TestFormDialog from '@/components/test-catalog/TestFormDialog';
import CategoryManagerDialog from '@/components/test-catalog/CategoryManagerDialog';

type SortKey = 'name' | 'short_code' | 'category_name' | 'price';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'active' | 'inactive' | 'all';

export default function TestCatalog() {
  const location = useLocation();
  const [tests, setTests] = useState<TestWithParameters[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [query, setQuery] = useState(() => (location.state as { query?: string } | null)?.query || '');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TestWithParameters | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TestWithParameters | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<TestWithParameters | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshTests = () =>
    api.tests
      .list(true)
      .then(setTests)
      .catch((err) => showErrorDialog(err instanceof Error ? err.message : 'Failed to load tests.'));
  const refreshCategories = () =>
    api.categories
      .list()
      .then(setCategories)
      .catch((err) => showErrorDialog(err instanceof Error ? err.message : 'Failed to load categories.'));
  useEffect(() => {
    Promise.all([refreshTests(), refreshCategories()]).finally(() => setLoading(false));
  }, []);
  useLiveRefresh(() => {
    refreshTests();
    refreshCategories();
  });

  const fuse = useMemo(
    () => new Fuse(tests, { keys: ['name', 'short_code'], threshold: 0.35, ignoreLocation: true }),
    [tests]
  );

  const filtered = useMemo(() => {
    let list = query.trim() ? fuse.search(query).map((r) => r.item) : tests;
    if (categoryFilter !== 'all') {
      list = list.filter((t) =>
        categoryFilter === '__none__' ? t.category_id == null : String(t.category_id) === categoryFilter
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((t) => (statusFilter === 'active' ? t.is_active : !t.is_active));
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const av = sort.key === 'category_name' ? a.category_name || '' : a[sort.key];
      const bv = sort.key === 'category_name' ? b.category_name || '' : b[sort.key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [tests, query, fuse, categoryFilter, statusFilter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
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

  const startNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const startEdit = (t: TestWithParameters) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.tests.delete(pendingDelete.id);
      toast.success('Test deleted.');
      refreshTests();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to delete test.');
    } finally {
      setPendingDelete(null);
    }
  };

  const confirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    try {
      if (pendingDeactivate.is_active) {
        await api.tests.deactivate(pendingDeactivate.id);
        toast.success(`${pendingDeactivate.name} deactivated.`);
      } else {
        await api.tests.activate(pendingDeactivate.id);
        toast.success(`${pendingDeactivate.name} reactivated.`);
      }
      refreshTests();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to update test.');
    } finally {
      setPendingDeactivate(null);
    }
  };

  const exportJson = async () => {
    setExporting(true);
    try {
      const result = await api.tests.exportJson();
      if (result.success) toast.success(`Exported to ${result.path}`);
      else if (!result.canceled) showErrorDialog(result.error || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const importJson = async () => {
    setImporting(true);
    try {
      const result = await api.tests.importJson();
      if ('canceled' in result) return;
      toast.success(
        `Imported ${result.testsInserted} test(s), created ${result.categoriesCreated} categor${result.categoriesCreated === 1 ? 'y' : 'ies'}, skipped ${result.testsSkipped}.`
      );
      result.errors.forEach((e) => toast.warning(e));
      refreshTests();
      refreshCategories();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Test Catalog</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tests used in any report can be edited or deactivated, but never deleted.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
            <FolderCog className="h-4 w-4" />
            Manage Categories
          </Button>
          <Button variant="outline" onClick={importJson} disabled={importing}>
            <Upload className="h-4 w-4" />
            {importing ? 'Importing…' : 'Import JSON'}
          </Button>
          <Button variant="outline" onClick={exportJson} disabled={exporting || tests.length === 0}>
            <FileJson className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export JSON'}
          </Button>
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" />
            Add New Test
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Search tests by name or short code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px]"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="__none__">Uncategorized</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center text-muted-foreground py-10 text-sm">Loading test catalog…</div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader label="Name" sortKey="name" />
              </TableHead>
              <TableHead>
                <SortHeader label="Code" sortKey="short_code" />
              </TableHead>
              <TableHead>
                <SortHeader label="Category" sortKey="category_name" />
              </TableHead>
              <TableHead>
                <SortHeader label="Price" sortKey="price" />
              </TableHead>
              <TableHead>Sample</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{t.short_code}</TableCell>
                <TableCell className="text-muted-foreground">{t.category_name || '—'}</TableCell>
                <TableCell>Af {t.price}</TableCell>
                <TableCell className="text-muted-foreground">{t.sample_type || '—'}</TableCell>
                <TableCell>
                  {t.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(t)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setPendingDeactivate(t)} title={t.is_active ? 'Deactivate' : 'Reactivate'}>
                    {t.is_active ? <Ban className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setPendingDelete(t)} title="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  No tests match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        )}
      </div>

      <TestFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        categories={categories}
        onSaved={refreshTests}
      />

      <CategoryManagerDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        categories={categories}
        onChanged={() => {
          refreshCategories();
          refreshTests();
        }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This only works if the test has never been used in a report — if it has, deactivate it instead. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeactivate} onOpenChange={(open) => !open && setPendingDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDeactivate?.is_active ? 'Deactivate' : 'Reactivate'} "{pendingDeactivate?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeactivate?.is_active
                ? "It won't be selectable for new reports, but stays visible here and in every past report."
                : 'It becomes selectable for new reports again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivate}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
