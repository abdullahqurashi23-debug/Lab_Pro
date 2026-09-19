import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Shown right after a login where the account was flagged
// must_change_password (the seeded admin account, or anyone whose password
// was just reset by an administrator). Blocks access to the rest of the app
// until a new password is set.
export default function ForceChangePassword() {
  const { user, completePasswordChange, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 4) {
      setError('New password must be at least 4 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.auth.changePassword(current, next);
      if (result.ok) {
        toast.success('Password changed.');
        completePasswordChange();
      } else {
        setError(result.error || 'Failed to change password.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">Password change required</div>
            <div className="text-sm text-muted-foreground mt-1">
              {user?.username}, you must set a new password before continuing.
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current">Current (temporary) Password</Label>
              <Input id="current" type="password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="next">New Password</Label>
              <Input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm New Password</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Set New Password'}
            </Button>
            <button
              type="button"
              onClick={() => logout()}
              className="w-full text-center text-xs text-muted-foreground hover:underline"
            >
              Cancel and sign out
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
