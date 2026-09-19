import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, X, Plus, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AgeUnit, Doctor, Gender, Patient } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface PatientDraft {
  id?: number;
  // Display-only (never sent back to the server) — lets the "editing an
  // existing patient" header show something more useful than a bare id.
  patient_code?: string;
  full_name: string;
  age: string;
  age_unit: AgeUnit;
  gender: Gender | null;
  phone: string;
  address: string;
}

export function blankPatientDraft(): PatientDraft {
  return { full_name: '', age: '', age_unit: 'Years', gender: null, phone: '', address: '' };
}

export function patientToDraft(p: Patient): PatientDraft {
  return {
    id: p.id,
    patient_code: p.patient_code,
    full_name: p.full_name,
    age: p.age == null ? '' : String(p.age),
    age_unit: p.age_unit,
    gender: p.gender,
    phone: p.phone,
    address: p.address,
  };
}

interface PatientPanelProps {
  patient: PatientDraft;
  onPatientChange: (p: PatientDraft) => void;
  doctorId: string;
  onDoctorIdChange: (id: string) => void;
  disabled?: boolean;
}

export default function PatientPanel({ patient, onPatientChange, doctorId, onDoctorIdChange, disabled }: PatientPanelProps) {
  // Only two real modes now: searching for/starting a patient, or editing
  // one (whether it's an existing patient pulled up from search/a draft, or
  // a brand-new one being typed in for the first time) — both show the
  // exact same editable fields. There used to be a third "selected" mode
  // that showed a locked read-only summary card with no way to fix a typo
  // in the name/age/gender/etc. without going back to search and starting
  // over, which made editing an existing draft report effectively
  // impossible to correct. Only a genuinely finalized (locked) report
  // disables these fields now, via the `disabled` prop.
  const [mode, setMode] = useState<'search' | 'editing'>(patient.id ? 'editing' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorDialogOpen, setDoctorDialogOpen] = useState(false);
  const [newDoctor, setNewDoctor] = useState({ name: '', clinic: '', phone: '' });
  const [duplicate, setDuplicate] = useState<Patient | null>(null);
  const { user } = useAuth();
  const canAddDoctor = user?.role === 'ADMIN' || user?.role === 'RECEPTION';

  const refreshDoctors = () =>
    api.doctors
      .list()
      .then(setDoctors)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load doctors.'));
  useEffect(() => {
    refreshDoctors();
  }, []);

  // Only meaningful while entering a BRAND-NEW patient (no id yet) — matching
  // by name alone would flag every "John Smith", so this only fires once
  // both name and phone are filled in, which is a much stronger duplicate
  // signal. Never runs while editing an already-resolved existing patient.
  useEffect(() => {
    if (mode !== 'editing' || patient.id) {
      setDuplicate(null);
      return;
    }
    const name = patient.full_name.trim();
    const phone = patient.phone.trim();
    if (!name || !phone) {
      setDuplicate(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.patients
        .findDuplicate(name, phone)
        .then((match) => {
          if (!cancelled) setDuplicate(match);
        })
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, patient.id, patient.full_name, patient.phone]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.patients
        .search(q)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'Patient search failed.'));
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectPatient = (p: Patient) => {
    onPatientChange(patientToDraft(p));
    setMode('editing');
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const startNewPatient = () => {
    onPatientChange(blankPatientDraft());
    setMode('editing');
    setQuery('');
    setOpen(false);
  };

  const changePatient = () => {
    onPatientChange(blankPatientDraft());
    setMode('search');
  };

  const createDoctor = async () => {
    if (!newDoctor.name.trim()) return;
    try {
      const created = await api.doctors.create(newDoctor);
      setNewDoctor({ name: '', clinic: '', phone: '' });
      setDoctorDialogOpen(false);
      await refreshDoctors();
      onDoctorIdChange(String(created.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add doctor.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'search' ? (
          <div ref={containerRef} className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search patients by name, phone, or patient code…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setOpen(true)}
                  autoFocus
                />
              </div>
              <Button variant="outline" onClick={startNewPatient}>
                <UserPlus className="h-4 w-4" />
                New Patient
              </Button>
            </div>
            {open && results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto text-sm">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPatient(p)}
                    className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between"
                  >
                    <span>
                      <span className="font-medium">{p.full_name}</span>
                      <span className="text-muted-foreground"> ({p.patient_code})</span>
                    </span>
                    <span className="text-muted-foreground">
                      {p.age} {p.age_unit}, {p.gender} {p.phone && `• ${p.phone}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {patient.id ? `Editing ${patient.patient_code || 'existing patient'}` : 'New Patient'}
              </span>
              <Button variant="ghost" size="sm" onClick={changePatient} disabled={disabled}>
                <X className="h-4 w-4" />
                Change Patient
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Patient Name</Label>
                <Input
                  value={patient.full_name}
                  onChange={(e) => onPatientChange({ ...patient, full_name: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Age</Label>
                <Input
                  type="number"
                  min={0}
                  value={patient.age}
                  onChange={(e) => onPatientChange({ ...patient, age: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Age Unit</Label>
                <Select value={patient.age_unit} onValueChange={(v) => onPatientChange({ ...patient, age_unit: v as AgeUnit })} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Years">Years</SelectItem>
                    <SelectItem value="Months">Months</SelectItem>
                    <SelectItem value="Days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={patient.gender || ''} onValueChange={(v) => onPatientChange({ ...patient, gender: v as Gender })} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={patient.phone} onChange={(e) => onPatientChange({ ...patient, phone: e.target.value })} disabled={disabled} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Address</Label>
                <Input value={patient.address} onChange={(e) => onPatientChange({ ...patient, address: e.target.value })} disabled={disabled} />
              </div>
            </div>
          </>
        )}

        {mode === 'editing' && !patient.id && duplicate && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-foreground">Possible duplicate patient</div>
              <div className="text-muted-foreground mt-0.5">
                {duplicate.full_name} ({duplicate.patient_code}) — {duplicate.age ?? '—'} {duplicate.age_unit},{' '}
                {duplicate.gender || '—'} — already has this exact name and phone number on file.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => selectPatient(duplicate)} disabled={disabled}>
              Use This Patient Instead
            </Button>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 pt-2 border-t border-border">
          <div className="col-span-3 space-y-1.5">
            <Label>Referring Doctor</Label>
            <Select value={doctorId || '__none__'} onValueChange={(v) => onDoctorIdChange(v === '__none__' ? '' : v)} disabled={disabled}>
              <SelectTrigger>
                <SelectValue placeholder="— None —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                    {d.clinic ? ` (${d.clinic})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canAddDoctor && (
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => setDoctorDialogOpen(true)} disabled={disabled}>
                <Plus className="h-4 w-4" />
                New Doctor
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={doctorDialogOpen} onOpenChange={setDoctorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Referring Doctor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newDoctor.name} onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Clinic (optional)</Label>
              <Input value={newDoctor.clinic} onChange={(e) => setNewDoctor({ ...newDoctor, clinic: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={newDoctor.phone} onChange={(e) => setNewDoctor({ ...newDoctor, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoctorDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createDoctor}>Add Doctor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
