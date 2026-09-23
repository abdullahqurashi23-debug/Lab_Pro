import { useEffect, useState } from 'react';
import { ShieldAlert, FolderOpen, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { showErrorDialog } from '@/lib/errorDialog';
import { toast } from 'sonner';
import type { PublicUser, AuditLogEntry, IntegrityCheckResult } from '@/lib/types';
import type { DevSystemInfo } from '@/vite-env';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

// Reached only after a successful Ctrl+Shift+Alt+D developer login on the
// Login screen (see DeveloperAccessGate) — everything here calls a
// dev:* handler gated by the main process's devUnlocked flag, not the
// lab's own signed-in session (there may not be one). Closing this panel
// clears that flag via api.dev.logout(), so leaving it re-locks
// immediately, not just visually.
export default function DeveloperPanel({ onClose }: { onClose: () => void }) {
  const { refreshPhase } = useAuth();
  const [info, setInfo] = useState<DevSystemInfo | null>(null);
  const [admins, setAdmins] = useState<PublicUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditLogEntry[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityCheckResult | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resettingSetup, setResettingSetup] = useState(false);

  useEffect(() => {
    api.dev.systemInfo().then(setInfo).catch((err) => showErrorDialog(err instanceof Error ? err.message : 'Failed to load system info.'));
    api.dev.listAdmins().then(setAdmins).catch(() => setAdmins([]));
    api.dev.auditLog({ pageSize: 50 }).then((r) => setAuditRows(r.rows)).catch(() => setAuditRows([]));
  }, []);

  const resetAdminPassword = async () => {
    if (!selectedAdminId) {
      showErrorDialog('Choose an admin account first.');
      return;
    }
    if (newPassword.length < 8) {
      showErrorDialog('Password must be at least 8 characters.');
      return;
    }
    setResettingPassword(true);
    try {
      await api.dev.resetLabAdminPassword(Number(selectedAdminId), newPassword);
      toast.success('Password reset. They must change it on next login.');
      setNewPassword('');
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setResettingPassword(false);
    }
  };

  const runIntegrityCheck = async () => {
    setCheckingIntegrity(true);
    try {
      setIntegrity(await api.dev.dbIntegrityCheck());
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Integrity check failed.');
    } finally {
      setCheckingIntegrity(false);
    }
  };

  const confirmResetSetup = async () => {
    setResettingSetup(true);
    try {
      await api.dev.resetSetup();
      setResetConfirmOpen(false);
      // needsSetup() now reports true, so this alone swaps the whole
      // window over to Developer Setup — no separate onClose() needed,
      // this panel (and the Login screen behind it) unmount as part of
      // that same phase change.
      await refreshPhase();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to reset setup.');
    } finally {
      setResettingSetup(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Developer Panel</h1>
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Info</CardTitle>
          </CardHeader>
          <CardContent>
            {info ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <InfoRow label="Machine ID" value={info.machineId} />
                <InfoRow label="App Version" value={info.appVersion} />
                <InfoRow label="Platform" value={`${info.platform} (${info.arch}) — ${info.osRelease}`} />
                <InfoRow label="Electron" value={info.electronVersion} />
                <InfoRow label="Chrome" value={info.chromeVersion} />
                <InfoRow label="Node" value={info.nodeVersion} />
                <InfoRow label="Database Path" value={info.dbPath} />
                <InfoRow label="Data Folder" value={info.userDataPath} />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reset Lab Admin Password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Admin Account</Label>
                <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.full_name} ({a.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label>New Password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <Button onClick={resetAdminPassword} disabled={resettingPassword}>
                {resettingPassword ? 'Resetting…' : 'Reset Password'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">They'll be required to change it on next login.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Database</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={runIntegrityCheck} disabled={checkingIntegrity}>
                {checkingIntegrity ? 'Checking…' : 'Run Integrity Check'}
              </Button>
              <Button variant="outline" onClick={() => api.dev.openLogsFolder()}>
                <FolderOpen className="h-4 w-4" />
                Open Data Folder
              </Button>
            </div>
            {integrity && (
              <p className={`text-sm ${integrity.ok ? 'text-success' : 'text-destructive'}`}>
                {integrity.ok ? 'Database is healthy.' : integrity.details}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Reset Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Deactivates every existing user account and clears the lab details (name, address, contact info, report
              prefix), then re-runs Developer Setup on next launch. Patients, reports, results, and payment history are
              never touched.
            </p>
            <Button variant="destructive" onClick={() => setResetConfirmOpen(true)}>
              <RotateCcw className="h-4 w-4" />
              Reset Setup…
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Audit Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {r.created_at.slice(0, 19).replace('T', ' ')}
                      </TableCell>
                      <TableCell>{r.user_full_name || <span className="text-muted-foreground">System</span>}</TableCell>
                      <TableCell className="font-medium">{r.action}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.entity}
                        {r.entity_id ? ` #${r.entity_id}` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  {auditRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        No audit entries yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={resetConfirmOpen} onOpenChange={(open) => !open && setResetConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset setup on this install?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates every user account (including the current lab admin) and clears the lab's name,
              address, contact info, and report prefix. Patients, reports, test results, and payment history are NOT
              deleted. This cannot be undone. Type RESET below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder="Type RESET to confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetConfirmText('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetSetup}
              disabled={resetConfirmText !== 'RESET' || resettingSetup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resettingSetup ? 'Resetting…' : 'Reset Setup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground break-all">{value}</dd>
    </>
  );
}
