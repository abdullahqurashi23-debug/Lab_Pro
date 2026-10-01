import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import DeveloperAccessDialog from './DeveloperAccessDialog';
import DeveloperPanel from '@/pages/DeveloperPanel';

// Wraps the normal Login screen with the hidden Ctrl+Shift+Alt+D support-
// access shortcut. Entirely self-contained: it never touches AuthContext's
// phase or the lab's own login session — a developer unlocking this panel
// mid-support-visit doesn't sign anyone in or out of the app itself.
export default function DeveloperAccessGate({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // e.code ('KeyD'), not e.key — holding the real Option key on a Mac
      // composes Option+D into a special character ("∂"), so e.key never
      // actually equals 'd' once Alt/Option is genuinely held down on a
      // physical keyboard. e.code reports the physical key position
      // instead, unaffected by whatever character modifiers compose it
      // into, which is what a modifier-key shortcut actually needs.
      if (e.ctrlKey && e.shiftKey && e.altKey && e.code === 'KeyD') {
        e.preventDefault();
        setDialogOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const closePanel = () => {
    api.dev.logout();
    setPanelOpen(false);
  };

  if (panelOpen) {
    return <DeveloperPanel onClose={closePanel} />;
  }

  return (
    <>
      {children}
      <DeveloperAccessDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          setDialogOpen(false);
          setPanelOpen(true);
        }}
      />
    </>
  );
}
