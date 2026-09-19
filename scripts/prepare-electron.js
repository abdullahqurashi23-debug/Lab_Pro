// Copies non-TypeScript assets that the compiled electron/ output needs at
// runtime but that tsc won't emit on its own: the numbered .sql migration
// files (see src/db/migrations) and the app icon used by BrowserWindow.
// Run automatically before "dev" and "build" (see package.json).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(path.join(root, 'src', 'db', 'migrations'), path.join(root, 'dist-electron', 'src', 'db', 'migrations'));

console.log('prepare-electron: copied src/db/migrations -> dist-electron/src/db/migrations');
