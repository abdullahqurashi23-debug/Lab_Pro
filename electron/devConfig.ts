// Developer-only credentials for the one-time Developer Setup gate (first
// launch) and the later hidden Developer Access panel (Ctrl+Shift+Alt+D on
// the login screen). Only bcrypt hashes live here — never the real
// username or password in plain text, so grepping a decompiled/inspected
// build never reveals them.
//
// Generate real values with:
//   node scripts/gen-dev-hash.js <username> <password>
// and paste the two printed hashes in below, replacing the placeholders,
// BEFORE building the installer. Do not commit the real username/password
// anywhere — only these two hashes belong in the repo.
//
// The placeholders below are real bcrypt hashes of fixed dummy strings —
// syntactically valid so bcrypt.compare never throws, but guaranteed to
// never match anything a person actually types. Until real hashes are
// pasted in, Developer Setup/Access can never be logged into on a build
// made from this file as-is.
export const DEV_USERNAME_HASH = '$2a$12$prZ/4EH3fXsCSQA/jPzNyOv0aAN8T/1JsZAMMiK/qdeh9KpBZz24.';
export const DEV_PASSWORD_HASH = '$2a$12$g9/NLBFi7IaIvw8a8pjRn.FVQI5A2r/YFwdpHldZrV8CPnwysiHIa';

// Shown at the bottom of the Developer Setup screen so whoever is
// physically installing LabCore (not necessarily the developer) knows who
// to contact if they weren't expecting it. Plain text is fine here — it's
// contact info, not a secret.
export const DEV_NAME = 'Abdullah Qurashi';
export const DEV_CONTACT = '0093 779699597';
