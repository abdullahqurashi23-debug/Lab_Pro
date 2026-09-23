-- The two-stage Developer Setup / Lab Setup Wizard flow (see
-- src/db/repositories/setup.ts) gates first launch on `settings.setup_completed`
-- rather than "does any user exist" — no new column needed, `settings` is
-- already a generic key/value table.
--
-- Backfill: an install that already completed the OLD setup flow (a real,
-- non-provisional user already exists) did so before this flag existed —
-- mark it done so upgrading an already-set-up install doesn't send it back
-- through setup and lock the lab out of their own software.
INSERT INTO settings (key, value)
SELECT 'setup_completed', 'true'
WHERE EXISTS (SELECT 1 FROM users WHERE is_provisional = 0)
ON CONFLICT(key) DO NOTHING;
