import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface ClinicContextValue {
  clinicName: string | null;
  refreshClinicName: () => void;
}

const ClinicContext = createContext<ClinicContextValue | null>(null);

// Small and focused on purpose: the only thing that currently needs to
// react live to a Settings change is the sidebar's clinic name label.
// Without this, Sidebar's own one-time fetch on mount never saw a later
// Settings save — it stayed mounted for the whole session (Sidebar lives
// outside the <Outlet/> that swaps between pages), so the old name stuck
// around until the next full app restart.
export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [clinicName, setClinicName] = useState<string | null>(null);

  const refreshClinicName = useCallback(() => {
    api.settings
      .get()
      .then((s) => setClinicName(s.clinic_name))
      .catch(() => {
        // Non-fatal — the sidebar just keeps showing whatever it last had.
      });
  }, []);

  useEffect(() => {
    refreshClinicName();
  }, [refreshClinicName]);

  return <ClinicContext.Provider value={{ clinicName, refreshClinicName }}>{children}</ClinicContext.Provider>;
}

export function useClinic(): ClinicContextValue {
  const ctx = useContext(ClinicContext);
  if (!ctx) throw new Error('useClinic must be used within a ClinicProvider');
  return ctx;
}
