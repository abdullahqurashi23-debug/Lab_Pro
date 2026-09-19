import { describe, it, expect } from 'vitest';
import {
  resolveRefRange,
  computeFlag,
  computeParameterResults,
  isChildPatient,
  NOT_DONE,
  type RefRangeParameter,
} from './resultLogic';

function makeParam(overrides: Partial<RefRangeParameter> = {}): RefRangeParameter {
  return {
    id: 1,
    name: 'Test Param',
    code: 'TP',
    unit: 'mg/dL',
    input_type: 'NUMBER',
    formula: '',
    ref_male_low: null,
    ref_male_high: null,
    ref_female_low: null,
    ref_female_high: null,
    ref_child_low: null,
    ref_child_high: null,
    ref_text: '',
    critical_low: null,
    critical_high: null,
    decimals: 2,
    ...overrides,
  };
}

describe('isChildPatient', () => {
  it('treats age recorded in Months or Days as a child regardless of the number', () => {
    expect(isChildPatient(200, 'Months')).toBe(true);
    expect(isChildPatient(5, 'Days')).toBe(true);
  });
  it('treats Years age under 18 as a child, 18+ as an adult', () => {
    expect(isChildPatient(17, 'Years')).toBe(true);
    expect(isChildPatient(18, 'Years')).toBe(false);
    expect(isChildPatient(45, 'Years')).toBe(false);
  });
  it('treats a null/unknown age as not a child', () => {
    expect(isChildPatient(null, 'Years')).toBe(false);
  });
});

describe('resolveRefRange — selection by age and gender', () => {
  const param = makeParam({
    ref_male_low: 13.5,
    ref_male_high: 17.5,
    ref_female_low: 12.0,
    ref_female_high: 15.5,
    ref_child_low: 11.0,
    ref_child_high: 14.0,
    ref_text: 'See lab notes',
  });

  it('uses the child range for a child, regardless of gender', () => {
    const range = resolveRefRange(param, true, 'Male');
    expect(range).toEqual({ low: 11.0, high: 14.0, text: '11 - 14 mg/dL' });
  });

  it('uses the male range for an adult male', () => {
    const range = resolveRefRange(param, false, 'Male');
    expect(range).toEqual({ low: 13.5, high: 17.5, text: '13.5 - 17.5 mg/dL' });
  });

  it('uses the female range for an adult female', () => {
    const range = resolveRefRange(param, false, 'Female');
    expect(range).toEqual({ low: 12.0, high: 15.5, text: '12 - 15.5 mg/dL' });
  });

  it('falls back to ref_text when gender is Other/unset and there is no child range applicable', () => {
    const range = resolveRefRange(param, false, 'Other');
    expect(range).toEqual({ low: null, high: null, text: 'See lab notes' });
    const rangeNull = resolveRefRange(param, false, null);
    expect(rangeNull).toEqual({ low: null, high: null, text: 'See lab notes' });
  });

  it('falls back to a fully blank range when nothing at all is configured', () => {
    const blank = makeParam();
    expect(resolveRefRange(blank, false, 'Male')).toEqual({ low: null, high: null, text: '' });
  });

  it('formats a one-sided range (only a low or only a high bound) correctly', () => {
    const onlyLow = makeParam({ ref_male_low: 5, unit: 'U/L' });
    expect(resolveRefRange(onlyLow, false, 'Male').text).toBe('> 5 U/L');
    const onlyHigh = makeParam({ ref_male_high: 40, unit: 'U/L' });
    expect(resolveRefRange(onlyHigh, false, 'Male').text).toBe('< 40 U/L');
  });
});

describe('computeFlag — H/L/CRITICAL', () => {
  const param = makeParam({ critical_low: 2, critical_high: 20 });
  const range = { low: 5, high: 10 };

  it('flags NORMAL when the value is within range', () => {
    expect(computeFlag('7', param, range)).toBe('NORMAL');
  });
  it('flags LOW when below the range low but above critical_low', () => {
    expect(computeFlag('3', param, range)).toBe('LOW');
  });
  it('flags HIGH when above the range high but below critical_high', () => {
    expect(computeFlag('12', param, range)).toBe('HIGH');
  });
  it('flags CRITICAL when at/below critical_low, even though that is also below range.low', () => {
    expect(computeFlag('2', param, range)).toBe('CRITICAL');
    expect(computeFlag('1', param, range)).toBe('CRITICAL');
  });
  it('flags CRITICAL when at/above critical_high', () => {
    expect(computeFlag('20', param, range)).toBe('CRITICAL');
    expect(computeFlag('25', param, range)).toBe('CRITICAL');
  });
  it('never flags TEXT or DROPDOWN parameters, regardless of value', () => {
    const textParam = makeParam({ input_type: 'TEXT', critical_low: 2, critical_high: 20 });
    expect(computeFlag('1', textParam, range)).toBe('NORMAL');
    const dropdownParam = makeParam({ input_type: 'DROPDOWN' });
    expect(computeFlag('Positive', dropdownParam, range)).toBe('NORMAL');
  });
  it('flags NORMAL for a non-numeric value (e.g. "Not Done") rather than crashing', () => {
    expect(computeFlag(NOT_DONE, param, range)).toBe('NORMAL');
    expect(computeFlag('', param, range)).toBe('NORMAL');
  });
});

describe('computeParameterResults — formula calculation + integration', () => {
  it('computes a FORMULA parameter from its sibling values by code (case-insensitive)', () => {
    const tc = makeParam({ id: 1, code: 'TC', name: 'Total Cholesterol', input_type: 'NUMBER' });
    const hdl = makeParam({ id: 2, code: 'HDL', name: 'HDL', input_type: 'NUMBER' });
    const tg = makeParam({ id: 3, code: 'TG', name: 'Triglycerides', input_type: 'NUMBER' });
    const ldl = makeParam({ id: 4, code: 'LDL', name: 'LDL', input_type: 'FORMULA', formula: 'tc - hdl - tg / 5', decimals: 1 });

    const results = computeParameterResults(
      [tc, hdl, tg, ldl],
      [
        { parameter_id: 1, value: '200' },
        { parameter_id: 2, value: '50' },
        { parameter_id: 3, value: '150' },
      ],
      false,
      'Male'
    );

    const ldlResult = results.find((r) => r.parameter_id === 4);
    expect(ldlResult?.value).toBe((200 - 50 - 150 / 5).toFixed(1));
  });

  it('leaves a FORMULA result blank when a dependency is missing, instead of throwing', () => {
    const tc = makeParam({ id: 1, code: 'TC' });
    const ldl = makeParam({ id: 2, code: 'LDL', input_type: 'FORMULA', formula: 'tc - 10' });
    const results = computeParameterResults([tc, ldl], [], false, 'Male');
    expect(results.find((r) => r.parameter_id === 2)?.value).toBe('');
  });

  it('honors an explicit "Not Done" override on a FORMULA parameter, skipping evaluation', () => {
    const tc = makeParam({ id: 1, code: 'TC' });
    const ldl = makeParam({ id: 2, code: 'LDL', input_type: 'FORMULA', formula: 'tc - 10' });
    const results = computeParameterResults(
      [tc, ldl],
      [
        { parameter_id: 1, value: '200' },
        { parameter_id: 2, value: NOT_DONE },
      ],
      false,
      'Male'
    );
    expect(results.find((r) => r.parameter_id === 2)?.value).toBe(NOT_DONE);
  });

  it('applies a per-report ref_range override to the displayed text without changing the flag', () => {
    const param = makeParam({ id: 1, critical_high: 10 });
    const results = computeParameterResults(
      [param],
      [{ parameter_id: 1, value: '11', ref_range: 'custom lab range 0-9' }],
      false,
      'Male'
    );
    const r = results[0];
    expect(r.ref_range_snapshot).toBe('custom lab range 0-9');
    expect(r.flag).toBe('CRITICAL'); // still driven by critical_high, not the override text
  });

  it('falls back to the catalog-computed range when no override is given', () => {
    const param = makeParam({ id: 1, ref_male_low: 1, ref_male_high: 9 });
    const results = computeParameterResults([param], [{ parameter_id: 1, value: '5' }], false, 'Male');
    expect(results[0].ref_range_snapshot).toBe('1 - 9 mg/dL');
  });

  it('clearing a ref_range override back to empty falls back to the catalog range, not blank', () => {
    const param = makeParam({ id: 1, ref_male_low: 1, ref_male_high: 9, critical_high: 20 });
    const results = computeParameterResults(
      [param],
      [{ parameter_id: 1, value: '5', ref_range: '' }],
      false,
      'Male'
    );
    const r = results[0];
    expect(r.ref_range_snapshot).toBe('1 - 9 mg/dL');
    expect(r.flag).toBe('NORMAL');
  });

  it('falls back to the catalog-configured unit when no override is given', () => {
    const param = makeParam({ id: 1, unit: 'g/dL' });
    const results = computeParameterResults([param], [{ parameter_id: 1, value: '5' }], false, 'Male');
    expect(results[0].unit_snapshot).toBe('g/dL');
  });

  it('applies a per-report unit override, same as ref_range', () => {
    const param = makeParam({ id: 1, unit: 'g/dL' });
    const results = computeParameterResults(
      [param],
      [{ parameter_id: 1, value: '5', unit: 'mmol/L' }],
      false,
      'Male'
    );
    expect(results[0].unit_snapshot).toBe('mmol/L');
  });

  it('clearing a unit override back to empty falls back to the catalog unit, not blank', () => {
    const param = makeParam({ id: 1, unit: 'mg/dL', input_type: 'TEXT', ref_text: 'Negative' });
    const results = computeParameterResults(
      [param],
      [{ parameter_id: 1, value: 'Negative', unit: '' }],
      false,
      'Male'
    );
    expect(results[0].unit_snapshot).toBe('mg/dL');
  });
});
