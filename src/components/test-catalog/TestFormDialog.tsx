import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { TestCategory, TestWithParameters } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ParameterEditor, { draftToParamInput, paramToDraft, type ParamDraft } from './ParameterEditor';

interface TestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TestWithParameters | null;
  categories: TestCategory[];
  onSaved: () => void;
}

interface FormState {
  name: string;
  short_code: string;
  category_id: string; // '' = none, else stringified id
  price: string;
  sample_type: string;
  report_notes: string;
}

function blankForm(): FormState {
  return { name: '', short_code: '', category_id: '', price: '0', sample_type: '', report_notes: '' };
}

export default function TestFormDialog({ open, onOpenChange, editing, categories, onSaved }: TestFormDialogProps) {
  const [form, setForm] = useState<FormState>(blankForm());
  const [parameters, setParameters] = useState<ParamDraft[]>([]);
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameError('');
    setCodeError('');
    setGeneralError('');
    if (editing) {
      setForm({
        name: editing.name,
        short_code: editing.short_code,
        category_id: editing.category_id ? String(editing.category_id) : '',
        price: String(editing.price),
        sample_type: editing.sample_type,
        report_notes: editing.report_notes,
      });
      setParameters(editing.parameters.map(paramToDraft));
    } else {
      setForm(blankForm());
      setParameters([]);
    }
  }, [open, editing]);

  const save = async () => {
    setNameError('');
    setCodeError('');
    setGeneralError('');

    if (!form.name.trim()) {
      setNameError('Test name is required.');
      return;
    }
    if (!form.short_code.trim()) {
      setCodeError('Short code is required.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      short_code: form.short_code.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      price: Number(form.price) || 0,
      sample_type: form.sample_type.trim(),
      report_notes: form.report_notes.trim(),
      parameters: parameters.map(draftToParamInput),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.tests.update(editing.id, payload);
        toast.success('Test updated.');
      } else {
        await api.tests.create(payload);
        toast.success('Test created.');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save test.';
      // Route known duplicate errors to the specific field they're about,
      // per "clear inline error" — not just a toast.
      if (/name/i.test(message) && /already exists/i.test(message)) {
        setNameError(message);
      } else if (/short code/i.test(message) && /already used/i.test(message)) {
        setCodeError(message);
      } else {
        setGeneralError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Test' : 'Add New Test'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Test Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Short Code</Label>
              <Input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} placeholder="e.g. CBC" />
              {codeError && <p className="text-xs text-destructive">{codeError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category_id || '__none__'}
                onValueChange={(v) => setForm({ ...form, category_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— None —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Price</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Sample Type</Label>
              <Input value={form.sample_type} onChange={(e) => setForm({ ...form, sample_type: e.target.value })} placeholder="e.g. Serum" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Report Notes (optional, shown on printed report)</Label>
              <Textarea value={form.report_notes} onChange={(e) => setForm({ ...form, report_notes: e.target.value })} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Parameters</Label>
            <ParameterEditor parameters={parameters} onChange={setParameters} />
          </div>

          {generalError && <p className="text-sm text-destructive">{generalError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Test'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
