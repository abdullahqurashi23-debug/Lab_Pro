import { defineConfig } from 'vitest/config';
import path from 'path';

// Separate from vite.config.ts on purpose — that one builds the renderer
// bundle (jsx, browser target); these tests exercise the main-process/db
// layer directly under plain Node, including real better-sqlite3 calls
// against throwaway on-disk databases.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
