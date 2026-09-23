import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDevLogin } from '@/lib/useDevLogin';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Shown exactly once per install, before anything else — no normal login,
// no app access, until this passes. Only the developer's own hardcoded
// credentials (bcrypt hashes in electron/devConfig.ts, never the lab's own
// account) get past this screen; once they do, LabSetupWizard takes over
// and this one never appears again (see auth-context.tsx: needsSetup flips
// to false the moment that wizard finishes).
export default function DeveloperSetup() {
  const { enterLabSetup } = useAuth();
  const [devInfo, setDevInfo] = useState<{ name: string; contact: string } | null>(null);
  const dev = useDevLogin(enterLabSetup);

  useEffect(() => {
    api.dev.info().then(setDevInfo).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">Developer Setup</div>
            <div className="text-sm text-muted-foreground mt-1">
              This install hasn't been set up yet. Only the developer can complete this step — the lab's own login
              is created in the next screen.
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={dev.submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dev-username">Username</Label>
              <Input
                id="dev-username"
                autoFocus
                autoComplete="off"
                disabled={dev.locked}
                value={dev.username}
                onChange={(e) => dev.setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-password">Password</Label>
              <Input
                id="dev-password"
                type="password"
                autoComplete="off"
                disabled={dev.locked}
                value={dev.password}
                onChange={(e) => dev.setPassword(e.target.value)}
              />
            </div>
            {dev.error && !dev.locked && <p className="text-sm text-destructive">{dev.error}</p>}
            {dev.locked && (
              <p className="text-sm text-destructive">Too many attempts. Try again in {dev.remainingSeconds}s.</p>
            )}
            <Button type="submit" className="w-full" disabled={dev.checking || dev.locked || !dev.username || !dev.password}>
              {dev.checking ? 'Checking…' : 'Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
      {devInfo && (devInfo.name || devInfo.contact) && (
        <div className="fixed bottom-6 left-0 right-0 text-center text-xs text-muted-foreground">
          Not expecting this screen? Contact {devInfo.name}
          {devInfo.contact ? ` — ${devInfo.contact}` : ''}
        </div>
      )}
    </div>
  );
}
