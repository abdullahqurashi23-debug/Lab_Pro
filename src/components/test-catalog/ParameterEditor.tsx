import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useDragReorder } from '@/lib/useDragReorder';
import type { InputType, NewTestParameter, TestParameter } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// All numeric fields are kept as strings while editing (so an input can be
// legitimately empty instead of forcing 0), and converted on submit.
export interface ParamDraft {
  key: string;
  // Present only for a parameter that already exists in the database —
  // this is what lets the backend update it in place instead of deleting
  // and reinserting (which would break if it has recorded results).
  id?: number;
  name: string;
  code: string;
  unit: string;
  input_type: InputType;
  dropdownOptionsText: string; // comma-separated in the UI
  formula: string;
  ref_male_low: string;
  ref_male_high: string;
  ref_female_low: string;
  ref_female_high: string;
  ref_child_low: string;
  ref_child_high: string;
  ref_text: string;
  critical_low: string;
  critical_high: string;
  decimals: string;
}

let keyCounter = 0;
export function blankParamDraft(): ParamDraft {
  keyCounter += 1;
  return {
    key: `new-${keyCounter}`,
    name: '',
    code: '',
    unit: '',
    input_type: 'NUMBER',
    dropdownOptionsText: '',
    formula: '',
    ref_male_low: '',
    ref_male_high: '',
    ref_female_low: '',
    ref_female_high: '',
    ref_child_low: '',
    ref_child_high: '',
    ref_text: '',
    critical_low: '',
    critical_high: '',
    decimals: '2',
  };
}

export function paramToDraft(p: TestParameter): ParamDraft {
  keyCounter += 1;
  let dropdownOptionsText = '';
  try {
    const parsed = p.dropdown_options ? JSON.parse(p.dropdown_options) : [];
    if (Array.isArray(parsed)) dropdownOptionsText = parsed.join(', ');
  } catch {
    dropdownOptionsText = '';
  }
  const numOrEmpty = (n: number | null) => (n == null ? '' : String(n));
  return {
    key: `existing-${p.id}-${keyCounter}`,
    id: p.id,
    name: p.name,
    code: p.code || '',
    unit: p.unit,
    input_type: p.input_type,
    dropdownOptionsText,
    formula: p.formula,
    ref_male_low: numOrEmpty(p.ref_male_low),
    ref_male_high: numOrEmpty(p.ref_male_high),
    ref_female_low: numOrEmpty(p.ref_female_low),
    ref_female_high: numOrEmpty(p.ref_female_high),
    ref_child_low: numOrEmpty(p.ref_child_low),
    ref_child_high: numOrEmpty(p.ref_child_high),
    ref_text: p.ref_text,
    critical_low: numOrEmpty(p.critical_low),
    critical_high: numOrEmpty(p.critical_high),
    decimals: String(p.decimals ?? 2),
  };
}

export function draftToParamInput(d: ParamDraft): NewTestParameter {
  const n = (s: string): number | null => (s.trim() === '' ? null : Number(s));
  return {
    id: d.id,
    name: d.name.trim(),
    code: d.code.trim(),
    unit: d.unit.trim(),
    input_type: d.input_type,
    dropdown_options: d.dropdownOptionsText.trim()
      ? JSON.stringify(
          d.dropdownOptionsText
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        )
      : '',
    formula: d.formula.trim(),
    ref_male_low: n(d.ref_male_low),
    ref_male_high: n(d.ref_male_high),
    ref_female_low: n(d.ref_female_low),
    ref_female_high: n(d.ref_female_high),
    ref_child_low: n(d.ref_child_low),
    ref_child_high: n(d.ref_child_high),
    ref_text: d.ref_text.trim(),
    critical_low: n(d.critical_low),
    critical_high: n(d.critical_high),
    decimals: d.decimals.trim() === '' ? 2 : Number(d.decimals),
  };
}

const INPUT_TYPES: InputType[] = ['NUMBER', 'TEXT', 'DROPDOWN', 'FORMULA'];

interface ParameterEditorProps {
  parameters: ParamDraft[];
  onChange: (next: ParamDraft[]) => void;
}

export default function ParameterEditor({ parameters, onChange }: ParameterEditorProps) {
  const { dragHandleProps, dragIndex, overIndex } = useDragReorder(parameters, onChange);

  const update = (index: number, patch: Partial<ParamDraft>) => {
    const next = parameters.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(parameters.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...parameters, blankParamDraft()]);
  };

  const numField = (label: string, value: string, onValue: (v: string) => void) => (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input type="number" step="any" className="h-8" value={value} onChange={(e) => onValue(e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-3">
      {parameters.map((p, index) => (
        <div
          key={p.key}
          className={cn(
            'border border-border rounded-lg p-3 space-y-3 bg-background',
            dragIndex === index && 'opacity-50',
            overIndex === index && 'border-primary'
          )}
        >
          <div className="flex items-start gap-2">
            <button
              type="button"
              {...dragHandleProps(index)}
              className="mt-2 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex-1 grid grid-cols-4 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Parameter Name</Label>
                <Input className="h-8" value={p.name} onChange={(e) => update(index, { name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Code (for formulas)</Label>
                <Input
                  className="h-8 uppercase"
                  value={p.code}
                  onChange={(e) => update(index, { code: e.target.value.toUpperCase() })}
                  placeholder="e.g. TC"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Input Type</Label>
                <Select value={p.input_type} onValueChange={(v) => update(index, { input_type: v as InputType })}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INPUT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="mt-5" onClick={() => remove(index)} title="Remove parameter">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2 pl-6">
            <div className="space-y-1">
              <Label className="text-[11px]">Unit</Label>
              <Input className="h-8" value={p.unit} onChange={(e) => update(index, { unit: e.target.value })} />
            </div>
            {numField('Decimals', p.decimals, (v) => update(index, { decimals: v }))}
            {p.input_type === 'DROPDOWN' && (
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Options (comma-separated)</Label>
                <Input
                  className="h-8"
                  value={p.dropdownOptionsText}
                  onChange={(e) => update(index, { dropdownOptionsText: e.target.value })}
                  placeholder="Negative, Positive"
                />
              </div>
            )}
            {p.input_type === 'FORMULA' && (
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Formula (use other parameters' Codes)</Label>
                <Input
                  className="h-8"
                  value={p.formula}
                  onChange={(e) => update(index, { formula: e.target.value })}
                  placeholder="TC - HDL - (TG / 5)"
                />
              </div>
            )}
          </div>

          {(p.input_type === 'TEXT' || p.input_type === 'DROPDOWN') && (
            <div className="pl-6 space-y-1">
              <Label className="text-[11px]">Reference Text (shown as the normal range)</Label>
              <Input className="h-8" value={p.ref_text} onChange={(e) => update(index, { ref_text: e.target.value })} />
            </div>
          )}

          {(p.input_type === 'NUMBER' || p.input_type === 'FORMULA') && (
            <div className="pl-6 space-y-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Male Range</Label>
                  <div className="flex gap-1">
                    <Input type="number" step="any" className="h-8" placeholder="low" value={p.ref_male_low} onChange={(e) => update(index, { ref_male_low: e.target.value })} />
                    <Input type="number" step="any" className="h-8" placeholder="high" value={p.ref_male_high} onChange={(e) => update(index, { ref_male_high: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Female Range</Label>
                  <div className="flex gap-1">
                    <Input type="number" step="any" className="h-8" placeholder="low" value={p.ref_female_low} onChange={(e) => update(index, { ref_female_low: e.target.value })} />
                    <Input type="number" step="any" className="h-8" placeholder="high" value={p.ref_female_high} onChange={(e) => update(index, { ref_female_high: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Child Range</Label>
                  <div className="flex gap-1">
                    <Input type="number" step="any" className="h-8" placeholder="low" value={p.ref_child_low} onChange={(e) => update(index, { ref_child_low: e.target.value })} />
                    <Input type="number" step="any" className="h-8" placeholder="high" value={p.ref_child_high} onChange={(e) => update(index, { ref_child_high: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1">
                  <Label className="text-[11px] text-destructive">Critical Range</Label>
                  <div className="flex gap-1">
                    <Input type="number" step="any" className="h-8" placeholder="low" value={p.critical_low} onChange={(e) => update(index, { critical_low: e.target.value })} />
                    <Input type="number" step="any" className="h-8" placeholder="high" value={p.critical_high} onChange={(e) => update(index, { critical_high: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        Add Parameter
      </Button>
      {parameters.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No parameters yet — a test with no parameters can still be added to a report, but nothing will be
          recorded for it.
        </p>
      )}
    </div>
  );
}
