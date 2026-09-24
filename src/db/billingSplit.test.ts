import { describe, it, expect } from 'vitest';
import { splitBilling } from './billingSplit';

describe('splitBilling', () => {
  it('splits discount by price, like 40 on 200 and 10 on 50 for a 50 discount', () => {
    const shares = splitBilling([200, 50], { discount: 50, paid: 200, balance: 0 });
    expect(shares.map((s) => s.discount)).toEqual([40, 10]);
    expect(shares.map((s) => s.net)).toEqual([160, 40]);
    expect(shares.map((s) => s.advance)).toEqual([160, 40]);
  });

  it('always sums exactly to the report totals despite rounding', () => {
    const shares = splitBilling([100, 100, 100], { discount: 10, paid: 100, balance: 190 });
    expect(shares.reduce((a, s) => a + s.discount, 0)).toBe(10);
    expect(shares.reduce((a, s) => a + s.advance, 0)).toBe(100);
    expect(shares.reduce((a, s) => a + s.remaining, 0)).toBe(190);
  });

  it('never shows more advance than the total due when a patient overpays', () => {
    const shares = splitBilling([120], { discount: 0, paid: 121, balance: 0 });
    expect(shares[0].advance).toBe(120);
  });
});
