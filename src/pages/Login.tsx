import React, { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toFileUrl } from '@/lib/fileUrl';
import type { ClinicSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function Login() {
  const { login } = useAuth();
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.settings.get().then(setClinic).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setChecking(true);
    try {
      const result = await login(username, password);
      if (!result.ok) {
        setError(result.error || 'Invalid username or password.');
        setPassword('');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center space-y-2">
          {clinic?.logo_path ? (
            <img src={toFileUrl(clinic.logo_path)} alt="" className="h-14 w-14 object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FlaskConical className="h-6 w-6" />
            </div>
          )}
          <div>
            <div className="text-lg font-bold text-foreground">{clinic?.clinic_name || 'LabCore'}</div>
            <div className="text-sm text-muted-foreground mt-1">Sign in to continue.</div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={checking || !username || !password}>
              {checking ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
