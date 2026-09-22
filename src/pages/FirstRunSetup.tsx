import React, { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Shown exactly once per install, before any account exists. Whoever is
// physically setting up this install (not the lab, not this software)
// picks a username/password themselves — nothing is auto-generated or
// hardcoded, so no one else could already know it. This account is
// marked is_provisional and is only ever used to get past this screen:
// right after, LabAccountSetup has the lab pick their own separate
// username/password, and this one is deactivated in the same step.
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
      // This account is retired the moment the lab sets up their own (see
      // LabAccountSetup) — "Installer" as its full name is only there so
      // it reads clearly in the Audit Log/Users list, not something worth
      // asking the installer to type in for an account this short-lived.
      const result = await createFirstAdmin(username, password, 'Installer');
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
            <div className="text-lg font-bold text-foreground">Installer login</div>
            <div className="text-sm text-muted-foreground mt-1">
              This is a brand new install. Choose a username and password only you'll use to finish setup — right
              after, the lab sets up their own separate login, and this one stops working.
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
