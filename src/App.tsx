import { useEffect, useState } from 'react';
import { createHashRouter, RouterProvider, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import NewReport from './pages/NewReport';
import Reports from './pages/Reports';
import Patients from './pages/Patients';
import PatientProfile from './pages/PatientProfile';
import TestCatalog from './pages/TestCatalog';
import Revenue from './pages/Revenue';
import TestReport from './pages/TestReport';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import PrintReport from './pages/PrintReport';
import PrintTemplateRoute from './pages/PrintTemplateRoute';
import AlignmentTestPage from './pages/AlignmentTestPage';
import RevenuePrintTemplate from './pages/RevenuePrintTemplate';
import TestReportPrintTemplate from './pages/TestReportPrintTemplate';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import Login from './pages/Login';
import ForceChangePassword from './pages/ForceChangePassword';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ClinicProvider } from '@/lib/clinic-context';
import { useIdleTimer } from '@/lib/useIdleTimer';
import { api } from '@/lib/api';

const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

function AppLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Global — works from anywhere in the app, not just the New Report page
  // itself, since "start a new report" is meaningful no matter where the
  // user currently is.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        const canCreate = user?.role === 'ADMIN' || user?.role === 'RECEPTION';
        if (!canCreate) return;
        e.preventDefault();
        navigate('/new-report');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, user]);

  return (
    <ClinicProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            {/* Every page's own top-level element already brings its own p-8
                — this only centers that content within a sane max width on
                wide monitors, instead of letting it hug the left edge with a
                growing dead zone of empty space on the right. */}
            <div className="max-w-[1600px] mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ClinicProvider>
  );
}

// The gate that shows Login / ForceChangePassword / the real app shell
// depending on auth phase. This used to wrap the whole RouterProvider, but
// the print-template routes below need to render without ANY of this
// gating — they're loaded in their own hidden BrowserWindow purely to be
// screenshotted by printToPDF, by which point the main process has already
// verified the caller is authorized to print. Session state itself lives in
// the main process and is shared across every renderer window, so by the
// time that hidden window's currentUser() call resolves it would say
// "unlocked" anyway — but there's no reason to pay for mounting Sidebar/
// TopBar/the idle timer in a window nobody ever sees.
function Gate() {
  const { phase, logout } = useAuth();
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(DEFAULT_IDLE_TIMEOUT_MINUTES);

  useEffect(() => {
    if (phase !== 'unlocked') return;
    api.appSettings.get('idle_timeout_minutes').then((value) => {
      setIdleTimeoutMinutes(value ? Number(value) || 0 : DEFAULT_IDLE_TIMEOUT_MINUTES);
    });
  }, [phase]);

  useIdleTimer(phase === 'unlocked' ? idleTimeoutMinutes : 0, () => {
    toast.message('Signed out after inactivity.');
    logout('idle_timeout');
  });

  if (phase === 'checking') {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (phase === 'locked') {
    return <Login />;
  }

  if (phase === 'must-change-password') {
    return <ForceChangePassword />;
  }

  return <AppLayout />;
}

// A data router (not a plain <HashRouter>/<Routes> tree) so pages like New
// Report can use useBlocker to warn before navigating away with unsaved
// changes — that hook only works with a data router.
const router = createHashRouter([
  // Top-level, unauthenticated-looking routes used only by the hidden print
  // BrowserWindow (see electron/print.ts) — no Sidebar/TopBar, no auth gate.
  { path: '/print-template/alignment-test', element: <AlignmentTestPage />, errorElement: <RouteErrorBoundary /> },
  { path: '/print-template/revenue', element: <RevenuePrintTemplate />, errorElement: <RouteErrorBoundary /> },
  { path: '/print-template/test-report', element: <TestReportPrintTemplate />, errorElement: <RouteErrorBoundary /> },
  { path: '/print-template/:id', element: <PrintTemplateRoute />, errorElement: <RouteErrorBoundary /> },
  {
    path: '/',
    element: <Gate />,
    // Each child gets its own errorElement (rather than one at the "/"
    // level) so a crash in one page replaces just the <Outlet/> content —
    // Sidebar/TopBar stay mounted and the rest of the app stays usable.
    children: [
      { index: true, element: <Dashboard />, errorElement: <RouteErrorBoundary /> },
      { path: 'new-report', element: <NewReport />, errorElement: <RouteErrorBoundary /> },
      { path: 'new-report/:id', element: <NewReport />, errorElement: <RouteErrorBoundary /> },
      { path: 'reports', element: <Reports />, errorElement: <RouteErrorBoundary /> },
      { path: 'reports/:id/print', element: <PrintReport />, errorElement: <RouteErrorBoundary /> },
      { path: 'patients', element: <Patients />, errorElement: <RouteErrorBoundary /> },
      { path: 'patients/:id', element: <PatientProfile />, errorElement: <RouteErrorBoundary /> },
      { path: 'tests', element: <TestCatalog />, errorElement: <RouteErrorBoundary /> },
      { path: 'revenue', element: <Revenue />, errorElement: <RouteErrorBoundary /> },
      { path: 'test-report', element: <TestReport />, errorElement: <RouteErrorBoundary /> },
      { path: 'users', element: <Users />, errorElement: <RouteErrorBoundary /> },
      { path: 'audit', element: <AuditLog />, errorElement: <RouteErrorBoundary /> },
      { path: 'settings', element: <Settings />, errorElement: <RouteErrorBoundary /> },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
