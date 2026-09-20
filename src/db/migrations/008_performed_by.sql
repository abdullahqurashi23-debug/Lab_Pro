-- An explicit "who actually performed this test" field, entered at report
-- time — distinct from finalized_by (the software account that clicked
-- Finalize, tracked for audit/security purposes). In a small lab the
-- person running the test and the person finalizing it in the software
-- are often different people, so the printed report needs its own field
-- for it rather than only ever showing the finalizing account's name.
ALTER TABLE reports ADD COLUMN performed_by TEXT DEFAULT '';
