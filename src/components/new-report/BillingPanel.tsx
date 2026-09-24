import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { splitBilling } from '@/db/billingSplit';

export type DiscountMode = 'amount' | 'percent';

export interface BillingDraft {
  discountMode: DiscountMode;
  discountValue: string;
  paid: string;
  paymentMethod: string;
}

export function blankBillingDraft(): BillingDraft {
  return { discountMode: 'amount', discountValue: '', paid: '', paymentMethod: 'Cash' };
}

export function computeDiscountAmount(subtotal: number, billing: BillingDraft): number {
  const raw = Number(billing.discountValue) || 0;
  if (billing.discountMode === 'percent') return Math.min(subtotal, (subtotal * raw) / 100);
  return Math.min(subtotal, raw);
}

interface BillingPanelProps {
  // Every selected test with its Test Catalog price, in report order.
  tests: { id: number; name: string; price: number }[];
  billing: BillingDraft;
  onChange: (b: BillingDraft) => void;
  disabled?: boolean;
}

export default function BillingPanel({ tests, billing, onChange, disabled }: BillingPanelProps) {
  const subtotal = tests.reduce((sum, t) => sum + t.price, 0);
  const discount = computeDiscountAmount(subtotal, billing);
  const total = Math.max(0, subtotal - discount);
  const paid = Number(billing.paid) || 0;
  // Matches the backend exactly (see reports.ts) — clamped at 0 on
  // overpayment rather than showing a confusing negative balance.
  const balance = Math.max(0, total - paid);
  // Same per-test split the printed Sale Report uses, so what reception
  // sees here is exactly what prints.
  const shares = splitBilling(
    tests.map((t) => t.price),
    { discount, paid, balance }
  );
  const fmt = (n: number) => `Af ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <Label>Discount</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                min={0}
                value={billing.discountValue}
                onChange={(e) => onChange({ ...billing, discountValue: e.target.value })}
                disabled={disabled}
              />
              <Select
                value={billing.discountMode}
                onValueChange={(v) => onChange({ ...billing, discountMode: v as DiscountMode })}
                disabled={disabled}
              >
                <SelectTrigger className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">Af</SelectItem>
                  <SelectItem value="percent">%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Paid</Label>
            <Input
              type="number"
              min={0}
              value={billing.paid}
              onChange={(e) => onChange({ ...billing, paid: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select value={billing.paymentMethod} onValueChange={(v) => onChange({ ...billing, paymentMethod: v })} disabled={disabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="Online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {tests.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">Test</th>
                <th className="py-1.5 font-medium text-right">Price</th>
                <th className="py-1.5 font-medium text-right">Discount</th>
                <th className="py-1.5 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-1.5">
                    {t.name}
                    {t.price === 0 && (
                      <span className="ml-2 text-xs text-destructive">No price set — add it in Test Catalog</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">{fmt(shares[i].fee)}</td>
                  <td className="py-1.5 text-right">{shares[i].discount ? `-${fmt(shares[i].discount)}` : '—'}</td>
                  <td className="py-1.5 text-right font-medium">{fmt(shares[i].net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="grid grid-cols-4 gap-4 pt-3 border-t border-border text-sm">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Subtotal</div>
            <div className="font-semibold mt-0.5">{fmt(subtotal)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Discount</div>
            <div className="font-semibold mt-0.5">-{fmt(discount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Total</div>
            <div className="font-bold mt-0.5 text-primary">{fmt(total)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Balance</div>
            <div className={`font-semibold mt-0.5 ${balance > 0 ? 'text-destructive' : 'text-success'}`}>{fmt(balance)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
