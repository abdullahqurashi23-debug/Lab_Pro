import { useRouteError, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Without this, an error thrown while rendering any page bubbles all the
// way to the router's default boundary, which unmounts the entire app
// (Sidebar/TopBar included) — one broken page becomes a fully unusable app
// with no way to navigate anywhere else. This keeps the blast radius to
// just the page that failed.
export default function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  return (
    <div className="p-8 flex flex-col items-center justify-center text-center h-full gap-3">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div className="text-lg font-semibold text-foreground">Something went wrong on this page</div>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
    </div>
  );
}
