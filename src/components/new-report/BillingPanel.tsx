import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  subtotal: number;
  billing: BillingDraft;
  onChange: (b: BillingDraft) => void;
  disabled?: boolean;
}

export default function BillingPanel({ subtotal, billing, onChange, disabled }: BillingPanelProps) {
  const discount = computeDiscountAmount(subtotal, billing);
  const total = Math.max(0, subtotal - discount);
  const paid = Number(billing.paid) || 0;
  // Matches the backend exactly (see reports.ts) — clamped at 0 on
  // overpayment rather than showing a confusing negative balance.
  const balance = Math.max(0, total - paid);
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
