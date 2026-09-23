import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { showErrorDialog } from '@/lib/errorDialog';
import { Plus, KeyRound, ShieldOff, ShieldCheck, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { PublicUser, Role } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

const ROLES: Role[] = ['ADMIN', 'TECHNICIAN', 'RECEPTION'];
const BLANK_USER = { username: '', password: '', full_name: '', role: 'RECEPTION' as Role };

export default function Users() {
  const { user: me, refreshUser } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState(BLANK_USER);
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<PublicUser | null>(null);
  const [renameTarget, setRenameTarget] = useState<PublicUser | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const refresh = () =>
    api.users
      .list()
      .then(setUsers)
      .catch((err) => showErrorDialog(err instanceof Error ? err.message : 'Failed to load users.'))
      .finally(() => setLoading(false));
  useEffect(() => {
    refresh();
  }, []);

  if (me && me.role !== 'ADMIN') {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Only an administrator can manage users.</p>
      </div>
    );
  }

  const createUser = async () => {
    if (!newUser.username.trim() || !newUser.password || !newUser.full_name.trim()) {
      showErrorDialog('Username, password, and full name are required.');
      return;
    }
    try {
      await api.users.create(newUser);
      toast.success('User created.');
      setAddOpen(false);
      setNewUser(BLANK_USER);
      refresh();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to create user.');
    }
  };

  const toggleActive = async (u: PublicUser) => {
    try {
      await api.users.update(u.id, { full_name: u.full_name, role: u.role, is_active: !u.is_active });
      toast.success(u.is_active ? `${u.username} deactivated.` : `${u.username} reactivated.`);
      refresh();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to update user.');
    }
  };

  // Reactivating is a benign, easily-reversible click — only deactivating
  // (locking someone out) gets a confirmation step first.
  const handleToggleClick = (u: PublicUser) => {
    if (u.is_active) setDeactivateTarget(u);
    else toggleActive(u);
  };
  const confirmDeactivate = () => {
    if (deactivateTarget) toggleActive(deactivateTarget);
    setDeactivateTarget(null);
  };

  const changeRole = async (u: PublicUser, role: Role) => {
    try {
      await api.users.update(u.id, { full_name: u.full_name, role, is_active: !!u.is_active });
      toast.success(`${u.username}'s role changed to ${role}.`);
      refresh();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to update role.');
    }
  };

  const openRename = (u: PublicUser) => {
    setRenameTarget(u);
    setRenameValue(u.full_name);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      showErrorDialog('Full name is required.');
      return;
    }
    try {
      await api.users.update(renameTarget.id, { full_name: trimmed, role: renameTarget.role, is_active: !!renameTarget.is_active });
      toast.success(`Name updated to ${trimmed}.`);
      setRenameTarget(null);
      // If the admin just renamed their own account, the top bar's cached
      // name would otherwise stay stale until the next login.
      if (renameTarget.id === me?.id) refreshUser();
      refresh();
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to update name.');
    }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (resetPassword.length < 4) {
      showErrorDialog('Password must be at least 4 characters.');
      return;
    }
    try {
      await api.users.resetPassword(resetTarget.id, resetPassword);
      toast.success(`Password reset for ${resetTarget.username}. They must change it on next login.`);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to reset password.');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Accounts are deactivated, never deleted — history and audit records always stay attributable.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center text-muted-foreground py-10 text-sm">Loading users…</div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span>{u.full_name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit name" onClick={() => openRename(u)}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Select value={u.role} onValueChange={(v) => changeRole(u, v as Role)} disabled={u.id === me?.id}>
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {u.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Deactivated</Badge>}
                  {!!u.must_change_password && (
                    <Badge variant="warning" className="ml-2">
                      Must change password
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  <Button variant="ghost" size="icon" title="Reset password" onClick={() => setResetTarget(u)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={u.is_active ? 'Deactivate' : 'Reactivate'}
                    disabled={u.id === me?.id}
                    onClick={() => handleToggleClick(u)}
                  >
                    {u.is_active ? (
                      <ShieldOff className="h-4 w-4 text-destructive" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-success" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">They'll be required to change this on first login.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as Role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit name for {renameTarget?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename}>Save Name</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {resetTarget?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New Temporary Password</Label>
            <Input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">They'll be required to change this on next login.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitReset}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be signed out immediately and won't be able to log in until reactivated. Their history and audit
              records are kept either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
