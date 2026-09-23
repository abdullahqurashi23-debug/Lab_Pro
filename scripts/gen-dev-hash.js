#!/usr/bin/env node
// Generates the two bcrypt hashes electron/devConfig.ts needs.
//
// Usage:
//   node scripts/gen-dev-hash.js <username> <password>
//
// Run this locally on your own machine, then paste the two printed lines
// into electron/devConfig.ts before building the installer. Don't commit
// the plaintext username/password anywhere (shell history, chat, a commit
// message) — only the two hashes this prints belong in the repo.

const bcrypt = require('bcryptjs');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/gen-dev-hash.js <username> <password>');
  process.exit(1);
}

// Matches electron/devAuth.ts, which compares the username lowercase +
// trimmed — hashing it the same way here means the login check is a
// straight bcrypt.compare with no extra normalization at compare time.
const COST = 12;
const usernameHash = bcrypt.hashSync(username.trim().toLowerCase(), COST);
const passwordHash = bcrypt.hashSync(password, COST);

console.log('\nPaste these into electron/devConfig.ts (replacing the placeholders):\n');
console.log(`export const DEV_USERNAME_HASH = '${usernameHash}';`);
console.log(`export const DEV_PASSWORD_HASH = '${passwordHash}';`);
console.log('\nUsername is matched lowercase + trimmed; password is matched exactly as typed.\n');
