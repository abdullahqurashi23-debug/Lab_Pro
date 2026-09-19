// Pure result-computation logic: reference-range resolution, H/L/CRITICAL
// flagging, and formula evaluation. Zero Node/Electron/database
// dependencies on purpose — the main process (repositories/reports.ts)
// uses this as the authoritative source of truth when saving, and the
// renderer (New Report page) imports this exact same module for live
// preview while typing, so what you see while entering a result and what
// actually gets saved can never drift apart.

import { evaluateFormula, slugifyParamName } from './formula';

export type Gender = 'Male' | 'Female' | 'Other';
export type ResultFlag = 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL';

// The literal value stored for a parameter a technician explicitly marked
// as not performed (broken reagent, insufficient sample, etc.) — this is a
// real, valid result, distinct from "field left blank by mistake", which
// finalize-time validation must reject. Stored as a plain literal in
// report_results.value (a free-text column) rather than a boolean/flag,
// since it needs no schema change and prints correctly with zero special
// casing (computeFlag already returns NORMAL for any non-numeric value).
export const NOT_DONE = 'Not Done';

// Structurally matches both src/db/repositories/types.ts's TestParameter
// (main process) and src/lib/types.ts's TestParameter (renderer) — either
// can be passed in directly.
export interface RefRangeParameter {
  id: number;
  name: string;
  code: string;
  unit: string;
  input_type: string;
  formula: string;
  ref_male_low: number | null;
  ref_male_high: number | null;
  ref_female_low: number | null;
  ref_female_high: number | null;
  ref_child_low: number | null;
  ref_child_high: number | null;
  ref_text: string;
  critical_low: number | null;
  critical_high: number | null;
  decimals: number;
}

export function isChildPatient(age: number | null, ageUnit: 'Years' | 'Months' | 'Days'): boolean {
  if (age == null) return false;
  if (ageUnit !== 'Years') return true;
  return age < 18;
}

export function formatRange(low: number | null, high: number | null, unit: string): string {
  const u = unit ? ` ${unit}` : '';
  if (low != null && high != null) return `${low} - ${high}${u}`;
  if (low != null) return `> ${low}${u}`;
  if (high != null) return `< ${high}${u}`;
  return '';
}

export function resolveRefRange(
  param: RefRangeParameter,
  isChild: boolean,
  gender: Gender | null
): { low: number | null; high: number | null; text: string } {
  if (isChild && (param.ref_child_low != null || param.ref_child_high != null)) {
    return { low: param.ref_child_low, high: param.ref_child_high, text: formatRange(param.ref_child_low, param.ref_child_high, param.unit) };
  }
  if (gender === 'Male' && (param.ref_male_low != null || param.ref_male_high != null)) {
    return { low: param.ref_male_low, high: param.ref_male_high, text: formatRange(param.ref_male_low, param.ref_male_high, param.unit) };
  }
  if (gender === 'Female' && (param.ref_female_low != null || param.ref_female_high != null)) {
    return { low: param.ref_female_low, high: param.ref_female_high, text: formatRange(param.ref_female_low, param.ref_female_high, param.unit) };
  }
  if (param.ref_text) return { low: null, high: null, text: param.ref_text };
  return { low: null, high: null, text: '' };
}

export function computeFlag(
  value: string,
  param: RefRangeParameter,
  range: { low: number | null; high: number | null }
): ResultFlag {
  if (param.input_type === 'TEXT' || param.input_type === 'DROPDOWN') return 'NORMAL';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 'NORMAL';
  if (param.critical_low != null && num <= param.critical_low) return 'CRITICAL';
  if (param.critical_high != null && num >= param.critical_high) return 'CRITICAL';
  if (range.low != null && num < range.low) return 'LOW';
  if (range.high != null && num > range.high) return 'HIGH';
  return 'NORMAL';
}

export interface ComputedResult {
  parameter_id: number;
  parameter_name_snapshot: string;
  unit_snapshot: string;
  ref_range_snapshot: string;
  value: string;
  flag: ResultFlag;
}

// Computes every parameter's result for one test: explicit inputs are taken
// as-is, FORMULA parameters are evaluated from their siblings' values. This
// is what makes FORMULA a real feature rather than a label the UI has to
// fake — the caller never sends a value for a formula parameter, and the
// New Report page calls this same function to show the computed value live.
//
// `ref_range`, when a caller supplies one, overrides the catalog-computed
// reference-range TEXT for that specific result on that specific report —
// every lab calibrates/interprets ranges slightly differently, so this is
// how a tech corrects it per-report without touching the shared Test
// Catalog default. It only ever changes what's DISPLAYED/printed —
// H/L/CRITICAL flagging still runs against the catalog's own numeric
// thresholds (range.low/range.high), never the override text, since a
// free-text override isn't guaranteed to parse as "low - high" and
// flagging needs to stay tied to whatever was actually configured/verified
// as this parameter's real cutoffs.
export function computeParameterResults(
  parameters: RefRangeParameter[],
  inputs: { parameter_id: number; value: string; ref_range?: string; unit?: string }[],
  isChild: boolean,
  gender: Gender | null
): ComputedResult[] {
  const inputByParamId = new Map(inputs.map((i) => [i.parameter_id, i]));
  const variables: Record<string, number> = {};

  for (const param of parameters) {
    if (param.input_type === 'FORMULA') continue;
    const raw = inputByParamId.get(param.id)?.value;
    if (raw == null) continue;
    const num = parseFloat(raw);
    if (Number.isNaN(num)) continue;
    // Formulas reference a parameter's short `code` (e.g. "TC", "HDL") when
    // set — falling back to a slugified name keeps older parameters without
    // a code (from before it existed) working too.
    variables[(param.code || slugifyParamName(param.name)).toLowerCase()] = num;
  }

  return parameters.map((param) => {
    const range = resolveRefRange(param, isChild, gender);
    const input = inputByParamId.get(param.id);
    let value = input?.value ?? '';

    if (param.input_type === 'FORMULA') {
      // A formula parameter is never typed into directly, but it can still
      // be explicitly marked Not Done (e.g. the calculation's inputs exist
      // but the derived test itself was cancelled) — that override always
      // wins over evaluating the formula.
      if (input?.value === NOT_DONE) {
        value = NOT_DONE;
      } else {
        try {
          const result = param.formula ? evaluateFormula(param.formula, variables) : NaN;
          value = Number.isFinite(result) ? result.toFixed(param.decimals ?? 2) : '';
        } catch {
          value = '';
        }
      }
    }

    return {
      parameter_id: param.id,
      parameter_name_snapshot: param.name,
      // A typed override wins over the catalog default; clearing it back to
      // empty falls straight back to the catalog value rather than staying
      // blank — a printed report should always show something here, never
      // an empty box, so there's nothing to "clear back to" but the default.
      unit_snapshot: input?.unit || param.unit,
      ref_range_snapshot: input?.ref_range || range.text,
      value,
      flag: computeFlag(value, param, range),
    };
  });
}
