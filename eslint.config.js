// @ts-check
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh').default;

module.exports = tseslint.config(
  { ignores: ['dist', 'dist-electron', 'release', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Only the two classic, well-established hook rules — real bug
      // detectors (illegal conditional hooks, stale closures from missing
      // deps). The rest of v7's "React Compiler safety" ruleset is noisy
      // opinion for a codebase not using the compiler (e.g. it flags any
      // small helper component defined inside its parent, a normal and
      // safe pattern used throughout this project).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
