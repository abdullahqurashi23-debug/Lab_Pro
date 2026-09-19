import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { Search, Sun, Moon, UserCircle2, Lock, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';
import type { TestWithParameters, PatientWithStats, ReportListRow } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SearchResults {
  patients: PatientWithStats[];
  reports: ReportListRow[];
  tests: TestWithParameters[];
}

const EMPTY_RESULTS: SearchResults = { patients: [], reports: [], tests: [] };

export default function TopBar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<TestWithParameters[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.tests.list().then(setCatalog).catch(() => {});
  }, []);

  const fuse = useMemo(
    () => new Fuse(catalog, { keys: ['short_code', 'name'], threshold: 0.35, ignoreLocation: true }),
    [catalog]
  );

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(EMPTY_RESULTS);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [patients, reports] = await Promise.all([api.patients.list(q), api.reports.search(q)]);
        const tests = fuse.search(q, { limit: 5 }).map((r) => r.item);
        setResults({ patients: (patients ?? []).slice(0, 5), reports: reports ?? [], tests });
        setOpen(true);
      } catch {
        setResults(EMPTY_RESULTS);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, fuse]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const goToPatient = (p: PatientWithStats) => {
    setQuery('');
    setOpen(false);
    navigate(`/reports?patient=${p.id}`);
  };

  const goToReport = (r: ReportListRow) => {
    setQuery('');
    setOpen(false);
    navigate(`/reports/${r.id}/print`);
  };

  const goToTest = (t: TestWithParameters) => {
    setQuery('');
    setOpen(false);
    navigate('/tests', { state: { query: t.short_code } });
  };

  const hasResults = results.patients.length + results.reports.length + results.tests.length > 0;

  return (
    <header className="no-print h-14 shrink-0 border-b border-border bg-background flex items-center px-6">
      {/* Three equal-width flex columns is what actually centers the middle
          one regardless of how wide the left/right groups are — a plain
          `flex-1` on just the search box only fills leftover space after
          the other items, which visually reads as "stuck to the left,"
          not truly centered. */}
      <div className="flex-1" />

      <div ref={containerRef} className="relative flex-1 flex justify-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients, reports, tests…"
            className="pl-8 h-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setOpen(true)}
          />
          {open && (
            <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto text-sm">
              {!hasResults && <div className="px-3 py-3 text-muted-foreground">No matches.</div>}
              {results.patients.length > 0 && (
                <div>
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">Patients</div>
                  {results.patients.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goToPatient(p)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between"
                    >
                      <span>{p.full_name}</span>
                      <span className="text-muted-foreground">
                        {p.age} {p.age_unit}, {p.gender}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {results.reports.length > 0 && (
                <div>
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">Reports</div>
                  {results.reports.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => goToReport(r)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between"
                    >
                      <span className="font-medium">{r.report_no}</span>
                      <span className="text-muted-foreground">{r.patient_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.tests.length > 0 && (
                <div>
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">Test Catalog</div>
                  {results.tests.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => goToTest(t)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between"
                    >
                      <span>
                        <span className="font-medium">{t.short_code}</span>
                        <span className="text-muted-foreground"> — {t.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-end gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle light/dark theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <UserCircle2 className="h-5 w-5" />
              {user?.full_name || 'Account'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {user?.full_name} &middot; {user?.role}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <KeyRound className="h-4 w-4 mr-2" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => logout('manual')}>
              <Lock className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
