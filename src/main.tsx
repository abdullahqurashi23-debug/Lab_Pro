import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Toaster } from '@/components/ui/sonner';
// Bundled locally via @fontsource — no CDN, so the app stays fully offline.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';

// No top-level <HashRouter> here on purpose: the authenticated part of the
// app uses a data router (createHashRouter) so pages like New Report can
// use useBlocker to warn before navigating away with unsaved changes — a
// plain <HashRouter>/<Routes> tree can't do that. The lock/login screens
// don't need routing at all, so App.tsx only mounts the router once
// unlocked (see src/App.tsx).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" richColors closeButton />
  </React.StrictMode>
);
