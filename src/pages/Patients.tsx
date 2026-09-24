import { localDate } from '@/lib/localTime';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import type { PatientWithStats } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Patients() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<PatientWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped by useLiveRefresh so a patient registered elsewhere appears here.
  const [tick, setTick] = useState(0);
  useLiveRefresh(() => setTick((t) => t + 1));

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api.patients
        .list(query)
        .then(setPatients)
        .catch((err) => showErrorDialog(err instanceof Error ? err.message : 'Failed to load patients.'))
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, tick]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Patients</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every patient who has ever had a report created, with their visit history.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, or patient ID…"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Reports</TableHead>
              <TableHead>Last Visit</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                <TableCell className="font-medium">{p.full_name}</TableCell>
                <TableCell>{p.age} {p.age_unit}</TableCell>
                <TableCell>{p.gender}</TableCell>
                <TableCell>{p.report_count}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.last_visit ? localDate(p.last_visit) : '—'}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => navigate(`/patients/${p.id}`)}
                  >
                    View Profile
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {loading && patients.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Loading patients…
                </TableCell>
              </TableRow>
            )}
            {!loading && patients.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {query ? 'No patients match your search.' : 'No patients yet — create a report to add one.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
