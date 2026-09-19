import { useMemo } from 'react';
import { X } from 'lucide-react';
import { computeParameterResults, isChildPatient, NOT_DONE, type Gender as LogicGender } from '../../db/resultLogic';
import type { AgeUnit, Gender, TestWithParameters } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface ResultEntryCardProps {
  test: TestWithParameters;
  results: Record<number, string>;
  onResultsChange: (results: Record<number, string>) => void;
  // A parameter id present here means its reference range has been
  // manually overridden for THIS report specifically — every lab
  // calibrates/interprets ranges a little differently, so this lets a tech
  // correct it per-report without touching the shared Test Catalog
  // default. Absent means "still following the live auto-computed range."
  rangeOverrides: Record<number, string>;
  onRangeOverridesChange: (overrides: Record<number, string>) => void;
  // Same idea as rangeOverrides, for the Unit column — a catalog parameter
  // left without a unit (or one that needs a per-report correction, e.g.
  // a qualitative test that genuinely has none) can be set right here.
  unitOverrides: Record<number, string>;
  onUnitOverridesChange: (overrides: Record<number, string>) => void;
  onRemove: () => void;
  patientAge: string;
  patientAgeUnit: AgeUnit;
  patientGender: Gender | null;
  disabled?: boolean;
}

function flagBadgeClass(flag: string): string {
  if (flag === 'CRITICAL') return 'bg-destructive/15 text-destructive';
  if (flag === 'HIGH') return 'bg-warning/15 text-warning';
  if (flag === 'LOW') return 'bg-blue-500/15 text-blue-600';
  return '';
}

function flagLabel(flag: string): string {
  if (flag === 'CRITICAL') return 'CRITICAL';
  if (flag === 'HIGH') return 'H';
  if (flag === 'LOW') return 'L';
  return '';
}

export default function ResultEntryCard({
  test,
  results,
  onResultsChange,
  rangeOverrides,
  onRangeOverridesChange,
  unitOverrides,
  onUnitOverridesChange,
  onRemove,
  patientAge,
  patientAgeUnit,
  patientGender,
  disabled,
}: ResultEntryCardProps) {
  const age = patientAge.trim() === '' ? null : Number(patientAge);
  const isChild = isChildPatient(age, patientAgeUnit);
  const gender = (patientGender as LogicGender | null) ?? null;

  // Live preview using the exact same pure logic the backend uses on save —
  // formula parameters recompute automatically, and flags update as you
  // type. An override, if present, always wins for the displayed range
  // text — but flagging still runs against the catalog's own numeric
  // thresholds regardless (see resultLogic.ts), never the override text.
  const computed = useMemo(() => {
    const inputs = test.parameters.map((p) => ({
      parameter_id: p.id,
      value: results[p.id] ?? '',
      ref_range: rangeOverrides[p.id],
      unit: unitOverrides[p.id],
    }));
    return computeParameterResults(test.parameters, inputs, isChild, gender);
  }, [test.parameters, results, rangeOverrides, unitOverrides, isChild, gender]);
  const computedByParamId = new Map(computed.map((c) => [c.parameter_id, c]));

  const setValue = (parameterId: number, value: string) => {
    onResultsChange({ ...results, [parameterId]: value });
  };

  const setRangeOverride = (parameterId: number, value: string) => {
    onRangeOverridesChange({ ...rangeOverrides, [parameterId]: value });
  };

  const setUnitOverride = (parameterId: number, value: string) => {
    onUnitOverridesChange({ ...unitOverrides, [parameterId]: value });
  };

  const focusNext = (index: number) => {
    const inputs = document.querySelectorAll<HTMLElement>(`[data-test-id="${test.id}"] [data-param-index]`);
    const next = Array.from(inputs).find((el) => Number(el.dataset.paramIndex) === index + 1);
    next?.focus();
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card" data-test-id={test.id}>
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <div>
          <span className="font-semibold text-sm">{test.short_code}</span>
          <span className="text-muted-foreground text-sm"> — {test.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Af {test.price}</span>
          <Button variant="ghost" size="icon" onClick={onRemove} disabled={disabled} title="Remove test">
            <X className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {test.parameters.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">This test has no parameters to record.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground text-xs uppercase tracking-wide bg-muted/20">
              <th className="px-4 py-2 font-medium">Parameter</th>
              <th className="px-4 py-2 font-medium w-40">Result</th>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium">Reference Range</th>
              <th className="px-4 py-2 font-medium w-20">Flag</th>
              <th className="px-4 py-2 font-medium w-20 text-center">N/D</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {test.parameters.map((param, index) => {
              const result = computedByParamId.get(param.id);
              const value = param.input_type === 'FORMULA' ? result?.value ?? '' : results[param.id] ?? '';
              const flag = result?.flag ?? 'NORMAL';
              const isNotDone = value === NOT_DONE;
              const toggleNotDone = (checked: boolean) => setValue(param.id, checked ? NOT_DONE : '');
              return (
                <tr key={param.id}>
                  <td className="px-4 py-2">{param.name}</td>
                  <td className="px-4 py-2">
                    {isNotDone ? (
                      <div className="h-8 flex items-center px-2 rounded bg-muted/60 text-muted-foreground italic text-sm">
                        Not Done
                      </div>
                    ) : param.input_type === 'FORMULA' ? (
                      <div className={cn('h-8 flex items-center px-2 rounded bg-muted/40 font-medium', flagBadgeClass(flag))}>
                        {value || '—'}
                      </div>
                    ) : param.input_type === 'DROPDOWN' ? (
                      <Select value={value} onValueChange={(v) => setValue(param.id, v)} disabled={disabled}>
                        <SelectTrigger className="h-8" data-param-index={index}>
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            let options: string[] = [];
                            try {
                              options = param.dropdown_options ? JSON.parse(param.dropdown_options) : [];
                            } catch {
                              options = [];
                            }
                            return options.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className={cn('h-8', flag !== 'NORMAL' && flagBadgeClass(flag))}
                        type={param.input_type === 'NUMBER' ? 'number' : 'text'}
                        step="any"
                        value={value}
                        data-param-index={index}
                        disabled={disabled}
                        onChange={(e) => setValue(param.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusNext(index);
                          }
                        }}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      className="h-8 text-muted-foreground"
                      value={result?.unit_snapshot ?? ''}
                      placeholder="—"
                      disabled={disabled}
                      title="Pre-filled from the Test Catalog — edit if this report needs a different unit."
                      onChange={(e) => setUnitOverride(param.id, e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      className="h-8 text-muted-foreground"
                      value={result?.ref_range_snapshot ?? ''}
                      placeholder="—"
                      disabled={disabled}
                      title="Every lab calibrates ranges differently — edit this if yours differs. Only affects this report."
                      onChange={(e) => setRangeOverride(param.id, e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {flag !== 'NORMAL' && (
                      <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', flagBadgeClass(flag))}>{flagLabel(flag)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isNotDone}
                      disabled={disabled}
                      onChange={(e) => toggleNotDone(e.target.checked)}
                      title="Mark as Not Done"
                      className="h-4 w-4 accent-primary"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
