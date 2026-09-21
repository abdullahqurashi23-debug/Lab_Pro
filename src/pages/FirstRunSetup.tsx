import React, { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Shown exactly once per install, before any admin account exists.
// Whoever is physically setting up this install (not the lab, not this
// software) picks the very first admin username/password themselves —
// nothing is auto-generated or hardcoded, so no one else could already
// know it. Right after this, ForceChangePassword takes over (the account
// created here is always must_change_password) so a real, final password
// can be set on the spot too.
export default function FirstRunSetup() {
  const { createFirstAdmin } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const result = await createFirstAdmin(username, password);
      if (!result.ok) {
        setError(result.error || 'Failed to create the admin account.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">Set up the admin account</div>
            <div className="text-sm text-muted-foreground mt-1">
              This is a brand new install. Choose the first admin username and password — you'll be asked to confirm
              a final password again right after.
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving || !username || !password}>
              {saving ? 'Creating…' : 'Create Admin Account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
