import { useDevLogin } from '@/lib/useDevLogin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Reached only via the hidden Ctrl+Shift+Alt+D shortcut on the normal Login
// screen (see DeveloperAccessGate) — a step-up credential check for
// support visits, using the exact same developer credentials and lockout
// as the one-time Developer Setup screen. It never touches the lab's own
// login session; success here only opens the Developer Panel.
export default function DeveloperAccessDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const dev = useDevLogin(onSuccess);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Developer Access</DialogTitle>
        </DialogHeader>
        <form onSubmit={dev.submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dev-access-username">Username</Label>
            <Input
              id="dev-access-username"
              autoFocus
              autoComplete="off"
              disabled={dev.locked}
              value={dev.username}
              onChange={(e) => dev.setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-access-password">Password</Label>
            <Input
              id="dev-access-password"
              type="password"
              autoComplete="off"
              disabled={dev.locked}
              value={dev.password}
              onChange={(e) => dev.setPassword(e.target.value)}
            />
          </div>
          {dev.error && !dev.locked && <p className="text-sm text-destructive">{dev.error}</p>}
          {dev.locked && <p className="text-sm text-destructive">Too many attempts. Try again in {dev.remainingSeconds}s.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={dev.checking || dev.locked || !dev.username || !dev.password}>
              {dev.checking ? 'Checking…' : 'Unlock'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
