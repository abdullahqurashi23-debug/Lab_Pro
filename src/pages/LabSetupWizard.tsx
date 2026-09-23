import { useState } from 'react';
import { FlaskConical, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { showErrorDialog } from '@/lib/errorDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const STEPS = ['Lab Details', 'Admin Account', 'Report Folder', 'Summary'] as const;

interface FormState {
  clinic_name: string;
  address: string;
  phone: string;
  pathologist_name: string;
  report_number_prefix: string;
  full_name: string;
  username: string;
  password: string;
  confirmPassword: string;
  report_archive_folder: string;
}

const BLANK: FormState = {
  clinic_name: '',
  address: '',
  phone: '',
  pathologist_name: '',
  report_number_prefix: 'LAB',
  full_name: '',
  username: '',
  password: '',
  confirmPassword: '',
  report_archive_folder: '',
};

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const labels = ['Weak', 'Weak', 'Fair', 'Strong'];
  return { score: Math.min(score, 3) as 0 | 1 | 2 | 3, label: labels[score] };
}

// Shown right after Developer Setup succeeds — this is where the lab picks
// their own permanent identity: clinic details, their own admin login, and
// where finalized report PDFs get saved. "Finish Setup" commits all of it
// in a single database transaction (see setupRepo.completeLabSetup) so
// there's no way to end up with, say, an admin account but no clinic name.
export default function LabSetupWizard() {
  const { completeLabSetup } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const strength = passwordStrength(form.password);

  const stepErrors: Record<number, string | null> = {
    0: form.clinic_name.trim() ? null : 'Lab name is required.',
    1: !form.full_name.trim()
      ? 'Full name is required.'
      : !form.username.trim() || form.username.trim().length < 2
        ? 'Username is required.'
        : form.password.length < 8
          ? 'Password must be at least 8 characters.'
          : form.password !== form.confirmPassword
            ? 'Passwords do not match.'
            : null,
    2: null,
    3: null,
  };

  const goNext = () => {
    const err = stepErrors[step];
    if (err) {
      showErrorDialog(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const pickFolder = async () => {
    const picked = await api.dev.pickReportFolder();
    if (picked) set('report_archive_folder', picked);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const result = await completeLabSetup({
        clinic: {
          clinic_name: form.clinic_name.trim(),
          address: form.address.trim(),
          phone: form.phone.trim(),
          pathologist_name: form.pathologist_name.trim(),
          report_number_prefix: form.report_number_prefix.trim() || 'LAB',
          report_archive_folder: form.report_archive_folder.trim(),
        },
        admin: {
          full_name: form.full_name.trim(),
          username: form.username.trim(),
          password: form.password,
        },
      });
      if (!result.ok) {
        showErrorDialog(result.error || 'Failed to finish setup.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">Set Up Your Lab</div>
            <div className="text-sm text-muted-foreground mt-1">Setup is verified. A few details, then you're in.</div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    i < step
                      ? 'bg-primary text-primary-foreground'
                      : i === step
                        ? 'bg-primary/15 text-primary ring-1 ring-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
              </div>
            ))}
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{STEPS[step]}</div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {step === 0 && (
              <>
                <div className="space-y-1.5">
                  <Label>Lab Name</Label>
                  <Input autoFocus value={form.clinic_name} onChange={(e) => set('clinic_name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Pathologist Name</Label>
                  <Input value={form.pathologist_name} onChange={(e) => set('pathologist_name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Report Number Prefix</Label>
                  <Input
                    value={form.report_number_prefix}
                    onChange={(e) => set('report_number_prefix', e.target.value)}
                    placeholder="LAB"
                  />
                  <p className="text-xs text-muted-foreground">
                    Prepended to every report number, e.g. "{form.report_number_prefix || 'LAB'}-2026-000001".
                  </p>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-1.5">
                  <Label>Your Name</Label>
                  <Input autoFocus value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input value={form.username} onChange={(e) => set('username', e.target.value)} />
                  <p className="text-xs text-muted-foreground">Free to choose — "admin" is fine.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
                  {form.password && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full ${
                              i <= strength.score - 1
                                ? strength.score === 1
                                  ? 'bg-destructive'
                                  : strength.score === 2
                                    ? 'bg-warning'
                                    : 'bg-success'
                                : 'bg-muted'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{strength.label} — minimum 8 characters.</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password</Label>
                  <Input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => set('confirmPassword', e.target.value)}
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-1.5">
                <Label>Report Save Folder</Label>
                <p className="text-xs text-muted-foreground">
                  Where finalized report PDFs are archived. Leave blank to use the default (Documents/LabCore Reports).
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={form.report_archive_folder}
                    onChange={(e) => set('report_archive_folder', e.target.value)}
                    placeholder="Documents/LabCore Reports (default)"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={pickFolder}>
                    Choose Folder…
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3 text-sm">
                <SummaryRow label="Lab Name" value={form.clinic_name} />
                <SummaryRow label="Address" value={form.address || '—'} />
                <SummaryRow label="Phone" value={form.phone || '—'} />
                <SummaryRow label="Pathologist" value={form.pathologist_name || '—'} />
                <SummaryRow label="Report Prefix" value={form.report_number_prefix || 'LAB'} />
                <SummaryRow label="Admin Name" value={form.full_name} />
                <SummaryRow label="Admin Username" value={form.username} />
                <SummaryRow label="Report Folder" value={form.report_archive_folder || 'Default (Documents/LabCore Reports)'} />
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="outline" onClick={goBack} disabled={step === 0 || saving}>
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  Next
                </Button>
              ) : (
                <Button type="button" onClick={finish} disabled={saving}>
                  {saving ? 'Finishing…' : 'Finish Setup'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
