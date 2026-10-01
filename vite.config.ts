import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// This config builds only the renderer (the React UI). Electron's main
// process (electron/*.ts) is compiled separately by tsc — see
// tsconfig.electron.json and the "dev"/"build" scripts in package.json.
export default defineConfig({
  plugins: [react()],
  base: './', // required so file:// paths resolve correctly in production
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    // Electron (electron/main/index.ts, electron/print.ts) hardcodes
    // http://localhost:5173 for dev mode — without this, Vite silently
    // falls back to 5174/5175/... when 5173 is already taken (usually a
    // leftover `npm run dev` process that was never fully stopped), and
    // Electron keeps loading the old/wrong port with no error, showing a
    // blank window with no indication why. Failing loudly here is far
    // easier to diagnose than a silently blank app.
    strictPort: true,
  },
});
