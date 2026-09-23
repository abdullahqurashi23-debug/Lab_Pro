// A centered, modal error dialog — the replacement for toast.error()
// throughout the app. A corner toast is a poor fit for a real validation
// error (e.g. "missing results for: X, Y, Z, and 3 more") — it's small,
// easy to miss, and cramped for anything longer than one short line. This
// is a plain module-level pub/sub (like sonner's own `toast` function) so
// any file can just call `showErrorDialog('message')` exactly like it
// already called `toast.error('message')`, with no provider/context to
// wire up at every call site — only <ErrorDialogHost/>, mounted once in
// App.tsx, needs to exist for it to render anywhere in the tree.
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ErrorDialogState {
  title: string;
  message: string;
}

type Listener = (state: ErrorDialogState | null) => void;
let current: ErrorDialogState | null = null;
const listeners = new Set<Listener>();

export function showErrorDialog(message: string, title = 'Something went wrong'): void {
  current = { title, message };
  listeners.forEach((listener) => listener(current));
}

function useErrorDialogState(): ErrorDialogState | null {
  const [state, setState] = useState<ErrorDialogState | null>(current);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function ErrorDialogHost() {
  const state = useErrorDialogState();
  const close = () => {
    current = null;
    listeners.forEach((listener) => listener(null));
  };

  return (
    <AlertDialog open={!!state} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">{state?.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line text-foreground">{state?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={close}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
