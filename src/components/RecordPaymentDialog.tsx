import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: number;
  reportNo: string;
  balanceDue: number;
  onRecorded: () => void;
}

// A payment is its own ledger entry (see payments.ts / 005_payments.sql) —
// specifically so collecting money against a report that's already
// finalized never has to touch that locked row. Used both from the Revenue
// page's outstanding-balances list and from a single report's own print/
// view screen.
export default function RecordPaymentDialog({ open, onOpenChange, reportId, reportNo, balanceDue, onRecorded }: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState(() => String(balanceDue > 0 ? balanceDue : ''));
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setAmount(String(balanceDue > 0 ? balanceDue : ''));
    setMethod('Cash');
    setNotes('');
  };

  // The dialog stays mounted while the caller just swaps which report it's
  // pointed at (e.g. clicking "Record Payment" on a different outstanding-
  // balance row) — re-seed the amount field whenever it opens for a
  // (possibly new) reportId/balanceDue rather than only on first mount.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportId, balanceDue]);

  const submit = async () => {
    const n = Number(amount);
    if (!n || n <= 0) {
      showErrorDialog('Enter an amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await api.payments.record(reportId, { amount: n, method, notes });
      toast.success(`Payment of Af ${n.toLocaleString()} recorded for ${reportNo}.`);
      onOpenChange(false);
      reset();
      onRecorded();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment — {reportNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Balance due: <span className="font-semibold text-foreground">Af {balanceDue.toLocaleString()}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash, card, transfer…" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Recording…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
