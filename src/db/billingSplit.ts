// Splits a report's billing across its tests. Discount, paid and balance
// are stored once per report, but the New Report billing panel and the
// printed Sale Report both show them per test. Zero dependencies on purpose
// (same reasoning as printLayout.ts): the renderer and the main process
// must compute identical numbers, so there's one definition, not two.
//
// Each amount is split in proportion to test price and rounded; the last
// test takes the rounding remainder, so the per-test figures always add up
// exactly to the report's own totals.

export interface TestShare {
  fee: number;
  discount: number;
  net: number;
  advance: number;
  remaining: number;
}

export function splitBilling(
  fees: number[],
  report: { discount: number; paid: number; balance: number }
): TestShare[] {
  const subtotal = fees.reduce((a, b) => a + b, 0);
  const total = Math.max(0, subtotal - report.discount);
  // Money collected beyond what's owed isn't income from these tests, so
  // "advance" never exceeds the total due.
  const advanceTotal = Math.min(report.paid, total);
  const left = { discount: report.discount, advance: advanceTotal, remaining: report.balance };

  return fees.map((fee, i) => {
    const last = i === fees.length - 1;
    const share = (amount: number) => (subtotal > 0 ? Math.round((amount * fee) / subtotal) : 0);
    const discount = last ? left.discount : share(report.discount);
    const advance = last ? left.advance : share(advanceTotal);
    const remaining = last ? left.remaining : share(report.balance);
    left.discount -= discount;
    left.advance -= advance;
    left.remaining -= remaining;
    return { fee, discount, net: fee - discount, advance, remaining };
  });
}
