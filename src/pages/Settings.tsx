import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { toFileUrl } from '@/lib/fileUrl';
import { useAuth } from '@/lib/auth-context';
import { useClinic } from '@/lib/clinic-context';
import { Link } from 'react-router-dom';
import type { ClinicSettings, Doctor, Technician, BackupFileInfo, IntegrityCheckResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mergePrintLayout, PAPER_SIZES_MM, type PrintLayout } from '@/db/printLayout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ClinicInfoSection() {
  const { refreshClinicName } = useClinic();
  const [form, setForm] = useState<ClinicSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoadError(null);
    api.settings
      .get()
      .then(setForm)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load clinic settings.'));
  };
  useEffect(load, []);

  if (loadError) {
    return (
      <div className="text-sm text-destructive space-y-2">
        <p>{loadError}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }
  if (!form) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const field = (key: keyof ClinicSettings, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={(form[key] as string) || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  const save = async () => {
    setSaving(true);
    try {
      await api.settings.update(form);
      refreshClinicName();
      toast.success('Clinic information saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (kind: 'logo' | 'header' | 'footer' | 'signature') => {
    const path = await api.settings.pickImage(kind);
    if (!path) return;
    const key =
      kind === 'logo'
        ? 'logo_path'
        : kind === 'header'
        ? 'header_image_path'
        : kind === 'footer'
        ? 'footer_image_path'
        : 'signature_image_path';
    setForm({ ...form, [key]: path });
  };

  const imagePicker = (key: keyof ClinicSettings, kind: 'logo' | 'header' | 'footer' | 'signature', label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex items-center gap-3">
        {form[key] ? (
          <img
            src={toFileUrl(form[key] as string)}
            alt={label}
            className="h-12 w-24 object-contain border border-border rounded bg-secondary/30"
          />
        ) : (
          <div className="h-12 w-24 border border-dashed border-border rounded flex items-center justify-center text-muted-foreground text-xs">
            None
          </div>
        )}
        <Button variant="outline" onClick={() => pickImage(kind)}>
          Choose Image…
        </Button>
        {!!form[key] && (
          <Button variant="ghost" className="text-destructive" onClick={() => setForm({ ...form, [key]: '' })}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {field('clinic_name', 'Clinic Name')}
        {field('phone', 'Phone')}
      </div>
      {field('address', 'Address')}
      <div className="grid grid-cols-2 gap-4">
        {field('pathologist_name', 'Pathologist Name (shown under the signature line on reports)')}
        <div className="space-y-1.5">
          <Label>Report Number Prefix</Label>
          <Input
            value={form.report_number_prefix}
            onChange={(e) => setForm({ ...form, report_number_prefix: e.target.value.toUpperCase() })}
            placeholder="LAB"
            maxLength={20}
          />
          <p className="text-xs text-muted-foreground">
            e.g. "{form.report_number_prefix || 'LAB'}" produces report numbers like {form.report_number_prefix || 'LAB'}
            -{new Date().getFullYear()}-000001. Only affects reports created after changing this.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Header Note (internal reference only — not shown on the printed report)</Label>
        <Textarea value={form.header_note} onChange={(e) => setForm({ ...form, header_note: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Footer Note (internal reference only — not shown on the printed report)</Label>
        <Textarea value={form.footer_note} onChange={(e) => setForm({ ...form, footer_note: e.target.value })} />
      </div>
      {imagePicker('logo_path', 'logo', 'Logo', 'Used elsewhere in the app (e.g. the login screen) — not printed on reports.')}
      {imagePicker(
        'header_image_path',
        'header',
        'PDF Header Banner',
        'Only used for "Save as PDF" — a scan/image of your letterhead header, placed at the very top of the exported file so it looks complete when shared digitally. Never printed on pre-printed paper.'
      )}
      {imagePicker(
        'footer_image_path',
        'footer',
        'PDF Footer Banner',
        'Only used for "Save as PDF" — placed at the very bottom of the exported file.'
      )}
      {imagePicker(
        'signature_image_path',
        'signature',
        'Pathologist Signature',
        'A scan of the pathologist\'s signature, printed above their name on every report — paper and PDF alike.'
      )}
      <div className="space-y-1.5">
        <Label>Report Archive Folder</Label>
        <p className="text-xs text-muted-foreground">
          Every finalized report's permanent PDF copy is saved here, under YYYY/MM-Month subfolders. Leave blank to use
          the default (Documents/LabCore Reports).
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={form.report_archive_folder}
            onChange={(e) => setForm({ ...form, report_archive_folder: e.target.value })}
            placeholder="Documents/LabCore Reports (default)"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const picked = await api.settings.pickFolder();
              if (picked) setForm({ ...form, report_archive_folder: picked });
            }}
          >
            Choose Folder…
          </Button>
        </div>
      </div>
      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save Clinic Info'}
      </Button>
    </div>
  );
}

const BLANK_DOCTOR = { name: '', clinic: '', phone: '' };
const BLANK_TECHNICIAN = { name: '' };

function DoctorsSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState(BLANK_DOCTOR);
  const [pendingDelete, setPendingDelete] = useState<Doctor | null>(null);

  const refresh = () => api.doctors.list().then(setDoctors).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load doctors.'));
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!form.name.trim()) return;
    try {
      await api.doctors.create(form);
      setForm(BLANK_DOCTOR);
      refresh();
      toast.success('Doctor added.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add doctor.');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.doctors.delete(pendingDelete.id);
      toast.success(`${pendingDelete.name} removed.`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove doctor.');
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input
          placeholder="Doctor name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1 min-w-[140px]"
        />
        <Input
          placeholder="Clinic (optional)"
          value={form.clinic}
          onChange={(e) => setForm({ ...form, clinic: e.target.value })}
          className="flex-1 min-w-[140px]"
        />
        <Input
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="flex-1 min-w-[120px]"
        />
        <Button onClick={add}>
          <Plus className="h-4 w-4" />
          Add Doctor
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {doctors.map((d) => (
          <li key={d.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {d.name}
              {(d.clinic || d.phone) && (
                <span className="text-muted-foreground">
                  {' '}
                  — {[d.clinic, d.phone].filter(Boolean).join(', ')}
                </span>
              )}
            </span>
            {isAdmin && (
              <Button variant="link" size="sm" className="h-auto p-0 text-destructive" onClick={() => setPendingDelete(d)}>
                Remove
              </Button>
            )}
          </li>
        ))}
        {doctors.length === 0 && <li className="py-2 text-sm text-muted-foreground">No doctors added yet.</li>}
      </ul>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll no longer be selectable as a referring doctor on new reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TechniciansSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [form, setForm] = useState(BLANK_TECHNICIAN);
  const [pendingDelete, setPendingDelete] = useState<Technician | null>(null);

  const refresh = () =>
    api.technicians.list().then(setTechnicians).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load technicians.'));
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!form.name.trim()) return;
    try {
      await api.technicians.create(form);
      setForm(BLANK_TECHNICIAN);
      refresh();
      toast.success('Technician added.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add technician.');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.technicians.delete(pendingDelete.id);
      toast.success(`${pendingDelete.name} removed.`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove technician.');
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input
          placeholder="Technician name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1 min-w-[140px]"
        />
        <Button onClick={add}>
          <Plus className="h-4 w-4" />
          Add Technician
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {technicians.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2 text-sm">
            <span>{t.name}</span>
            {isAdmin && (
              <Button variant="link" size="sm" className="h-auto p-0 text-destructive" onClick={() => setPendingDelete(t)}>
                Remove
              </Button>
            )}
          </li>
        ))}
        {technicians.length === 0 && <li className="py-2 text-sm text-muted-foreground">No technicians added yet.</li>}
      </ul>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>They'll no longer be selectable in the "Performed By" field on new reports.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next.length < 4) {
      toast.error('New password must be at least 4 characters.');
      return;
    }
    if (next !== confirm) {
      toast.error('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.auth.changePassword(current, next);
      if (result.ok) {
        toast.success('Password changed.');
        setCurrent('');
        setNext('');
        setConfirm('');
      } else {
        toast.error(result.error || 'Failed to change password.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-sm">
      <div className="space-y-1.5">
        <Label>Current Password</Label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>New Password</Label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Confirm New Password</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <Button onClick={submit} disabled={saving || !current || !next}>
        {saving ? 'Changing…' : 'Change Password'}
      </Button>
    </div>
  );
}

function IdleTimeoutSection() {
  const [minutes, setMinutes] = useState('15');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.appSettings.get('idle_timeout_minutes').then((value) => {
      if (value) setMinutes(value);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.appSettings.set('idle_timeout_minutes', String(Math.max(0, Number(minutes) || 0)));
      toast.success('Auto-lock setting saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-w-xs">
      <div className="space-y-1.5">
        <Label>Auto-lock after (minutes of inactivity)</Label>
        <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <p className="text-xs text-muted-foreground">Set to 0 to disable auto-lock.</p>
      </div>
      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

function PrintLayoutPreview({ layout }: { layout: PrintLayout }) {
  const { widthMm, heightMm } = PAPER_SIZES_MM[layout.paperSize];
  const previewHeightPx = 320;
  const scale = previewHeightPx / heightMm;
  const widthPx = widthMm * scale;

  return (
    <div
      className="relative bg-white border border-border shadow-sm mx-auto"
      style={{ width: widthPx, height: previewHeightPx }}
    >
      {/* Header zone — shaded to represent the pre-printed letterhead area
          that report content must never render into. */}
      <div
        className="absolute inset-x-0 top-0 bg-amber-100/70 border-b border-dashed border-amber-400 flex items-center justify-center text-[9px] text-amber-700"
        style={{ height: layout.topMarginMm * scale }}
      >
        Header zone ({layout.topMarginMm}mm)
      </div>
      <div
        className="absolute inset-x-0 bottom-0 bg-amber-100/70 border-t border-dashed border-amber-400 flex items-center justify-center text-[9px] text-amber-700"
        style={{ height: layout.bottomMarginMm * scale }}
      >
        Footer zone ({layout.bottomMarginMm}mm)
      </div>
      <div
        className="absolute bg-amber-50/50 border-r border-dashed border-amber-300"
        style={{ top: layout.topMarginMm * scale, bottom: layout.bottomMarginMm * scale, left: 0, width: layout.leftMarginMm * scale }}
      />
      <div
        className="absolute bg-amber-50/50 border-l border-dashed border-amber-300"
        style={{ top: layout.topMarginMm * scale, bottom: layout.bottomMarginMm * scale, right: 0, width: layout.rightMarginMm * scale }}
      />
      <div
        className="absolute bg-secondary/40 flex items-center justify-center text-[9px] text-muted-foreground text-center px-2"
        style={{
          top: layout.topMarginMm * scale,
          bottom: layout.bottomMarginMm * scale,
          left: layout.leftMarginMm * scale,
          right: layout.rightMarginMm * scale,
        }}
      >
        Report content prints here, at {layout.baseFontSizePt}pt base size
      </div>
    </div>
  );
}

function PrintLayoutSection() {
  const [layout, setLayout] = useState<PrintLayout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = () => {
    setLoadError(null);
    api.settings
      .getPrintLayout()
      .then((l) => setLayout(mergePrintLayout(l)))
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load print layout.'));
  };
  useEffect(load, []);

  if (loadError) {
    return (
      <div className="text-sm text-destructive space-y-2">
        <p>{loadError}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }
  if (!layout) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const setField = <K extends keyof PrintLayout>(key: K, value: PrintLayout[K]) => setLayout({ ...layout, [key]: value });

  const numberField = (key: 'topMarginMm' | 'bottomMarginMm' | 'leftMarginMm' | 'rightMarginMm' | 'baseFontSizePt', label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        step={key === 'baseFontSizePt' ? 0.5 : 1}
        value={layout[key]}
        onChange={(e) => setField(key, Number(e.target.value) || 0)}
      />
    </div>
  );

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.settings.updatePrintLayout(layout);
      setLayout(mergePrintLayout(updated));
      toast.success('Print layout saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save print layout.');
    } finally {
      setSaving(false);
    }
  };

  const printTestPage = async () => {
    setTesting(true);
    try {
      await api.print.testPage();
      toast.success('Test page sent to printer.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to print test page.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Paper Size</Label>
          <Select value={layout.paperSize} onValueChange={(v) => setField('paperSize', v as PrintLayout['paperSize'])}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {numberField('topMarginMm', 'Top Margin (mm)')}
          {numberField('bottomMarginMm', 'Bottom Margin (mm)')}
          {numberField('leftMarginMm', 'Left Margin (mm)')}
          {numberField('rightMarginMm', 'Right Margin (mm)')}
        </div>
        {numberField('baseFontSizePt', 'Base Font Size (pt)')}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Print Layout'}
          </Button>
          <Button variant="outline" onClick={printTestPage} disabled={testing}>
            {testing ? 'Printing…' : 'Print Test Page'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Print the test page onto your pre-printed letterhead and check the ruler ticks and border against your paper's
          header/footer boundary — adjust the margins above until they line up, then save.
        </p>
      </div>
      <div>
        <PrintLayoutPreview layout={layout} />
        <p className="text-xs text-muted-foreground text-center mt-2">
          Shaded amber zones are where your pre-printed letterhead lives — report content never renders there.
        </p>
      </div>
    </div>
  );
}

type VerifyOutcome =
  | { kind: 'matched'; filePath: string; report_no: string; patient_name: string; finalized_at: string | null }
  | { kind: 'unmatched'; filePath: string; hash: string };

function VerifyReportSection() {
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);

  const verify = async () => {
    setChecking(true);
    setOutcome(null);
    try {
      const result = await api.reports.verifyPdf();
      if (result.canceled) return;
      if (!result.success) {
        toast.error(result.error || 'Failed to verify PDF.');
        return;
      }
      if (result.matched && result.report && result.filePath) {
        setOutcome({
          kind: 'matched',
          filePath: result.filePath,
          report_no: result.report.report_no,
          patient_name: result.report.patient_name,
          finalized_at: result.report.finalized_at,
        });
      } else if (result.filePath && result.hash) {
        setOutcome({ kind: 'unmatched', filePath: result.filePath, hash: result.hash });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify PDF.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pick any PDF and LabCore will re-compute its SHA-256 hash and check it against every finalized report's stored
        hash — proving whether the file is byte-for-byte the same as what was originally generated, or has been
        altered since.
      </p>
      <Button onClick={verify} disabled={checking}>
        {checking ? 'Checking…' : 'Choose PDF to Verify…'}
      </Button>

      {outcome?.kind === 'matched' && (
        <div className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
          <div className="font-semibold text-success">✓ Verified — this file is authentic and unmodified.</div>
          <div className="text-muted-foreground mt-1">
            Matches Report {outcome.report_no} for {outcome.patient_name}
            {outcome.finalized_at ? `, finalized ${outcome.finalized_at.slice(0, 10)}` : ''}.
          </div>
        </div>
      )}
      {outcome?.kind === 'unmatched' && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <div className="font-semibold text-destructive">✗ No match found.</div>
          <div className="text-muted-foreground mt-1">
            This file's hash doesn't match any finalized report on record — it may have been edited after export, or it
            was never generated by LabCore.
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function BackupKindBadge({ kind }: { kind: BackupFileInfo['kind'] }) {
  const label = kind === 'auto' ? 'Automatic' : kind === 'manual' ? 'Manual' : 'Pre-Restore Safety';
  const variant = kind === 'pre-restore' ? 'warning' : kind === 'manual' ? 'success' : undefined;
  return <Badge variant={variant}>{label}</Badge>;
}

function RestoreBackupDialog({
  backup,
  onOpenChange,
  onRestored,
}: {
  backup: BackupFileInfo | null;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}) {
  const [password, setPassword] = useState('');
  const [restoring, setRestoring] = useState(false);

  const confirm = async () => {
    if (!backup) return;
    if (!password) {
      toast.error('Enter your password to confirm.');
      return;
    }
    setRestoring(true);
    try {
      await api.backup.restore(backup.path, password);
      // On success the main process relaunches the whole app immediately —
      // this line only runs if something unexpected left the app open.
      onRestored();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoring(false);
      setPassword('');
    }
  };

  return (
    <AlertDialog open={!!backup} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore from {backup?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This replaces the ENTIRE current database with this backup. Everything created or changed since {backup?.createdAt.slice(0, 10)}{' '}
            will be lost. A safety backup of the current database is taken first, and LabCore will restart immediately
            afterward.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label>Confirm your password to proceed</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={restoring}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {restoring ? 'Restoring…' : 'Restore & Restart'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BackupSection() {
  const [folder, setFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupFileInfo | null>(null);

  const refresh = () => api.backup.list().then(setBackups).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load backups.'));
  useEffect(() => {
    api.settings
      .get()
      .then((s) => setFolder(s.backup_folder))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load backup folder setting.'));
    refresh();
  }, []);

  const saveFolder = async () => {
    setSaving(true);
    try {
      await api.settings.update({ backup_folder: folder });
      toast.success('Backup folder saved.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const backupNow = async () => {
    setBackingUp(true);
    try {
      const info = await api.backup.now();
      toast.success(`Backup saved: ${info.name} (${formatBytes(info.sizeBytes)})`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Backup Folder</Label>
        <p className="text-xs text-muted-foreground">
          Point this at a USB drive or network folder for off-machine safety. Automatic backups run once a day and on
          every app close, keeping the last 30. Leave blank to use the default (Documents/LabCore Backups).
        </p>
        <div className="flex items-center gap-2">
          <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Documents/LabCore Backups (default)" className="flex-1" />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const picked = await api.settings.pickFolder();
              if (picked) setFolder(picked);
            }}
          >
            Choose Folder…
          </Button>
          <Button onClick={saveFolder} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <Button variant="outline" onClick={backupNow} disabled={backingUp}>
        {backingUp ? 'Backing up…' : 'Backup Now'}
      </Button>

      <div>
        <div className="text-sm font-medium mb-2">Existing Backups ({backups.length})</div>
        <div className="border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">File</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Created</th>
                <th className="text-left px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {backups.map((b) => (
                <tr key={b.path}>
                  <td className="px-3 py-2 font-mono text-xs">{b.name}</td>
                  <td className="px-3 py-2">
                    <BackupKindBadge kind={b.kind} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{b.createdAt.slice(0, 19).replace('T', ' ')}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatBytes(b.sizeBytes)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setRestoreTarget(b)}>
                      Restore
                    </Button>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-6">
                    No backups yet — click "Backup Now" to create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RestoreBackupDialog backup={restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)} onRestored={() => setRestoreTarget(null)} />
    </div>
  );
}

function DatabaseHealthSection() {
  const [result, setResult] = useState<IntegrityCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    try {
      const r = await api.db.healthCheck();
      setResult(r);
      if (r.ok) toast.success('Database integrity check passed.');
      else toast.error('Database integrity check found a problem.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Health check failed.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        LabCore also runs this automatically every time it starts, and shows a warning immediately if a problem is found.
      </p>
      <Button variant="outline" onClick={runCheck} disabled={checking}>
        {checking ? 'Checking…' : 'Run Integrity Check'}
      </Button>
      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.ok ? 'border-success/40 bg-success/10 text-success' : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="font-semibold">{result.ok ? '✓ Database is healthy' : '✗ Problem detected'}</div>
          {!result.ok && <pre className="mt-1 whitespace-pre-wrap text-xs">{result.details}</pre>}
        </div>
      )}
    </div>
  );
}

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Ctrl+K', description: 'Search tests (on the New Report page)' },
  { keys: 'Ctrl+N', description: 'Start a new report' },
  { keys: 'Ctrl+S', description: 'Save the current report as a draft' },
  { keys: 'Ctrl+P', description: 'Print / reprint the current report' },
];

function KeyboardShortcutsSection() {
  return (
    <div className="divide-y divide-border">
      {SHORTCUTS.map((s) => (
        <div key={s.keys} className="flex items-center justify-between py-2 text-sm">
          <span className="text-muted-foreground">{s.description}</span>
          <kbd className="border border-border rounded px-2 py-1 font-mono text-xs bg-muted/40">
            {s.keys.replace('Ctrl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')}
          </kbd>
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canManageDoctors = user?.role === 'ADMIN' || user?.role === 'RECEPTION';

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Clinic details, doctors, technicians, and account security.</p>
      </div>
      {isAdmin && (
        <SectionCard title="Clinic Information">
          <ClinicInfoSection />
        </SectionCard>
      )}
      {canManageDoctors && (
        <SectionCard title="Doctors">
          <DoctorsSection />
        </SectionCard>
      )}
      {canManageDoctors && (
        <SectionCard title="Technicians" description="The saved list shown in the &quot;Performed By&quot; field on New Report.">
          <TechniciansSection />
        </SectionCard>
      )}
      {isAdmin && (
        <SectionCard
          title="Print Layout"
          description="Match LabCore's printed output to your pre-printed letterhead paper."
        >
          <PrintLayoutSection />
        </SectionCard>
      )}
      {isAdmin && (
        <SectionCard title="Verify Report" description="Check whether a saved PDF matches the original finalized report.">
          <VerifyReportSection />
        </SectionCard>
      )}
      <SectionCard title="Security" description="Change the password for your own account.">
        <SecuritySection />
      </SectionCard>
      {isAdmin && (
        <SectionCard title="Session" description="How long LabCore waits before locking an idle session.">
          <IdleTimeoutSection />
        </SectionCard>
      )}
      {isAdmin && (
        <SectionCard
          title="Backup & Restore"
          description="Automatic backups run daily and on every app close, using SQLite's own safe-while-running backup API."
        >
          <BackupSection />
        </SectionCard>
      )}
      {isAdmin && (
        <SectionCard title="Database Health" description="Checks the database file for corruption (PRAGMA integrity_check).">
          <DatabaseHealthSection />
        </SectionCard>
      )}
      {isAdmin && (
        <SectionCard title="Audit Log" description="Every login, edit, finalize, print, backup, and restore is recorded.">
          <Link to="/audit" className="text-sm text-primary hover:underline">
            Open the full Audit Log →
          </Link>
        </SectionCard>
      )}
      <SectionCard title="Keyboard Shortcuts">
        <KeyboardShortcutsSection />
      </SectionCard>
    </div>
  );
}
