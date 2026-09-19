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
});
