import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { toast } from 'sonner';
import { showErrorDialog } from '@/lib/errorDialog';
import { Search, Save, Eye, PrinterCheck, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { computeParameterResults, isChildPatient, type Gender as LogicGender } from '@/db/resultLogic';
import type { TestWithParameters, NewReportInput } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import PatientPanel, { blankPatientDraft, patientToDraft, type PatientDraft } from '@/components/new-report/PatientPanel';
import TestSearchPalette from '@/components/new-report/TestSearchPalette';
import ResultEntryCard from '@/components/new-report/ResultEntryCard';
import BillingPanel, { blankBillingDraft, computeDiscountAmount, type BillingDraft } from '@/components/new-report/BillingPanel';

interface SelectedTest {
  test: TestWithParameters;
  results: Record<number, string>;
  // parameter id -> manually-set reference range text for THIS report only
  // (see resultLogic.ts / ResultEntryCard.tsx) — absent means "still
  // following the live auto-computed range."
  rangeOverrides: Record<number, string>;
  // Same idea, for the Unit column.
  unitOverrides: Record<number, string>;
}

const AUTO_SAVE_INTERVAL_MS = 5000;

export default function NewReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(!!id);
  const [allTests, setAllTests] = useState<TestWithParameters[]>([]);
  const [patient, setPatient] = useState<PatientDraft>(blankPatientDraft());
  const [doctorId, setDoctorId] = useState('');
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [billing, setBilling] = useState<BillingDraft>(blankBillingDraft());
  const [notes, setNotes] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [reportId, setReportId] = useState<number | null>(null);
  const [status, setStatus] = useState<'DRAFT' | 'FINALIZED' | null>(null);
  const [dirty, setDirtyState] = useState(false);
  // useBlocker's check function is called the instant navigate() runs —
  // which, inside handlePreview/handleFinalizeClick, happens immediately
  // after save() calls setDirty(false) in the same async continuation,
  // with no guarantee React has re-rendered (and updated the blocker's
  // captured closure) in between. That gap is exactly why the "Leave
  // without saving?" dialog could pop up right after a save that just
  // succeeded — a real, if inconsistent-looking, race, not a one-off
  // fluke. A ref sidesteps it entirely: refs mutate synchronously, so
  // dirtyRef.current is always correct the instant it's read, regardless
  // of whether a re-render has happened yet.
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingFocusTestId, setPendingFocusTestId] = useState<number | null>(null);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  const canCreate = user?.role === 'ADMIN' || user?.role === 'RECEPTION';
  const canFinalize = user?.role === 'ADMIN' || user?.role === 'TECHNICIAN';
  const isReadOnly = status === 'FINALIZED';
  const isNewUnsaved = !reportId && !id;

  useEffect(() => {
    api.tests
      .list()
      .then(setAllTests)
      .catch((err) => showErrorDialog(err instanceof Error ? err.message : 'Failed to load tests.'));
  }, []);

  // Edit mode: load an existing draft (or a finalized report, read-only) —
  // reached from Reports History so a technician can enter results without
  // needing "New Report" itself in their sidebar.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const report = await api.reports.getById(Number(id));
        if (!report) {
          showErrorDialog('Report not found.');
          navigate('/reports');
          return;
        }
        const reportTests = report.tests || [];
        const fullPatient = await api.patients.get(report.patient_id);
        const testDefs = await Promise.all(reportTests.map((rt) => api.tests.get(rt.test_id)));
        if (cancelled) return;

        setPatient(
          fullPatient
            ? patientToDraft(fullPatient)
            : { id: report.patient_id, full_name: report.patient_name, age: String(report.age ?? ''), age_unit: report.age_unit, gender: report.gender, phone: '', address: '' }
        );
        setDoctorId(report.doctor_id ? String(report.doctor_id) : '');
        setSelectedTests(
          reportTests
            .map((rt, i) => {
              const def = testDefs[i];
              if (!def) return null;
              const results: Record<number, string> = {};
              const rangeOverrides: Record<number, string> = {};
              const unitOverrides: Record<number, string> = {};
              (rt.results || []).forEach((r) => {
                if (r.parameter_id != null) {
                  results[r.parameter_id] = r.value;
                  // Seeds every parameter as "frozen" at whatever range/unit
                  // was last saved (whether that was auto-computed or a
                  // manual override) — reopening a draft should never
                  // silently recompute either out from under a value that
                  // was already shown/printed in a preview.
                  if (r.ref_range_snapshot) rangeOverrides[r.parameter_id] = r.ref_range_snapshot;
                  if (r.unit_snapshot) unitOverrides[r.parameter_id] = r.unit_snapshot;
                }
              });
              return { test: def, results, rangeOverrides, unitOverrides };
            })
            .filter((x): x is SelectedTest => x !== null)
        );
        setBilling({
          discountMode: 'amount',
          discountValue: report.discount ? String(report.discount) : '',
          paid: report.paid ? String(report.paid) : '',
          paymentMethod: report.payment_method || 'Cash',
        });
        setNotes(report.notes || '');
        setPerformedBy(report.performed_by || '');
        setReportId(report.id);
        setStatus(report.status);
      } catch (err) {
        if (!cancelled) {
          showErrorDialog(err instanceof Error ? err.message : 'Failed to load report.');
          navigate('/reports');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const subtotal = selectedTests.reduce((sum, st) => sum + st.test.price, 0);
  const canSave = patient.full_name.trim() !== '' && selectedTests.length > 0 && !isReadOnly;

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };
  const setPatientDirty = markDirty(setPatient);
  const setDoctorIdDirty = markDirty(setDoctorId);
  const setBillingDirty = markDirty(setBilling);
  const setNotesDirty = markDirty(setNotes);
  const setPerformedByDirty = markDirty(setPerformedBy);

  const addTest = (test: TestWithParameters) => {
    if (selectedTests.some((st) => st.test.id === test.id)) return;
    setSelectedTests([...selectedTests, { test, results: {}, rangeOverrides: {}, unitOverrides: {} }]);
    setDirty(true);
    setPendingFocusTestId(test.id);
  };

  useEffect(() => {
    if (pendingFocusTestId == null) return;
    const el = document.querySelector<HTMLElement>(`[data-test-id="${pendingFocusTestId}"] [data-param-index="0"]`);
    el?.focus();
    setPendingFocusTestId(null);
  }, [pendingFocusTestId, selectedTests]);

  const removeTest = (testId: number) => {
    setSelectedTests(selectedTests.filter((st) => st.test.id !== testId));
    setDirty(true);
  };

  const updateTestResults = (testId: number, results: Record<number, string>) => {
    setSelectedTests(selectedTests.map((st) => (st.test.id === testId ? { ...st, results } : st)));
    setDirty(true);
  };

  const updateTestRangeOverrides = (testId: number, rangeOverrides: Record<number, string>) => {
    setSelectedTests(selectedTests.map((st) => (st.test.id === testId ? { ...st, rangeOverrides } : st)));
    setDirty(true);
  };

  const updateTestUnitOverrides = (testId: number, unitOverrides: Record<number, string>) => {
    setSelectedTests(selectedTests.map((st) => (st.test.id === testId ? { ...st, unitOverrides } : st)));
    setDirty(true);
  };

  const buildPayload = useCallback((): NewReportInput => {
    const discount = computeDiscountAmount(subtotal, billing);
    return {
      patient: {
        id: patient.id,
        full_name: patient.full_name.trim(),
        age: patient.age.trim() === '' ? null : Number(patient.age),
        age_unit: patient.age_unit,
        gender: patient.gender,
        phone: patient.phone,
        address: patient.address,
      },
      doctor_id: doctorId ? Number(doctorId) : null,
      discount,
      paid: Number(billing.paid) || 0,
      payment_method: billing.paymentMethod,
      notes,
      performed_by: performedBy,
      tests: selectedTests.map((st) => ({
        test_id: st.test.id,
        results: st.test.parameters.map((p) => ({
          parameter_id: p.id,
          value: st.results[p.id] || '',
          ref_range: st.rangeOverrides[p.id],
          unit: st.unitOverrides[p.id],
        })),
      })),
    };
  }, [patient, doctorId, billing, notes, performedBy, selectedTests, subtotal]);

  // A reentrancy guard distinct from the `saving` state — `saving` is only
  // ever set for NON-silent saves (so the button can show "Saving…"),
  // meaning it does nothing to stop two SILENT auto-saves from overlapping.
  // If a save is ever slow enough to still be in flight when the next
  // 5-second auto-save tick fires, and this report hasn't been assigned a
  // reportId yet (both calls still mid-flight), both would independently
  // call api.reports.create() and silently produce two separate draft
  // reports for the same session. A ref closes this regardless of which
  // caller (auto-save, manual Save Draft, Preview, Finalize) triggers it.
  const savingRef = useRef(false);
  const save = useCallback(
    async (silent: boolean): Promise<{ id: number; status: 'DRAFT' | 'FINALIZED' } | null> => {
      if (!canSave || savingRef.current) return null;
      savingRef.current = true;
      if (!silent) setSaving(true);
      try {
        const payload = buildPayload();
        const result = reportId ? await api.reports.updateDraft(reportId, payload) : await api.reports.create(payload);
        if (!reportId) {
          setReportId(result.id);
          setPatient((p) => ({ ...p, id: result.patient_id }));
        }
        setStatus(result.status);
        setLastSavedAt(new Date());
        setDirty(false);
        return { id: result.id, status: result.status };
      } catch (err) {
        showErrorDialog(err instanceof Error ? err.message : 'Failed to save report.');
        return null;
      } finally {
        savingRef.current = false;
        if (!silent) setSaving(false);
      }
    },
    [canSave, buildPayload, reportId, setDirty]
  );

  // Auto-save every 5 seconds while there's something worth saving.
  useEffect(() => {
    if (isReadOnly) return;
    const interval = setInterval(() => {
      if (dirty && canSave && !saving) save(true);
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dirty, canSave, saving, save, isReadOnly]);

  // Warn before closing the whole app/window with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Warn before navigating to another page in-app with unsaved changes.
  // Reads the ref (see dirtyRef above), not the `dirty` state variable
  // directly — this check fires synchronously the moment navigate() is
  // called, which can be before React has committed a just-completed
  // save's setDirty(false).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname
  );

  const handleSaveDraft = async () => {
    const result = await save(false);
    if (result) toast.success('Draft saved.');
  };

  const handlePreview = async () => {
    const result = await save(false);
    if (result) navigate(`/reports/${result.id}/print`);
  };

  // Same pure logic the result-entry grid itself uses for live preview —
  // checked here against every currently-selected test's computed values so
  // a formula field that can't resolve (a missing dependency) is caught
  // exactly like a manually-blank field would be.
  const getIncompleteResults = (): string[] => {
    const age = patient.age.trim() === '' ? null : Number(patient.age);
    const isChild = isChildPatient(age, patient.age_unit);
    const gender = (patient.gender as LogicGender | null) ?? null;
    const problems: string[] = [];
    for (const st of selectedTests) {
      const inputs = st.test.parameters.map((p) => ({ parameter_id: p.id, value: st.results[p.id] ?? '' }));
      const computed = computeParameterResults(st.test.parameters, inputs, isChild, gender);
      for (const c of computed) {
        if (!c.value || !c.value.trim()) {
          problems.push(`${st.test.name} → ${c.parameter_name_snapshot}`);
        }
      }
    }
    return problems;
  };

  const handleFinalizeClick = () => {
    if (!canFinalize) {
      showErrorDialog('Only an admin or technician can finalize a report.');
      return;
    }
    const incomplete = getIncompleteResults();
    if (incomplete.length > 0) {
      const shown = incomplete.slice(0, 5).join(', ');
      const more = incomplete.length > 5 ? `, and ${incomplete.length - 5} more` : '';
      showErrorDialog(`Missing results for: ${shown}${more}. Enter a value or mark "Not Done".`);
      return;
    }
    setFinalizeConfirmOpen(true);
  };

  const confirmFinalize = async () => {
    setFinalizeConfirmOpen(false);
    const saved = await save(false);
    if (!saved) return;
    setSaving(true);
    try {
      await api.reports.finalize(saved.id);
      navigate(`/reports/${saved.id}/print?autoprint=1`);
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to finalize report.');
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+K opens the test search palette; Ctrl+S saves the current draft —
  // both re-subscribed every render (cheap, and the alternative is
  // memoizing handleSaveDraft just to satisfy a dependency array) so
  // neither ever fires against stale state.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isReadOnly && canSave && !saving) handleSaveDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading report…</div>;
  }

  if (isNewUnsaved && !canCreate) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Only reception or an admin can create a new report.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{id ? 'Edit Report' : 'New Report'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isReadOnly ? 'This report is finalized and locked.' : 'Saves as a draft automatically — nothing is locked until you finalize it.'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          ) : lastSavedAt ? (
            <span className="flex items-center gap-1 text-success">
              <Check className="h-3 w-3" /> Saved {lastSavedAt.toLocaleTimeString()}
            </span>
          ) : dirty ? (
            <span>Unsaved changes</span>
          ) : null}
        </div>
      </div>

      <PatientPanel
        patient={patient}
        onPatientChange={setPatientDirty}
        doctorId={doctorId}
        onDoctorIdChange={setDoctorIdDirty}
        performedBy={performedBy}
        onPerformedByChange={setPerformedByDirty}
        disabled={isReadOnly}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tests</h2>
          {!isReadOnly && (
            <Button variant="outline" onClick={() => setPaletteOpen(true)}>
              <Search className="h-4 w-4" />
              Add Test
              <kbd className="ml-2 text-[10px] border border-border rounded px-1.5 py-0.5 text-muted-foreground">Ctrl+K</kbd>
            </Button>
          )}
        </div>

        {selectedTests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedTests.map((st) => (
              <Badge key={st.test.id} variant="secondary" className="gap-1.5 pr-1">
                {st.test.short_code}
                {!isReadOnly && (
                  <button onClick={() => removeTest(st.test.id)} className="hover:text-destructive ml-1">
                    ×
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {selectedTests.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            No tests added yet. Press <kbd className="border border-border rounded px-1.5 py-0.5">Ctrl+K</kbd> to search.
          </div>
        ) : (
          <div className="space-y-4">
            {selectedTests.map((st) => (
              <ResultEntryCard
                key={st.test.id}
                test={st.test}
                results={st.results}
                onResultsChange={(r) => updateTestResults(st.test.id, r)}
                rangeOverrides={st.rangeOverrides}
                onRangeOverridesChange={(r) => updateTestRangeOverrides(st.test.id, r)}
                unitOverrides={st.unitOverrides}
                onUnitOverridesChange={(r) => updateTestUnitOverrides(st.test.id, r)}
                onRemove={() => removeTest(st.test.id)}
                patientAge={patient.age}
                patientAgeUnit={patient.age_unit}
                patientGender={patient.gender}
                disabled={isReadOnly}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Report Notes (printed on the report, below the test results)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotesDirty(e.target.value)}
          disabled={isReadOnly}
          placeholder="e.g. sample slightly hemolyzed, clinical correlation advised…"
          rows={3}
        />
      </div>

      <BillingPanel subtotal={subtotal} billing={billing} onChange={setBillingDirty} disabled={isReadOnly} />

      {!isReadOnly && (
        <div className="sticky bottom-0 -mx-8 bg-background border-t border-border px-8 py-4 flex items-center justify-end gap-3 no-print">
          <Button variant="outline" onClick={handleSaveDraft} disabled={!canSave || saving}>
            <Save className="h-4 w-4" />
            Save Draft
          </Button>
          <Button variant="outline" onClick={handlePreview} disabled={!canSave || saving}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button onClick={handleFinalizeClick} disabled={!canSave || saving || !canFinalize} title={!canFinalize ? 'Only an admin or technician can finalize' : undefined}>
            <PrinterCheck className="h-4 w-4" />
            Finalize & Print
          </Button>
        </div>
      )}

      <TestSearchPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        tests={allTests}
        alreadyAddedIds={new Set(selectedTests.map((st) => st.test.id))}
        onSelect={addTest}
      />

      <AlertDialog open={finalizeConfirmOpen} onOpenChange={setFinalizeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this report?</AlertDialogTitle>
            <AlertDialogDescription>After finalizing, this report cannot be edited or deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFinalize}>Finalize & Print</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes on this report. If you leave now, they'll be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
