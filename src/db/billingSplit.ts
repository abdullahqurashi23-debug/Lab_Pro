// Splits a report's billing across its tests. Discount, paid and balance
// are stored once per report, but the New Report billing panel and the
// printed Sale Report both show them per test. Zero dependencies on purpose
// (same reasoning as printLayout.ts): the renderer and the main process
// must compute identical numbers, so there's one definition, not two.
//
// Each amount is split in proportion to test price using the largest-
// remainder method: floor everyone's exact share, then hand out the leftover
// whole units (there are always fewer of them than there are tests) to
// whichever shares had the biggest fractional part. That guarantees the
// per-test figures always add up exactly to the report's own totals, same
// as a naive "last test takes the remainder" approach — but unlike that
// approach, no single share can ever go negative or exceed its own test's
// fee: several equal-priced tests each rounding up by exactly half used to
// let the last test's leftover go negative once the others had already
// over-claimed the total.
function distributeProportionally(weights: number[], total: number): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / weightSum) * total);
  const floors = exact.map(Math.floor);
  const remainder = Math.round(total - floors.reduce((a, b) => a + b, 0));
  const byLeftoverFractionDesc = floors
    .map((_, i) => i)
    .sort((a, b) => {
      const diff = exact[b] - floors[b] - (exact[a] - floors[a]);
      // Tie-break toward the later test, matching the old "last test
      // absorbs the remainder" convention for genuinely equal shares (e.g.
      // several identically-priced tests) — the sum and non-negativity
      // guarantees hold regardless of tie-break direction, but this keeps
      // output stable/predictable for the common equal-price case.
      return diff !== 0 ? diff : b - a;
    });
  const shares = [...floors];
  for (let i = 0; i < remainder; i++) {
    shares[byLeftoverFractionDesc[i]] += 1;
  }
  return shares;
}

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
  const total = Math.max(0, fees.reduce((a, b) => a + b, 0) - report.discount);
  // Money collected beyond what's owed isn't income from these tests, so
  // "advance" never exceeds the total due.
  const advanceTotal = Math.min(report.paid, total);

  const discounts = distributeProportionally(fees, report.discount);
  const advances = distributeProportionally(fees, advanceTotal);
  const remainings = distributeProportionally(fees, report.balance);

  return fees.map((fee, i) => ({
    fee,
    discount: discounts[i],
    net: fee - discounts[i],
    advance: advances[i],
    remaining: remainings[i],
  }));
}
