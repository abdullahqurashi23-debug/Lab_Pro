import { describe, it, expect } from 'vitest';
import { evaluateFormula, slugifyParamName } from './formula';

describe('evaluateFormula', () => {
  it('computes the LDL example from the original spec: LDL = TC - HDL - TG/5', () => {
    const result = evaluateFormula('tc - hdl - tg / 5', { tc: 200, hdl: 50, tg: 150 });
    expect(result).toBe(200 - 50 - 150 / 5);
  });

  it('respects standard operator precedence (* and / before + and -)', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
  });

  it('handles unary minus and nested parentheses', () => {
    expect(evaluateFormula('-5 + 10', {})).toBe(5);
    expect(evaluateFormula('-(3 + 2)', {})).toBe(-5);
    expect(evaluateFormula('((1 + 2) * (3 + 4))', {})).toBe(21);
  });

  it('resolves variable names case-insensitively', () => {
    expect(evaluateFormula('TC - HDL', { tc: 100, hdl: 40 })).toBe(60);
    expect(evaluateFormula('tc - hdl', { TC: 100, HDL: 40 } as unknown as Record<string, number>)).toBe(60);
  });

  it('throws on division by zero rather than returning Infinity/NaN', () => {
    expect(() => evaluateFormula('10 / 0', {})).toThrow(/division by zero/i);
  });

  it('throws a clear error for an unknown variable, instead of silently producing NaN', () => {
    expect(() => evaluateFormula('unknown_param + 1', { known: 1 })).toThrow(/unknown parameter/i);
  });

  it('rejects malformed expressions instead of guessing', () => {
    expect(() => evaluateFormula('1 + + 2', {})).toThrow();
    expect(() => evaluateFormula('(1 + 2', {})).toThrow();
    expect(() => evaluateFormula('', {})).toThrow();
  });

  // The whole point of a hand-written parser instead of eval()/Function()
  // is that formula text can never execute arbitrary JavaScript — a
  // formula is stored in the database and editable from the Settings UI,
  // so this is a real security boundary, not just a correctness detail.
  it('never executes arbitrary JavaScript — non-arithmetic syntax is rejected, not run', () => {
    expect(() => evaluateFormula('require("fs")', {})).toThrow();
    expect(() => evaluateFormula('process.exit()', {})).toThrow();
    expect(() => evaluateFormula('[1,2,3]', {})).toThrow();
    expect(() => evaluateFormula('1; console.log(1)', {})).toThrow();
  });
});

describe('slugifyParamName', () => {
  it('turns a human parameter name into a formula-safe identifier', () => {
    expect(slugifyParamName('Total Cholesterol')).toBe('total_cholesterol');
    expect(slugifyParamName('HDL')).toBe('hdl');
    expect(slugifyParamName('  Trim Me  ')).toBe('trim_me');
    expect(slugifyParamName('A/B % Ratio!')).toBe('a_b_ratio');
  });
});
